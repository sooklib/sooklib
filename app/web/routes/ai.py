"""
AI 路由
处理 AI 相关功能，如文件名分析、标签提取等
"""
import json
import asyncio
import uuid
from dataclasses import asdict
from typing import List, Optional, Dict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, Library, FilenamePattern, Tag, User
from app.web.routes.auth import get_current_admin, get_current_user
from app.utils.logger import log
from app.core.ai.service import get_ai_service
from app.core.ai.config import ai_config

router = APIRouter()

# ===== 内存任务存储 =====
# 注意：生产环境建议使用 Redis 或数据库
# 结构: task_id -> TaskInfo
analysis_tasks: Dict[str, dict] = {}

# ===== Pydantic 模型 =====

class FilenameAnalysisRequest(BaseModel):
    """文件名分析请求"""
    filenames: List[str]
    library_id: Optional[int] = None
    provider: str = "openai"  # openai, anthropic, ollama
    model: Optional[str] = None

class FilenameAnalysisResult(BaseModel):
    """文件名分析结果"""
    original: str
    title: str
    author: Optional[str] = None
    extra: Optional[str] = None
    tags: List[str] = []
    confidence: float

class BatchAnalysisResponse(BaseModel):
    """批量分析响应（同步）"""
    results: List[FilenameAnalysisResult]
    total: int
    success: int
    failed: int

class TaskResponse(BaseModel):
    """任务创建响应"""
    task_id: str
    status: str
    message: str

class TaskStatusResponse(BaseModel):
    """任务状态响应"""
    task_id: str
    status: str  # pending, running, completed, failed
    progress: float  # 0-100
    processed: int
    total: int
    results: Optional[List[FilenameAnalysisResult]] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None

# ===== 后台任务处理 =====

# 每批最大文件名数量
BATCH_SIZE = 200


