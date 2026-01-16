"""
AI 配置 API 路由
"""
import re
import json
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.web.routes.admin import admin_required
from app.core.ai.config import ai_config
from app.core.ai.service import get_ai_service
from app.models import FilenamePattern, Library, BookVersion, Book, Author


router = APIRouter(prefix="/api/admin/ai", tags=["AI管理"])


class ProviderUpdate(BaseModel):
    """AI提供商配置更新"""
    provider: Optional[str] = None  # openai, claude, ollama, custom
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    timeout: Optional[int] = None
    enabled: Optional[bool] = None


class FeaturesUpdate(BaseModel):
    """AI功能配置更新"""
    metadata_enhancement: Optional[bool] = None
    auto_extract_title: Optional[bool] = None
    auto_extract_author: Optional[bool] = None
    auto_generate_summary: Optional[bool] = None
    smart_classification: Optional[bool] = None
    auto_tagging: Optional[bool] = None
    content_rating: Optional[bool] = None
    semantic_search: Optional[bool] = None
    batch_limit: Optional[int] = None
    daily_limit: Optional[int] = None


@router.get("/config")
async def get_ai_config(admin = Depends(admin_required)):
    """获取AI配置"""
    return ai_config.to_dict()


@router.get("/status")
async def get_ai_status(admin = Depends(admin_required)):
    """获取AI状态"""
    return ai_config.get_status()


@router.put("/provider")
async def update_provider(data: ProviderUpdate, admin = Depends(admin_required)):
    """更新AI提供商配置"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="没有要更新的数据")
    
    ai_config.update_provider(**update_data)
    return {"message": "配置已更新", "config": ai_config.to_dict()['provider']}


@router.put("/features")
async def update_features(data: FeaturesUpdate, admin = Depends(admin_required)):
    """更新AI功能配置"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="没有要更新的数据")
    
    ai_config.update_features(**update_data)
    return {"message": "配置已更新", "config": ai_config.to_dict()['features']}


@router.post("/test")
async def test_connection(admin = Depends(admin_required)):
    """测试AI连接"""
    if not ai_config.is_enabled():
        raise HTTPException(status_code=400, detail="AI功能未启用，请先配置API密钥")
    
    service = get_ai_service()
    result = await service.test_connection()
    
    if result.success:
        return {
            "success": True,
            "message": "连接成功",
            "response": result.content,
            "usage": result.usage
        }
    else:
        return {
            "success": False,
            "message": "连接失败",
            "error": result.error
        }


@router.post("/extract-metadata")
async def extract_metadata(
    filename: str,
    content_preview: str = "",
    admin = Depends(admin_required)
):
    """使用AI提取元数据（测试）"""
    if not ai_config.is_enabled():
        raise HTTPException(status_code=400, detail="AI功能未启用")
    
    service = get_ai_service()
    result = await service.extract_metadata(filename, content_preview)
    
    return {
        "success": bool(result),
        "metadata": result
    }


@router.post("/classify")
async def classify_book(
    title: str,
    content_preview: str = "",
    admin = Depends(admin_required)
):
    """使用AI分类书籍（测试）"""
    if not ai_config.is_enabled():
        raise HTTPException(status_code=400, detail="AI功能未启用")
    
    service = get_ai_service()
    result = await service.classify_book(title, content_preview)
    
    return {
        "success": bool(result),
        "classification": result
    }