async def process_batch_analysis(
    task_id: str, 
    filenames: List[str], 
    provider: str, 
    model: Optional[str]
):
    """处理批量分析后台任务 - 每次发送最多200条文件名给AI"""
    task = analysis_tasks.get(task_id)
    if not task:
        return

    task["status"] = "running"
    task["started_at"] = datetime.now()
    
    results = []
    
    ai_service = get_ai_service()
    
    try:
        total = len(filenames)
        # 分批处理，每批最多 BATCH_SIZE 条
        batch_count = (total + BATCH_SIZE - 1) // BATCH_SIZE
        
        for batch_idx in range(batch_count):
            # 检查任务是否被取消
            if task.get("status") == "cancelled":
                break
            
            # 计算当前批次的范围
            start_idx = batch_idx * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, total)
            batch_filenames = filenames[start_idx:end_idx]
            
            try:
                # 构建批量分析的 prompt
                filenames_list = "\n".join([f"{i+1}. {fn}" for i, fn in enumerate(batch_filenames)])
                
                prompt = f"""你是专业的小说文件名解析助手。分析文件名并提取书名、作者等元数据。只返回JSON格式数据。

请分析以下 {len(batch_filenames)} 个小说文件名，为每个文件名提取书名、作者和额外信息。

文件名列表：
{filenames_list}

请返回一个 JSON 数组，每个元素对应一个文件名的分析结果：
```json
[
    {{
        "index": 1,
        "title": "书名",
        "author": "作者(如果没有则为null)",
        "extra": "额外信息如卷数、状态(没有则为null)",
        "tags": ["标签1", "标签2"]
    }},
    ...
]
```

重要要求：
1. 必须返回 {len(batch_filenames)} 个结果，每个文件名一个
2. index 必须与输入的序号对应（从1开始）
3. 只返回 JSON 数组，不要其他内容
4. 如果无法识别书名，使用原文件名（去掉扩展名）作为 title
"""
                
                # 构造消息
                messages = [
                    {"role": "system", "content": "你是一个专业的文件名解析助手。只返回JSON格式数据。"},
                    {"role": "user", "content": prompt}
                ]
                
                # 使用 chat 方法
                response_obj = await ai_service.chat(
                    messages=messages,
                    # provider=provider,  # chat 方法通常使用配置中的 provider，或者这里需要适配
                    # model=model
                )
                
                if not response_obj.success:
                    raise Exception(response_obj.error)
                    
                response = response_obj.content
                
                # 解析 JSON 数组
                try:
                    # 尝试找到 JSON 数组部分
                    start = response.find('[')
                    end = response.rfind(']') + 1
                    if start >= 0 and end > start:
                        json_str = response[start:end]
                        batch_results = json.loads(json_str)
                        
                        # 创建 index 到结果的映射
                        result_map = {}
                        for item in batch_results:
                            idx = item.get("index", 0) - 1  # 转为0-based
                            if 0 <= idx < len(batch_filenames):
                                result_map[idx] = item
                        
                        # 按顺序添加结果
                        for i, filename in enumerate(batch_filenames):
                            if i in result_map:
                                data = result_map[i]
                                results.append({
                                    "original": filename,
                                    "title": data.get("title", filename),
                                    "author": data.get("author"),
                                    "extra": data.get("extra"),
                                    "tags": data.get("tags", []),
                                    "confidence": 0.85
                                })
                            else:
                                # AI 没有返回该文件的结果，使用默认值
                                results.append({
                                    "original": filename,
                                    "title": filename,
                                    "author": None,
                                    "extra": None,
                                    "tags": [],
                                    "confidence": 0.0,
                                    "error": "AI未返回此文件的结果"
                                })
                    else:
                        raise ValueError("AI响应中没有找到JSON数组")
                        
                except json.JSONDecodeError as e:
                    log.error(f"解析 AI 响应失败 (批次 {batch_idx+1}): {e}")
                    # 该批次全部标记为失败
                    for filename in batch_filenames:
                        results.append({
                            "original": filename,
                            "title": filename,
                            "author": None,
                            "tags": [],
                            "confidence": 0.0,
                            "error": f"JSON解析失败: {str(e)}"
                        })
                        
            except Exception as e:
                log.error(f"批次 {batch_idx+1} 分析失败: {e}")
                # 该批次全部标记为失败
                for filename in batch_filenames:
                    results.append({
                        "original": filename,
                        "title": filename,
                        "author": None,
                        "tags": [],
                        "confidence": 0.0,
                        "error": str(e)
                    })
            
            # 更新进度
            task["processed"] = end_idx
            task["progress"] = (end_idx / total) * 100
            task["results"] = results
            task["current_batch"] = batch_idx + 1
            task["total_batches"] = batch_count
            
            log.info(f"任务 {task_id}: 完成批次 {batch_idx + 1}/{batch_count}, 进度: {task['progress']:.1f}%")
            
            # 批次之间稍微延时，避免速率限制
            if batch_idx < batch_count - 1:
                await asyncio.sleep(1)
            
        task["status"] = "completed"
        task["completed_at"] = datetime.now()
        log.info(f"任务 {task_id}: 全部完成，共 {len(results)} 个结果")
        
    except Exception as e:
        log.error(f"批量分析任务失败: {task_id}, 错误: {e}")
        task["status"] = "failed"
        task["error"] = str(e)
        task["completed_at"] = datetime.now()

# ===== 路由处理 =====

@router.post("/analyze/filenames/batch", response_model=TaskResponse)
async def analyze_filenames_batch(
    request: FilenameAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin)
):
    """
    提交批量分析任务（后台运行）
    """
    ai_service = get_ai_service()
    if not ai_service.config.is_enabled():
        raise HTTPException(status_code=400, detail="AI 服务未启用")
        
    # 限制批量大小（虽然是后台任务，但也要防止过大）
    if len(request.filenames) > 500:
        raise HTTPException(status_code=400, detail="单次请求最多支持 500 个文件名")
    
    task_id = str(uuid.uuid4())
    
    analysis_tasks[task_id] = {
        "id": task_id,
        "status": "pending",
        "filenames": request.filenames,
        "total": len(request.filenames),
        "processed": 0,
        "progress": 0.0,
        "results": [],
        "created_at": datetime.now(),
        "provider": request.provider,
        "model": request.model
    }
    
    # 启动后台任务
    background_tasks.add_task(
        process_batch_analysis,
        task_id,
        request.filenames,
        request.provider,
        request.model
    )
    
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "任务已提交"
    }

@router.get("/analyze/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_admin)
):
    """获取任务状态"""
    task = analysis_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
        
    return {
        "task_id": task["id"],
        "status": task["status"],
        "progress": task["progress"],
        "processed": task["processed"],
        "total": task["total"],
        "results": task["results"],
        "created_at": task["created_at"],
        "completed_at": task.get("completed_at"),
        "error": task.get("error")
    }