# 预设模型列表
PRESET_MODELS = {
    "openai": [
        {"id": "gpt-4", "name": "GPT-4"},
        {"id": "gpt-4-turbo-preview", "name": "GPT-4 Turbo"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
        {"id": "gpt-3.5-turbo-16k", "name": "GPT-3.5 Turbo 16K"},
    ],
    "claude": [
        {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
        {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
        {"id": "claude-2.1", "name": "Claude 2.1"},
    ],
    "ollama": [
        {"id": "llama2", "name": "Llama 2"},
        {"id": "llama3", "name": "Llama 3"},
        {"id": "mistral", "name": "Mistral"},
        {"id": "qwen", "name": "Qwen"},
        {"id": "yi", "name": "Yi"},
    ],
}


@router.get("/models")
async def get_models(provider: Optional[str] = None, admin = Depends(admin_required)):
    """获取预设模型列表"""
    if provider:
        return PRESET_MODELS.get(provider, [])
    return PRESET_MODELS


# ================== 文件名规则管理 ==================

class PatternCreate(BaseModel):
    """创建文件名规则"""
    name: str
    regex_pattern: str
    description: Optional[str] = None
    title_group: int = 1
    author_group: int = 2
    extra_group: int = 0
    priority: int = 0
    library_id: Optional[int] = None
    example_filename: Optional[str] = None


class PatternUpdate(BaseModel):
    """更新文件名规则"""
    name: Optional[str] = None
    regex_pattern: Optional[str] = None
    description: Optional[str] = None
    title_group: Optional[int] = None
    author_group: Optional[int] = None
    extra_group: Optional[int] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    library_id: Optional[int] = None
    example_filename: Optional[str] = None


@router.get("/patterns")
async def list_patterns(
    library_id: Optional[int] = None,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """获取所有文件名规则"""
    from sqlalchemy import or_
    
    query = select(FilenamePattern)
    
    if library_id:
        query = query.where(
            or_(FilenamePattern.library_id == library_id, FilenamePattern.library_id == None)
        )
    
    if active_only:
        query = query.where(FilenamePattern.is_active == True)
    
    query = query.order_by(FilenamePattern.priority.desc())
    result = await db.execute(query)
    patterns = result.scalars().all()
    
    return [{
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "regex_pattern": p.regex_pattern,
        "title_group": p.title_group,
        "author_group": p.author_group,
        "extra_group": p.extra_group,
        "priority": p.priority,
        "is_active": p.is_active,
        "library_id": p.library_id,
        "match_count": p.match_count,
        "success_count": p.success_count,
        "accuracy_rate": p.accuracy_rate,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "example_filename": p.example_filename,
        "example_result": json.loads(p.example_result) if p.example_result else None
    } for p in patterns]


@router.post("/patterns")
async def create_pattern(
    data: PatternCreate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """创建文件名规则"""
    # 验证正则表达式
    try:
        compiled = re.compile(data.regex_pattern)
        group_count = compiled.groups
        if data.title_group > group_count or data.author_group > group_count:
            raise HTTPException(400, f"正则表达式只有 {group_count} 个捕获组")
    except re.error as e:
        raise HTTPException(400, f"无效的正则表达式: {e}")
    
    # 如果有示例文件名，测试匹配
    example_result = None
    if data.example_filename:
        match = compiled.match(data.example_filename)
        if match:
            groups = match.groups()
            example_result = {
                "title": groups[data.title_group - 1] if data.title_group > 0 and data.title_group <= len(groups) else None,
                "author": groups[data.author_group - 1] if data.author_group > 0 and data.author_group <= len(groups) else None,
                "extra": groups[data.extra_group - 1] if data.extra_group > 0 and data.extra_group <= len(groups) else None
            }
    
    pattern = FilenamePattern(
        name=data.name,
        description=data.description,
        regex_pattern=data.regex_pattern,
        title_group=data.title_group,
        author_group=data.author_group,
        extra_group=data.extra_group,
        priority=data.priority,
        library_id=data.library_id,
        example_filename=data.example_filename,
        example_result=json.dumps(example_result, ensure_ascii=False) if example_result else None,
        created_by='manual'
    )
    
    db.add(pattern)
    await db.commit()
    await db.refresh(pattern)
    
    return {
        "id": pattern.id,
        "name": pattern.name,
        "message": "规则创建成功",
        "example_result": example_result
    }


@router.put("/patterns/{pattern_id}")
async def update_pattern(
    pattern_id: int,
    data: PatternUpdate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """更新文件名规则"""
    result = await db.execute(select(FilenamePattern).where(FilenamePattern.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(404, "规则不存在")
    
    # 验证新的正则表达式
    if data.regex_pattern:
        try:
            compiled = re.compile(data.regex_pattern)
            group_count = compiled.groups
            title_group = data.title_group or pattern.title_group
            author_group = data.author_group or pattern.author_group
            if title_group > group_count or author_group > group_count:
                raise HTTPException(400, f"正则表达式只有 {group_count} 个捕获组")
        except re.error as e:
            raise HTTPException(400, f"无效的正则表达式: {e}")
    
    # 更新字段
    for key, value in data.dict().items():
        if value is not None:
            setattr(pattern, key, value)
    
    # 重新测试示例
    if pattern.example_filename:
        compiled = re.compile(pattern.regex_pattern)
        match = compiled.match(pattern.example_filename)
        if match:
            groups = match.groups()
            example_result = {
                "title": groups[pattern.title_group - 1] if pattern.title_group > 0 and pattern.title_group <= len(groups) else None,
                "author": groups[pattern.author_group - 1] if pattern.author_group > 0 and pattern.author_group <= len(groups) else None,
                "extra": groups[pattern.extra_group - 1] if pattern.extra_group > 0 and pattern.extra_group <= len(groups) else None
            }
            pattern.example_result = json.dumps(example_result, ensure_ascii=False)
    
    await db.commit()
    
    return {"message": "规则更新成功"}


@router.delete("/patterns/{pattern_id}")
async def delete_pattern(
    pattern_id: int,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """删除文件名规则"""
    result = await db.execute(select(FilenamePattern).where(FilenamePattern.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(404, "规则不存在")
    
    await db.delete(pattern)
    await db.commit()
    
    return {"message": "规则删除成功"}


@router.post("/patterns/test")
async def test_pattern(
    regex_pattern: str,
    filename: str,
    title_group: int = 1,
    author_group: int = 2,
    extra_group: int = 0,
    admin = Depends(admin_required)
):
    """测试正则表达式匹配"""
    try:
        compiled = re.compile(regex_pattern)
    except re.error as e:
        return {"success": False, "error": f"无效的正则表达式: {e}"}
    
    match = compiled.match(filename)
    if not match:
        return {"success": False, "error": "不匹配", "matched": False}
    
    groups = match.groups()
    result = {
        "success": True,
        "matched": True,
        "groups": groups,
        "parsed": {
            "title": groups[title_group - 1] if title_group > 0 and title_group <= len(groups) else None,
            "author": groups[author_group - 1] if author_group > 0 and author_group <= len(groups) else None,
            "extra": groups[extra_group - 1] if extra_group > 0 and extra_group <= len(groups) else None
        }
    }
    
    return result


@router.post("/patterns/analyze-library/{library_id}")
async def analyze_library_patterns(
    library_id: int,
    use_ai: bool = True,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """分析书库文件名模式"""
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(404, "书库不存在")
    
    # 获取书库中的所有文件名
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(BookVersion).options(selectinload(BookVersion.book))
        .join(Book)
        .where(Book.library_id == library_id)
    )
    versions = result.scalars().all()
    
    if not versions:
        return {"success": False, "error": "书库中没有书籍"}
    
    filenames = [v.file_name for v in versions]
    
    if use_ai and ai_config.is_enabled():
        # 使用AI分析
        service = get_ai_service()
        ai_result = await service.analyze_filename_patterns(filenames)
        
        if ai_result.get("success"):
            # 可选：自动创建规则
            patterns_created = []
            for pattern_data in ai_result.get("patterns", []):
                if pattern_data.get("confidence", 0) >= 0.7:
                    # 检查规则是否已存在
                    check = await db.execute(
                        select(FilenamePattern).where(
                            FilenamePattern.regex_pattern == pattern_data.get("regex")
                        )
                    )
                    existing = check.scalar_one_or_none()
                    
                    if not existing:
                        pattern = FilenamePattern(
                            name=pattern_data.get("name", "AI生成规则"),
                            description=pattern_data.get("description"),
                            regex_pattern=pattern_data.get("regex"),
                            title_group=pattern_data.get("title_group", 1),
                            author_group=pattern_data.get("author_group", 2),
                            extra_group=pattern_data.get("extra_group", 0),
                            library_id=library_id,
                            created_by='ai',
                            example_filename=pattern_data.get("examples", [None])[0]
                        )
                        db.add(pattern)
                        patterns_created.append(pattern_data.get("name"))
            
            if patterns_created:
                await db.commit()
            
            ai_result["patterns_created"] = patterns_created
        
        return ai_result
    else:
        # 使用传统分析
        from app.utils.filename_analyzer import FilenameAnalyzer
        analyzer = FilenameAnalyzer()
        analyze_result = analyzer.analyze_filenames(filenames)
        analyze_result["ai_used"] = False
        return analyze_result


@router.post("/patterns/suggest")
async def suggest_pattern_for_filename(
    filename: str,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """为单个文件名建议规则"""
    if not ai_config.is_enabled():
        raise HTTPException(400, "AI功能未启用")
    
    # 获取现有规则
    result = await db.execute(
        select(FilenamePattern)
        .where(FilenamePattern.is_active == True)
        .order_by(FilenamePattern.priority.desc())
        .limit(5)
    )
    existing_patterns = result.scalars().all()
    
    existing = [{"name": p.name, "regex": p.regex_pattern} for p in existing_patterns]
    
    service = get_ai_service()
    suggest_result = await service.suggest_pattern_for_filename(filename, existing)
    
    return suggest_result


@router.post("/patterns/batch-analyze-library/{library_id}")
async def batch_analyze_library(
    library_id: int,
    batch_size: int = 1000,
    apply_results: bool = False,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """
    批量AI分析书库文件名（少次多量原则，防止429）
    
    - batch_size: 每批处理数量，默认1000
    - apply_results: 是否自动应用分析结果（更新书籍元数据）
    
    返回：识别的书名、作者、额外信息（包含点评）、生成的规则
    """
    if not ai_config.is_enabled():
        raise HTTPException(400, "AI功能未启用")
    
    lib_result = await db.execute(select(Library).where(Library.id == library_id))
    library = lib_result.scalar_one_or_none()
    if not library:
        raise HTTPException(404, "书库不存在")
    
    # 获取所有文件名
    from sqlalchemy.orm import selectinload
    version_result = await db.execute(
        select(BookVersion).options(
            selectinload(BookVersion.book).selectinload(Book.author)
        ).join(Book).where(Book.library_id == library_id)
    )
    versions = version_result.scalars().all()
    
    if not versions:
        return {"success": False, "error": "书库中没有书籍"}
    
    # 构建文件名到版本的映射
    filename_to_version = {v.file_name: v for v in versions}
    filenames = list(filename_to_version.keys())
    
    # 调用批量分析
    service = get_ai_service()
    result = await service.batch_analyze_filenames(filenames, batch_size=batch_size)
    
    if not result.get("success"):
        return result
    
    # 如果需要应用结果
    applied_count = 0
    reviews_added = 0
    
    if apply_results and result.get("recognized_books"):
        for book_info in result["recognized_books"]:
            filename = book_info.get("filename")
            if filename not in filename_to_version:
                continue
            
            version = filename_to_version[filename]
            book = version.book
            
            # 更新书名
            if book_info.get("title"):
                book.title = book_info["title"].strip()
                applied_count += 1
            
            # 更新作者
            if book_info.get("author"):
                author_name = book_info["author"].strip()
                # 查找或创建作者
                author_result = await db.execute(select(Author).where(Author.name == author_name))
                author = author_result.scalar_one_or_none()
                if not author:
                    author = Author(name=author_name)
                    db.add(author)
                    await db.flush()
                book.author_id = author.id
            
            # 如果有点评/评价，添加到简介
            if book_info.get("has_review") and book_info.get("review_text"):
                review_text = book_info["review_text"].strip()
                if book.description:
                    # 追加到现有简介
                    if review_text not in book.description:
                        book.description = f"{book.description}\n\n【读者评价】{review_text}"
                        reviews_added += 1
                else:
                    book.description = f"【读者评价】{review_text}"
                    reviews_added += 1
        
        await db.commit()
    
    # 保存生成的规则
    patterns_created = []
    for pattern_data in result.get("patterns", []):
        regex = pattern_data.get("regex")
        if not regex:
            continue
        
        # 检查规则是否已存在
        check_result = await db.execute(
            select(FilenamePattern).where(FilenamePattern.regex_pattern == regex)
        )
        existing = check_result.scalar_one_or_none()
        
        if not existing:
            try:
                # 验证正则表达式
                re.compile(regex)
                
                pattern = FilenamePattern(
                    name=pattern_data.get("name", "AI生成规则"),
                    regex_pattern=regex,
                    title_group=pattern_data.get("title_group", 1),
                    author_group=pattern_data.get("author_group", 2),
                    extra_group=pattern_data.get("extra_group", 0),
                    library_id=library_id,
                    match_count=pattern_data.get("match_count", 0),
                    created_by='ai'
                )
                db.add(pattern)
                patterns_created.append(pattern_data.get("name"))
            except:
                pass
    
    if patterns_created:
        await db.commit()
    
    result["patterns_created"] = patterns_created
    result["applied_count"] = applied_count
    result["reviews_added"] = reviews_added
    
    # 限制返回的书籍详情数量
    if len(result.get("recognized_books", [])) > 100:
        result["recognized_books"] = result["recognized_books"][:100]
        result["books_truncated"] = True
    
    return result


@router.post("/patterns/batch-apply")
async def batch_apply_patterns(
    library_id: int,
    dry_run: bool = True,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required)
):
    """批量应用规则到书库（重新解析文件名）"""
    from sqlalchemy import or_
    from sqlalchemy.orm import selectinload
    
    lib_result = await db.execute(select(Library).where(Library.id == library_id))
    library = lib_result.scalar_one_or_none()
    if not library:
        raise HTTPException(404, "书库不存在")
    
    # 获取规则
    patterns_result = await db.execute(
        select(FilenamePattern).where(
            FilenamePattern.is_active == True,
            or_(FilenamePattern.library_id == library_id, FilenamePattern.library_id == None)
        ).order_by(FilenamePattern.priority.desc())
    )
    patterns = patterns_result.scalars().all()
    
    if not patterns:
        return {"success": False, "error": "没有可用规则"}
    
    # 编译正则
    compiled_patterns = []
    for p in patterns:
        try:
            compiled_patterns.append({
                "pattern": p,
                "compiled": re.compile(p.regex_pattern)
            })
        except:
            pass
    
    # 获取所有书籍版本
    versions_result = await db.execute(
        select(BookVersion).options(
            selectinload(BookVersion.book).selectinload(Book.author)
        ).join(Book).where(Book.library_id == library_id)
    )
    versions = versions_result.scalars().all()
    
    results = {
        "total": len(versions),
        "matched": 0,
        "updated": 0,
        "details": []
    }
    
    for version in versions:
        filename = version.file_name
        
        for cp in compiled_patterns:
            match = cp["compiled"].match(filename)
            if match:
                groups = match.groups()
                p = cp["pattern"]
                
                parsed = {
                    "title": groups[p.title_group - 1] if p.title_group > 0 and p.title_group <= len(groups) else None,
                    "author": groups[p.author_group - 1] if p.author_group > 0 and p.author_group <= len(groups) else None,
                }
                
                detail = {
                    "filename": filename,
                    "pattern_name": p.name,
                    "parsed": parsed,
                    "current_title": version.book.title,
                    "current_author": version.book.author.name if version.book.author else None
                }
                
                results["matched"] += 1
                results["details"].append(detail)
                
                # 更新书籍（非dry_run模式）
                if not dry_run and parsed["title"]:
                    version.book.title = parsed["title"].strip()
                    results["updated"] += 1
                    
                    # 更新规则匹配统计
                    p.match_count = (p.match_count or 0) + 1
                    p.success_count = (p.success_count or 0) + 1
                
                break
    
    if not dry_run:
        await db.commit()
    
    # 限制返回详情数量
    if len(results["details"]) > 50:
        results["details"] = results["details"][:50]
        results["details_truncated"] = True
    
    return results