@router.get("/analyze/tasks", response_model=List[TaskStatusResponse])
async def list_tasks(
    status: Optional[str] = None,
    limit: int = 10,
    current_user: User = Depends(get_current_admin)
):
    """获取任务列表"""
    tasks = list(analysis_tasks.values())
    
    # 排序：最新的在前
    tasks.sort(key=lambda x: x["created_at"], reverse=True)
    
    if status:
        tasks = [t for t in tasks if t["status"] == status]
        
    # 分页
    tasks = tasks[:limit]
    
    # 构建响应（不返回详细结果以减少流量）
    response = []
    for task in tasks:
        response.append({
            "task_id": task["id"],
            "status": task["status"],
            "progress": task["progress"],
            "processed": task["processed"],
            "total": task["total"],
            "results": None, # 列表页不返回详细结果
            "created_at": task["created_at"],
            "completed_at": task.get("completed_at"),
            "error": task.get("error")
        })
        
    return response

@router.delete("/analyze/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_admin)
):
    """删除任务记录"""
    if task_id in analysis_tasks:
        del analysis_tasks[task_id]
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="任务不存在")

# 保留旧的同步接口以兼容
@router.post("/analyze/filenames", response_model=BatchAnalysisResponse)
async def analyze_filenames(
    request: FilenameAnalysisRequest,
    current_user: User = Depends(get_current_admin)
):
    """
    使用 AI 批量分析文件名（同步接口，建议使用 batch 接口）
    """
    ai_service = get_ai_service()
    if not ai_service.config.is_enabled():
        raise HTTPException(status_code=400, detail="AI 服务未启用")
        
    results = []
    success_count = 0
    failed_count = 0
    
    # 限制批量大小
    if len(request.filenames) > 20:
        raise HTTPException(status_code=400, detail="单次请求最多支持 20 个文件名，请分批处理")
    
    for filename in request.filenames:
        try:
            # 调用 AI 分析
            prompt = f"""
            请分析以下小说文件名，提取书名、作者和额外信息。
            文件名：{filename}
            
            请返回 JSON 格式：
            {{
                "title": "书名",
                "author": "作者(如果没有则为null)",
                "extra": "额外信息(如卷数、状态等，没有则为null)",
                "tags": ["标签1", "标签2"]
            }}
            只返回 JSON，不要其他内容。
            """
            
            # 构造消息
            messages = [
                {"role": "system", "content": "你是一个专业的文件名解析助手。只返回JSON格式数据。"},
                {"role": "user", "content": prompt}
            ]
            
            response_obj = await ai_service.chat(
                messages=messages
            )
            
            if not response_obj.success:
                raise Exception(response_obj.error)
                
            response = response_obj.content
            
            # 解析 JSON
            try:
                # 尝试找到 JSON 部分
                start = response.find('{')
                end = response.rfind('}') + 1
                if start >= 0 and end > start:
                    json_str = response[start:end]
                    data = json.loads(json_str)
                    
                    results.append(FilenameAnalysisResult(
                        original=filename,
                        title=data.get("title", filename),
                        author=data.get("author"),
                        extra=data.get("extra"),
                        tags=data.get("tags", []),
                        confidence=0.8  # 模拟置信度
                    ))
                    success_count += 1
                else:
                    raise ValueError("无法解析 AI 响应")
            except Exception as e:
                log.error(f"解析 AI 响应失败: {e}, 响应: {response}")
                failed_count += 1
                results.append(FilenameAnalysisResult(
                    original=filename,
                    title=filename,
                    confidence=0.0
                ))
                
        except Exception as e:
            log.error(f"分析文件名失败: {filename}, 错误: {e}")
            failed_count += 1
            results.append(FilenameAnalysisResult(
                original=filename,
                title=filename,
                confidence=0.0
            ))
            
    return {
        "results": results,
        "total": len(request.filenames),
        "success": success_count,
        "failed": failed_count
    }

# ==================== Admin AI 配置管理 API ====================
# 这些 API 由前端 AITab.tsx 调用，路径为 /api/admin/ai/*

# 预设模型列表
PRESET_MODELS = {
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
        {"id": "gpt-4", "name": "GPT-4"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
    ],
    "claude": [
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
        {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
        {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
        {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
    ],
    "ollama": [
        {"id": "llama3.2", "name": "Llama 3.2"},
        {"id": "llama3.1", "name": "Llama 3.1"},
        {"id": "qwen2.5", "name": "Qwen 2.5"},
        {"id": "gemma2", "name": "Gemma 2"},
        {"id": "mistral", "name": "Mistral"},
    ],
    "custom": [
        {"id": "custom", "name": "自定义模型"},
    ],
}


class ProviderConfigUpdate(BaseModel):
    """更新 Provider 配置请求"""
    provider: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    timeout: Optional[int] = None
    sample_size: Optional[int] = None
    enabled: Optional[bool] = None


class FeaturesConfigUpdate(BaseModel):
    """更新 Features 配置请求"""
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
async def get_admin_ai_config(
    current_user: User = Depends(get_current_admin)
):
    """获取 AI 配置（管理员）"""
    return ai_config.to_dict()


@router.get("/models")
async def get_ai_models(
    current_user: User = Depends(get_current_admin)
):
    """获取预设模型列表"""
    return PRESET_MODELS


@router.put("/provider")
async def update_ai_provider(
    data: ProviderConfigUpdate,
    current_user: User = Depends(get_current_admin)
):
    """更新 AI Provider 配置"""
    update_data = data.model_dump(exclude_none=True)
    
    if update_data:
        ai_config.update_provider(**update_data)
        log.info(f"管理员 {current_user.username} 更新了 AI Provider 配置")
    
    return {"message": "配置已更新", "provider": asdict(ai_config.provider)}


@router.put("/features")
async def update_ai_features(
    data: FeaturesConfigUpdate,
    current_user: User = Depends(get_current_admin)
):
    """更新 AI Features 配置"""
    update_data = data.model_dump(exclude_none=True)
    
    if update_data:
        ai_config.update_features(**update_data)
        log.info(f"管理员 {current_user.username} 更新了 AI Features 配置")
    
    return {"message": "功能配置已更新", "features": asdict(ai_config.features)}


@router.post("/test")
async def test_ai_connection(
    current_user: User = Depends(get_current_admin)
):
    """测试 AI 连接"""
    try:
        if not ai_config.is_enabled():
            return {"success": False, "error": "AI 服务未启用或缺少 API 密钥"}
        
        ai_service = get_ai_service()
        
        # 发送一个简单的测试消息
        response = await ai_service.chat(
            messages=[
                {"role": "system", "content": "你是一个测试助手。"},
                {"role": "user", "content": "请回复 'OK' 以确认连接正常。"}
            ]
        )
        
        if response.success:
            return {"success": True, "message": "连接成功", "response": response.content[:100]}
        else:
            return {"success": False, "error": response.error or "未知错误"}
            
    except Exception as e:
        log.error(f"AI 连接测试失败: {e}")
        return {"success": False, "error": str(e)}


@router.post("/extract-metadata")
async def test_extract_metadata(
    filename: str = Query(..., description="要分析的文件名"),
    content_preview: Optional[str] = Query(None, description="内容预览"),
    current_user: User = Depends(get_current_admin)
):
    """测试元数据提取"""
    try:
        if not ai_config.is_enabled():
            return {"success": False, "error": "AI 服务未启用"}
        
        ai_service = get_ai_service()
        
        prompt = f"""请分析以下小说文件名，提取书名、作者和额外信息。
文件名：{filename}
"""
        if content_preview:
            prompt += f"\n内容预览：\n{content_preview[:500]}\n"
        
        prompt += """
请返回 JSON 格式：
{
    "title": "书名",
    "author": "作者(如果没有则为null)",
    "extra": "额外信息(如卷数、状态等，没有则为null)",
    "tags": ["标签1", "标签2"],
    "language": "语言(如 zh-CN)",
    "series": "系列名(如果有)"
}
只返回 JSON，不要其他内容。
"""
        
        response = await ai_service.chat(
            messages=[
                {"role": "system", "content": "你是一个专业的小说元数据分析助手。只返回JSON格式数据。"},
                {"role": "user", "content": prompt}
            ]
        )
        
        if not response.success:
            return {"success": False, "error": response.error}
        
        # 解析 JSON
        try:
            content = response.content
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                metadata = json.loads(content[start:end])
                return {"success": True, "metadata": metadata}
            else:
                return {"success": False, "error": "无法解析响应"}
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"JSON 解析失败: {e}"}
            
    except Exception as e:
        log.error(f"元数据提取测试失败: {e}")
        return {"success": False, "error": str(e)}


# ==================== 书库 AI/规则 提取 API ====================
# 这些 API 由 LibrariesTab.tsx 调用


@router.post("/libraries/{library_id}/ai-extract")
async def ai_extract_library_metadata(
    library_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    使用AI提取书库中书籍的元数据（预览模式）
    返回待变更列表供用户确认
    """
    # 验证书库
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    if not library:
        return {"success": False, "error": "书库不存在"}
    
    if not ai_config.is_enabled():
        return {"success": False, "error": "AI服务未启用"}
    
    ai_service = get_ai_service()
    
    # 获取书库中的书籍（只取未有作者的或需要优化标题的）
    from app.models import BookVersion
    query = (
        select(Book)
        .where(Book.library_id == library_id)
        .limit(ai_config.provider.sample_size or 50)
    )
    result = await db.execute(query)
    books = result.scalars().all()
    
    changes = []
    for book in books:
        # 获取主版本文件名
        version_result = await db.execute(
            select(BookVersion)
            .where(BookVersion.book_id == book.id)
            .where(BookVersion.is_primary == True)
        )
        version = version_result.scalar_one_or_none()
        filename = version.file_name if version else book.title
        
        try:
            # 调用 AI 分析
            messages = [
                {"role": "system", "content": "你是专业的小说文件名解析助手。只返回JSON格式数据。"},
                {"role": "user", "content": f"""请分析以下小说文件名，提取书名、作者。
文件名：{filename}

请返回 JSON 格式：
{{"title": "书名", "author": "作者(如果没有则为null)", "tags": ["标签1", "标签2"]}}
只返回 JSON，不要其他内容。"""}
            ]
            
            response = await ai_service.chat(messages=messages)
            if response.success:
                content = response.content
                start = content.find('{')
                end = content.rfind('}') + 1
                if start >= 0 and end > start:
                    data = json.loads(content[start:end])
                    
                    # 检查是否有变更
                    author_name = book.author.name if book.author else None
                    if data.get("title") != book.title or data.get("author") != author_name:
                        changes.append({
                            "book_id": book.id,
                            "filename": filename,
                            "current": {
                                "title": book.title,
                                "author": author_name
                            },
                            "extracted": {
                                "title": data.get("title"),
                                "author": data.get("author"),
                                "tags": data.get("tags", [])
                            }
                        })
        except Exception as e:
            log.error(f"AI分析书籍 {book.id} 失败: {e}")
            continue
    
    return {
        "success": True,
        "library_id": library_id,
        "library_name": library.name,
        "total_books": len(books),
        "sampled_count": len(books),
        "changes": changes
    }


@router.post("/libraries/{library_id}/ai-extract/apply")
async def apply_ai_extract(
    library_id: int,
    changes: List[dict] = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """应用AI提取的元数据变更"""
    from app.models import Author
    from pydantic import BaseModel
    
    class ApplyRequest(BaseModel):
        changes: List[dict]
    
    # 这里需要从请求体获取 changes
    from fastapi import Body
    # 临时处理：直接从参数获取
    
    if not changes:
        return {"success": False, "error": "没有变更数据"}
    
    applied_count = 0
    for change in changes:
        try:
            book_result = await db.execute(
                select(Book).where(Book.id == change["book_id"])
            )
            book = book_result.scalar_one_or_none()
            if not book:
                continue
            
            extracted = change.get("extracted", {})
            
            # 更新标题
            if extracted.get("title"):
                book.title = extracted["title"]
            
            # 更新作者
            if extracted.get("author"):
                author_result = await db.execute(
                    select(Author).where(Author.name == extracted["author"])
                )
                author = author_result.scalar_one_or_none()
                if not author:
                    author = Author(name=extracted["author"])
                    db.add(author)
                    await db.flush()
                book.author_id = author.id
            
            applied_count += 1
        except Exception as e:
            log.error(f"应用变更失败 book_id={change.get('book_id')}: {e}")
            continue
    
    await db.commit()
    
    return {
        "success": True,
        "applied_count": applied_count
    }


@router.post("/libraries/{library_id}/pattern-extract")
async def pattern_extract_library_metadata(
    library_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    使用文件名规则提取书库中书籍的元数据（预览模式）
    返回待变更列表供用户确认
    """
    import re
    
    # 验证书库
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    if not library:
        return {"success": False, "error": "书库不存在"}
    
    # 获取所有活跃的规则
    patterns_result = await db.execute(
        select(FilenamePattern)
        .where(FilenamePattern.is_active == True)
        .order_by(FilenamePattern.priority.desc())
    )
    patterns = patterns_result.scalars().all()
    
    if not patterns:
        return {"success": False, "error": "没有可用的文件名规则"}
    
    # 获取书库中的书籍
    from app.models import BookVersion
    query = select(Book).where(Book.library_id == library_id)
    result = await db.execute(query)
    books = result.scalars().all()
    
    changes = []
    matched_count = 0
    
    for book in books:
        # 获取主版本文件名
        version_result = await db.execute(
            select(BookVersion)
            .where(BookVersion.book_id == book.id)
            .where(BookVersion.is_primary == True)
        )
        version = version_result.scalar_one_or_none()
        filename = version.file_name if version else book.title
        
        # 尝试匹配规则
        for pattern in patterns:
            try:
                match = re.match(pattern.regex_pattern, filename)
                if match:
                    matched_count += 1
                    groups = match.groups()
                    
                    # 假设第1组是标题，第2组是作者（如果有）
                    extracted_title = groups[0].strip() if len(groups) > 0 else None
                    extracted_author = groups[1].strip() if len(groups) > 1 else None
                    
                    author_name = book.author.name if book.author else None
                    if extracted_title != book.title or extracted_author != author_name:
                        changes.append({
                            "book_id": book.id,
                            "filename": filename,
                            "pattern_name": pattern.name,
                            "current": {
                                "title": book.title,
                                "author": author_name
                            },
                            "extracted": {
                                "title": extracted_title,
                                "author": extracted_author
                            }
                        })
                    break  # 匹配到第一个规则就停止
            except Exception as e:
                log.error(f"规则 {pattern.name} 匹配失败: {e}")
                continue
    
    return {
        "success": True,
        "library_id": library_id,
        "library_name": library.name,
        "total_books": len(books),
        "matched_count": matched_count,
        "patterns_used": len(patterns),
        "changes": changes
    }


@router.post("/libraries/{library_id}/pattern-extract/apply")
async def apply_pattern_extract(
    library_id: int,
    changes: List[dict] = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """应用规则提取的元数据变更"""
    from app.models import Author
    
    if not changes:
        return {"success": False, "error": "没有变更数据"}
    
    applied_count = 0
    for change in changes:
        try:
            book_result = await db.execute(
                select(Book).where(Book.id == change["book_id"])
            )
            book = book_result.scalar_one_or_none()
            if not book:
                continue
            
            extracted = change.get("extracted", {})
            
            # 更新标题
            if extracted.get("title"):
                book.title = extracted["title"]
            
            # 更新作者
            if extracted.get("author"):
                author_result = await db.execute(
                    select(Author).where(Author.name == extracted["author"])
                )
                author = author_result.scalar_one_or_none()
                if not author:
                    author = Author(name=extracted["author"])
                    db.add(author)
                    await db.flush()
                book.author_id = author.id
            
            applied_count += 1
        except Exception as e:
            log.error(f"应用变更失败 book_id={change.get('book_id')}: {e}")
            continue
    
    await db.commit()
    
    return {
        "success": True,
        "applied_count": applied_count
    }


@router.post("/libraries/{library_id}/pattern-extract/apply-all")
async def apply_all_patterns_to_library(
    library_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    直接将所有匹配的规则应用到书库（不预览）
    """
    import re
    from app.models import Author, BookVersion
    
    # 验证书库
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    if not library:
        return {"success": False, "error": "书库不存在"}
    
    # 获取所有活跃的规则
    patterns_result = await db.execute(
        select(FilenamePattern)
        .where(FilenamePattern.is_active == True)
        .order_by(FilenamePattern.priority.desc())
    )
    patterns = patterns_result.scalars().all()
    
    if not patterns:
        return {"success": False, "error": "没有可用的文件名规则"}
    
    # 获取书库中的书籍
    query = select(Book).where(Book.library_id == library_id)
    result = await db.execute(query)
    books = result.scalars().all()
    
    applied_count = 0
    matched_count = 0
    
    for book in books:
        # 获取主版本文件名
        version_result = await db.execute(
            select(BookVersion)
            .where(BookVersion.book_id == book.id)
            .where(BookVersion.is_primary == True)
        )
        version = version_result.scalar_one_or_none()
        filename = version.file_name if version else book.title
        
        # 尝试匹配规则
        for pattern in patterns:
            try:
                match = re.match(pattern.regex_pattern, filename)
                if match:
                    matched_count += 1
                    groups = match.groups()
                    
                    extracted_title = groups[0].strip() if len(groups) > 0 else None
                    extracted_author = groups[1].strip() if len(groups) > 1 else None
                    
                    changed = False
                    
                    # 更新标题
                    if extracted_title and extracted_title != book.title:
                        book.title = extracted_title
                        changed = True
                    
                    # 更新作者
                    if extracted_author:
                        author_name = book.author.name if book.author else None
                        if extracted_author != author_name:
                            author_result = await db.execute(
                                select(Author).where(Author.name == extracted_author)
                            )
                            author = author_result.scalar_one_or_none()
                            if not author:
                                author = Author(name=extracted_author)
                                db.add(author)
                                await db.flush()
                            book.author_id = author.id
                            changed = True
                    
                    if changed:
                        applied_count += 1
                    
                    break  # 匹配到第一个规则就停止
            except Exception as e:
                log.error(f"规则 {pattern.name} 匹配失败: {e}")
                continue
    
    await db.commit()
    
    return {
        "success": True,
        "library_id": library_id,
        "library_name": library.name,
        "matched_count": matched_count,
        "applied_count": applied_count
    }


@router.post("/patterns/batch-analyze-library/{library_id}")
async def batch_analyze_library_with_ai(
    library_id: int,
    batch_size: int = 1000,
    apply_results: bool = False,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    使用AI批量分析书库中的文件名并生成规则
    """
    from app.models import BookVersion, Author
    import re
    
    # 验证书库
    result = await db.execute(select(Library).where(Library.id == library_id))
    library = result.scalar_one_or_none()
    if not library:
        return {"success": False, "error": "书库不存在"}
    
    # 获取书库中的文件名
    query = (
        select(BookVersion.file_name, Book.id, Book.title)
        .join(Book)
        .where(Book.library_id == library_id)
        .limit(batch_size)
    )
    result = await db.execute(query)
    rows = result.all()
    
    if not rows:
        return {"success": False, "error": "书库中没有书籍"}
    
    filenames = [row[0] for row in rows]
    book_map = {row[0]: {"id": row[1], "title": row[2]} for row in rows}
    
    # 使用 AI 分析生成规则
    ai_service = get_ai_service()
    if not ai_service.config.is_enabled():
        return {"success": False, "error": "AI服务未启用"}
    
    # 分批发送给 AI（每批200条）
    batch_limit = 200
    all_recognized = []
    generated_patterns = []
    
    for i in range(0, len(filenames), batch_limit):
        batch = filenames[i:i+batch_limit]
        
        try:
            filenames_list = "\n".join([f"{j+1}. {fn}" for j, fn in enumerate(batch)])
            prompt = f"""分析以下小说文件名，提取书名和作者。同时，如果发现多个文件名有相同的命名模式，请总结出正则表达式规则。

文件名列表：
{filenames_list}

请返回JSON格式：
{{
    "recognized": [
        {{"index": 1, "filename": "文件名", "title": "书名", "author": "作者或null", "review": "点评或null"}}
    ],
    "patterns": [
        {{"name": "规则名", "regex": "正则表达式", "title_group": 1, "author_group": 2, "match_count": 10}}
    ]
}}
只返回JSON。"""

            messages = [
                {"role": "system", "content": "你是专业的小说文件名分析助手。"},
                {"role": "user", "content": prompt}
            ]
            
            response = await ai_service.chat(messages=messages)
            if response.success:
                content = response.content
                start = content.find('{')
                end = content.rfind('}') + 1
                if start >= 0 and end > start:
                    data = json.loads(content[start:end])
                    
                    # 收集识别结果
                    for item in data.get("recognized", []):
                        idx = item.get("index", 0) - 1
                        if 0 <= idx < len(batch):
                            item["filename"] = batch[idx]
                            all_recognized.append(item)
                    
                    # 收集规则
                    for pattern in data.get("patterns", []):
                        if pattern.get("regex") and pattern.get("name"):
                            generated_patterns.append(pattern)
        except Exception as e:
            log.error(f"AI分析批次 {i//batch_limit + 1} 失败: {e}")
            continue
    
    # 创建新规则
    patterns_created = []
    for pattern_data in generated_patterns:
        try:
            # 检查规则是否已存在
            existing = await db.execute(
                select(FilenamePattern).where(FilenamePattern.name == pattern_data["name"])
            )
            if not existing.scalar_one_or_none():
                new_pattern = FilenamePattern(
                    name=pattern_data["name"],
                    regex_pattern=pattern_data["regex"],
                    priority=pattern_data.get("match_count", 0),
                    created_by="ai",
                    is_active=True
                )
                db.add(new_pattern)
                patterns_created.append(pattern_data["name"])
        except Exception as e:
            log.error(f"创建规则失败: {e}")
    
    # 应用结果
    applied_count = 0
    reviews_added = 0
    
    if apply_results:
        for item in all_recognized:
            filename = item.get("filename")
            if filename not in book_map:
                continue
            
            book_info = book_map[filename]
            try:
                book_result = await db.execute(
                    select(Book).where(Book.id == book_info["id"])
                )
                book = book_result.scalar_one_or_none()
                if not book:
                    continue
                
                # 更新标题
                if item.get("title") and item["title"] != book.title:
                    book.title = item["title"]
                    applied_count += 1
                
                # 更新作者
                if item.get("author"):
                    author_result = await db.execute(
                        select(Author).where(Author.name == item["author"])
                    )
                    author = author_result.scalar_one_or_none()
                    if not author:
                        author = Author(name=item["author"])
                        db.add(author)
                        await db.flush()
                    if book.author_id != author.id:
                        book.author_id = author.id
                        applied_count += 1
                
                # 添加点评到简介
                if item.get("review"):
                    if not book.description:
                        book.description = item["review"]
                    elif item["review"] not in book.description:
                        book.description = f"{book.description}\n\n{item['review']}"
                    reviews_added += 1
                    
            except Exception as e:
                log.error(f"应用结果失败 book_id={book_info['id']}: {e}")
    
    await db.commit()
    
    # 构建响应（限制返回数量避免过大）
    recognized_books = []
    for item in all_recognized[:100]:
        recognized_books.append({
            "filename": item.get("filename", ""),
            "title": item.get("title"),
            "author": item.get("author"),
            "has_review": bool(item.get("review")),
            "review_text": item.get("review")
        })
    
    return {
        "success": True,
        "total_filenames": len(filenames),
        "recognized_count": len(all_recognized),
        "recognized_books": recognized_books,
        "books_truncated": len(all_recognized) > 100,
        "patterns": generated_patterns,
        "patterns_created": patterns_created,
        "applied_count": applied_count,
        "reviews_added": reviews_added
    }


@router.post("/classify")
async def test_ai_classify(
    title: str = Query(..., description="书名"),
    content_preview: Optional[str] = Query(None, description="内容预览"),
    current_user: User = Depends(get_current_admin)
):
    """测试 AI 分类"""
    try:
        if not ai_config.is_enabled():
            return {"success": False, "error": "AI 服务未启用"}
        
        ai_service = get_ai_service()
        
        prompt = f"""请为以下小说进行分类并推荐标签。
书名：{title}
"""
        if content_preview:
            prompt += f"\n内容预览：\n{content_preview[:500]}\n"
        
        prompt += """
请返回 JSON 格式：
{
    "genre": "主要类型(如 玄幻、都市、言情、科幻等)",
    "sub_genre": "子类型",
    "tags": ["标签1", "标签2", "标签3"],
    "content_rating": "内容分级(general/teen/adult/r18)",
    "target_audience": "目标读者群(如 男频、女频、全年龄)",
    "mood": "整体风格(如 轻松、热血、虐心等)"
}
只返回 JSON，不要其他内容。
"""
        
        response = await ai_service.chat(
            messages=[
                {"role": "system", "content": "你是一个专业的小说分类助手。只返回JSON格式数据。"},
                {"role": "user", "content": prompt}
            ]
        )
        
        if not response.success:
            return {"success": False, "error": response.error}
        
        # 解析 JSON
        try:
            content = response.content
            start = content.find('{')
            end = content.rfind('}') + 1
            if start >= 0 and end > start:
                classification = json.loads(content[start:end])
                return {"success": True, "classification": classification}
            else:
                return {"success": False, "error": "无法解析响应"}
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"JSON 解析失败: {e}"}
            
    except Exception as e:
        log.error(f"AI 分类测试失败: {e}")
        return {"success": False, "error": str(e)}
