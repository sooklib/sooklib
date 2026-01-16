"""
管理员功能路由
包括文件名分析、规则管理、备份管理等
"""
import json
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import FilenamePattern, Library, LibraryPermission, Book, User
from app.web.routes.auth import get_current_user
from app.security import hash_password
from app.utils.filename_analyzer import FilenameAnalyzer
from app.utils.logger import log
from app.core.backup import backup_manager

router = APIRouter()


# Pydantic 模型
class PatternCreate(BaseModel):
    """创建规则请求"""
    name: str
    description: Optional[str] = None
    regex_pattern: str
    priority: int = 0
    example_filename: Optional[str] = None
    example_result: Optional[str] = None


class PatternUpdate(BaseModel):
    """更新规则请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    regex_pattern: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    example_filename: Optional[str] = None
    example_result: Optional[str] = None


class PatternResponse(BaseModel):
    """规则响应"""
    id: int
    name: str
    description: Optional[str]
    regex_pattern: str
    priority: int
    is_active: bool
    match_count: int
    success_count: int
    accuracy_rate: float
    created_by: str
    created_at: datetime
    updated_at: datetime
    example_filename: Optional[str]
    example_result: Optional[str]

    class Config:
        from_attributes = True


class AnalysisResult(BaseModel):
    """分析结果"""
    library_id: int
    library_name: str
    total_files: int
    analyzed_files: int
    patterns_found: dict
    suggested_patterns: List[dict]


# 权限检查装饰器
def admin_required(current_user: User = Depends(get_current_user)):
    """要求管理员权限"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


# ==================== 用户管理 API ====================

class UserCreate(BaseModel):
    """创建用户请求"""
    username: str
    password: str
    is_admin: bool = False
    age_rating_limit: str = "all"


class UserUpdate(BaseModel):
    """更新用户请求"""
    username: Optional[str] = None
    is_admin: Optional[bool] = None
    age_rating_limit: Optional[str] = None


class PasswordReset(BaseModel):
    """重置密码请求"""
    new_password: str


class LibraryAccessUpdate(BaseModel):
    """更新书库权限请求"""
    library_ids: List[int]


class UserResponse(BaseModel):
    """用户响应"""
    id: int
    username: str
    is_admin: bool
    age_rating_limit: str
    telegram_id: Optional[str]
    created_at: datetime
    library_count: int = 0

    class Config:
        from_attributes = True


@router.get("/admin/users", response_model=List[UserResponse])
async def list_users(
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户列表（管理员）
    """
    query = select(User)
    
    if search:
        query = query.where(User.username.like(f"%{search}%"))
    
    query = query.order_by(User.created_at.desc())
    
    # 分页
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    # 构建响应，添加书库权限数量
    response = []
    for user in users:
        # 统计用户有权访问的书库数量
        perm_count = await db.execute(
            select(func.count(LibraryPermission.id))
            .where(LibraryPermission.user_id == user.id)
        )
        library_count = perm_count.scalar()
        
        response.append({
            "id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "age_rating_limit": user.age_rating_limit,
            "telegram_id": user.telegram_id,
            "created_at": user.created_at,
            "library_count": library_count,
        })
    
    return response


@router.get("/admin/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户详情（管理员）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 统计用户有权访问的书库数量
    perm_count = await db.execute(
        select(func.count(LibraryPermission.id))
        .where(LibraryPermission.user_id == user.id)
    )
    library_count = perm_count.scalar()
    
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "age_rating_limit": user.age_rating_limit,
        "telegram_id": user.telegram_id,
        "created_at": user.created_at,
        "library_count": library_count,
    }


@router.post("/admin/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    创建新用户（管理员）
    """
    # 检查用户名是否已存在
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 创建用户
    user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        is_admin=user_data.is_admin,
        age_rating_limit=user_data.age_rating_limit,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    log.info(f"管理员 {current_user.username} 创建了用户: {user.username}")
    
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "age_rating_limit": user.age_rating_limit,
        "telegram_id": user.telegram_id,
        "created_at": user.created_at,
        "library_count": 0,
    }


@router.put("/admin/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户信息（管理员）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 不能修改自己的管理员状态
    if user.id == current_user.id and user_data.is_admin is not None:
        if not user_data.is_admin:
            raise HTTPException(status_code=400, detail="不能取消自己的管理员权限")
    
    # 更新字段
    if user_data.username is not None:
        # 检查新用户名是否已存在
        existing = await db.execute(
            select(User).where(User.username == user_data.username).where(User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="用户名已存在")
        user.username = user_data.username
    
    if user_data.is_admin is not None:
        user.is_admin = user_data.is_admin
    
    if user_data.age_rating_limit is not None:
        user.age_rating_limit = user_data.age_rating_limit
    
    await db.commit()
    await db.refresh(user)
    
    # 统计书库权限数量
    perm_count = await db.execute(
        select(func.count(LibraryPermission.id))
        .where(LibraryPermission.user_id == user.id)
    )
    library_count = perm_count.scalar()
    
    log.info(f"管理员 {current_user.username} 更新了用户: {user.username}")
    
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "age_rating_limit": user.age_rating_limit,
        "telegram_id": user.telegram_id,
        "created_at": user.created_at,
        "library_count": library_count,
    }


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    删除用户（管理员）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 不能删除自己
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账户")
    
    username = user.username
    await db.delete(user)
    await db.commit()
    
    log.info(f"管理员 {current_user.username} 删除了用户: {username}")
    
    return {"message": "用户已删除", "username": username}


@router.put("/admin/users/{user_id}/password")
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    重置用户密码（管理员）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    user.password_hash = hash_password(password_data.new_password)
    await db.commit()
    
    log.info(f"管理员 {current_user.username} 重置了用户 {user.username} 的密码")
    
    return {"message": "密码已重置", "username": user.username}


# ==================== 书库权限管理 API ====================

@router.get("/admin/users/{user_id}/library-access")
async def get_user_library_access(
    user_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户的书库访问权限（管理员）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取所有书库
    all_libraries = await db.execute(select(Library))
    libraries = all_libraries.scalars().all()
    
    # 获取用户有权限的书库
    user_perms = await db.execute(
        select(LibraryPermission.library_id)
        .where(LibraryPermission.user_id == user_id)
    )
    accessible_ids = set(row[0] for row in user_perms)
    
    # 构建响应
    library_access = []
    for lib in libraries:
        library_access.append({
            "library_id": lib.id,
            "library_name": lib.name,
            "has_access": lib.id in accessible_ids or lib.is_public,
            "is_public": lib.is_public,
        })
    
    return {
        "user_id": user_id,
        "username": user.username,
        "is_admin": user.is_admin,
        "libraries": library_access,
    }


@router.put("/admin/users/{user_id}/library-access")
async def update_user_library_access(
    user_id: int,
    access_data: LibraryAccessUpdate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户的书库访问权限（管理员）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 删除现有权限
    await db.execute(
        select(LibraryPermission)
        .where(LibraryPermission.user_id == user_id)
    )
    existing_perms = await db.execute(
        select(LibraryPermission).where(LibraryPermission.user_id == user_id)
    )
    for perm in existing_perms.scalars().all():
        await db.delete(perm)
    
    # 添加新权限
    for lib_id in access_data.library_ids:
        # 验证书库存在
        lib_result = await db.execute(
            select(Library).where(Library.id == lib_id)
        )
        if lib_result.scalar_one_or_none():
            perm = LibraryPermission(
                user_id=user_id,
                library_id=lib_id,
            )
            db.add(perm)
    
    await db.commit()
    
    log.info(
        f"管理员 {current_user.username} 更新了用户 {user.username} 的书库权限: "
        f"{len(access_data.library_ids)} 个书库"
    )
    
    return {
        "message": "书库权限已更新",
        "user_id": user_id,
        "library_count": len(access_data.library_ids),
    }


@router.get("/admin/libraries/{library_id}/users")
async def get_library_users(
    library_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书库的授权用户列表（管理员）
    """
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    # 获取有权限的用户
    perms = await db.execute(
        select(LibraryPermission)
        .where(LibraryPermission.library_id == library_id)
    )
    permissions = perms.scalars().all()
    
    # 获取用户信息
    users = []
    for perm in permissions:
        user_result = await db.execute(
            select(User).where(User.id == perm.user_id)
        )
        user = user_result.scalar_one_or_none()
        if user:
            users.append({
                "user_id": user.id,
                "username": user.username,
                "is_admin": user.is_admin,
                "granted_at": perm.created_at,
            })
    
    # 获取所有管理员（管理员可以访问所有书库）
    admin_result = await db.execute(
        select(User).where(User.is_admin == True)
    )
    admins = admin_result.scalars().all()
    
    return {
        "library_id": library_id,
        "library_name": library.name,
        "is_public": library.is_public,
        "authorized_users": users,
        "admin_count": len(admins),
    }


@router.put("/admin/libraries/{library_id}/public")
async def toggle_library_public(
    library_id: int,
    is_public: bool,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    切换书库的公开状态（管理员）
    """
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    library.is_public = is_public
    await db.commit()
    
    log.info(
        f"管理员 {current_user.username} 将书库 {library.name} "
        f"设置为{'公开' if is_public else '私有'}"
    )
    
    return {
        "library_id": library_id,
        "library_name": library.name,
        "is_public": is_public,
    }


@router.post("/admin/analyze-library/{library_id}", response_model=AnalysisResult)
async def analyze_library_filenames(
    library_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    触发文件名分析（管理员）
    分析书库中的文件名模式并生成建议的正则表达式规则
    """
    # 检查书库是否存在
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    # 获取书库中的所有书籍版本
    from app.models import BookVersion
    result = await db.execute(
        select(BookVersion)
        .join(Book)
        .where(Book.library_id == library_id)
    )
    versions = result.scalars().all()
    
    if not versions:
        raise HTTPException(status_code=400, detail="书库中没有书籍")
    
    # 收集文件名
    filenames = [version.file_name for version in versions]
    
    # 分析文件名
    analyzer = FilenameAnalyzer()
    analysis = analyzer.analyze_filenames(filenames)
    
    # 生成建议的规则
    suggested_patterns = []
    
    # 基于分隔符模式生成规则
    for sep, stats in analysis['separators'].items():
        if stats['count'] >= 5:  # 至少5个文件使用该分隔符
            suggested_patterns.append({
                'name': f'Pattern with separator "{sep}"',
                'regex_pattern': analyzer.generate_pattern_suggestion(sep, stats),
                'priority': stats['count'],  # 使用次数作为优先级
                'example_filename': stats.get('examples', [''])[0] if stats.get('examples') else '',
                'coverage': f"{stats['count']} files ({stats['percentage']:.1f}%)"
            })
    
    log.info(f"管理员 {current_user.username} 分析了书库 {library.name} 的文件名")
    
    return AnalysisResult(
        library_id=library.id,
        library_name=library.name,
        total_files=len(filenames),
        analyzed_files=len(filenames),
        patterns_found=analysis,
        suggested_patterns=suggested_patterns
    )


@router.get("/admin/filename-patterns", response_model=List[PatternResponse])
async def get_filename_patterns(
    active_only: bool = False,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有文件名解析规则（管理员）
    """
    query = select(FilenamePattern)
    
    if active_only:
        query = query.where(FilenamePattern.is_active == True)
    
    query = query.order_by(FilenamePattern.priority.desc(), FilenamePattern.created_at.desc())
    
    result = await db.execute(query)
    patterns = result.scalars().all()
    
    return patterns


@router.post("/admin/filename-patterns", response_model=PatternResponse)
async def create_filename_pattern(
    pattern_data: PatternCreate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    创建新的文件名解析规则（管理员）
    """
    # 创建规则
    pattern = FilenamePattern(
        name=pattern_data.name,
        description=pattern_data.description,
        regex_pattern=pattern_data.regex_pattern,
        priority=pattern_data.priority,
        created_by='manual',
        example_filename=pattern_data.example_filename,
        example_result=pattern_data.example_result
    )
    
    db.add(pattern)
    await db.commit()
    await db.refresh(pattern)
    
    log.info(f"管理员 {current_user.username} 创建了文件名规则: {pattern.name}")
    
    return pattern


@router.get("/admin/filename-patterns/{pattern_id}", response_model=PatternResponse)
async def get_filename_pattern(
    pattern_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个文件名解析规则详情（管理员）
    """
    result = await db.execute(
        select(FilenamePattern).where(FilenamePattern.id == pattern_id)
    )
    pattern = result.scalar_one_or_none()
    
    if not pattern:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    return pattern


@router.put("/admin/filename-patterns/{pattern_id}", response_model=PatternResponse)
async def update_filename_pattern(
    pattern_id: int,
    pattern_data: PatternUpdate,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    更新文件名解析规则（管理员）
    """
    result = await db.execute(
        select(FilenamePattern).where(FilenamePattern.id == pattern_id)
    )
    pattern = result.scalar_one_or_none()
    
    if not pattern:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    # 更新字段
    if pattern_data.name is not None:
        pattern.name = pattern_data.name
    if pattern_data.description is not None:
        pattern.description = pattern_data.description
    if pattern_data.regex_pattern is not None:
        pattern.regex_pattern = pattern_data.regex_pattern
    if pattern_data.priority is not None:
        pattern.priority = pattern_data.priority
    if pattern_data.is_active is not None:
        pattern.is_active = pattern_data.is_active
    if pattern_data.example_filename is not None:
        pattern.example_filename = pattern_data.example_filename
    if pattern_data.example_result is not None:
        pattern.example_result = pattern_data.example_result
    
    pattern.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(pattern)
    
    log.info(f"管理员 {current_user.username} 更新了文件名规则: {pattern.name}")
    
    return pattern


@router.delete("/admin/filename-patterns/{pattern_id}")
async def delete_filename_pattern(
    pattern_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    删除文件名解析规则（管理员）
    """
    result = await db.execute(
        select(FilenamePattern).where(FilenamePattern.id == pattern_id)
    )
    pattern = result.scalar_one_or_none()
    
    if not pattern:
        raise HTTPException(status_code=404, detail="规则不存在")
    
    pattern_name = pattern.name
    
    await db.delete(pattern)
    await db.commit()
    
    log.info(f"管理员 {current_user.username} 删除了文件名规则: {pattern_name}")
    
    return {"message": "规则已删除", "pattern_name": pattern_name}


@router.get("/admin/filename-patterns/stats/summary")
async def get_patterns_stats(
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取文件名规则统计信息（管理员）
    """
    # 总规则数
    result = await db.execute(select(func.count(FilenamePattern.id)))
    total_patterns = result.scalar()
    
    # 活跃规则数
    result = await db.execute(
        select(func.count(FilenamePattern.id)).where(FilenamePattern.is_active == True)
    )
    active_patterns = result.scalar()
    
    # 总匹配次数
    result = await db.execute(select(func.sum(FilenamePattern.match_count)))
    total_matches = result.scalar() or 0
    
    # 总成功次数
    result = await db.execute(select(func.sum(FilenamePattern.success_count)))
    total_success = result.scalar() or 0
    
    # 平均准确率
    result = await db.execute(select(func.avg(FilenamePattern.accuracy_rate)))
    avg_accuracy = result.scalar() or 0
    
    return {
        "total_patterns": total_patterns,
        "active_patterns": active_patterns,
        "inactive_patterns": total_patterns - active_patterns,
        "total_matches": total_matches,
        "total_success": total_success,
        "average_accuracy": round(avg_accuracy, 2)
    }


# 封面管理 API

@router.post("/admin/covers/refresh/{book_id}")
async def refresh_book_cover(
    book_id: int,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    重新提取书籍封面（管理员）
    """
    from pathlib import Path
    from app.core.metadata.epub_parser import EpubParser
    from app.core.metadata.mobi_parser import MobiParser
    
    # 获取书籍
    result = await db.execute(
        select(Book).where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    file_path = Path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="书籍文件不存在")
    
    # 根据格式提取封面
    cover_path = None
    file_format = book.file_format.lower()
    
    try:
        if file_format == '.epub':
            parser = EpubParser()
            import ebooklib
            from ebooklib import epub
            epub_book = epub.read_epub(str(file_path))
            cover_path = parser._extract_cover(epub_book, file_path)
        elif file_format in ['.mobi', '.azw3']:
            parser = MobiParser()
            import mobi
            tempdir, _ = mobi.extract(str(file_path))
            cover_path = parser._extract_cover(tempdir, file_path)
            import shutil
            shutil.rmtree(tempdir, ignore_errors=True)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式: {file_format}"
            )
        
        # 更新数据库
        if cover_path:
            book.cover_path = cover_path
            await db.commit()
            
            log.info(f"管理员 {current_user.username} 重新提取了书籍 {book.title} 的封面")
            return {"message": "封面已更新", "cover_path": cover_path}
        else:
            return {"message": "未找到封面", "cover_path": None}
            
    except Exception as e:
        log.error(f"重新提取封面失败: {book_id}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"提取封面失败: {str(e)}")


@router.post("/admin/covers/batch-extract")
async def batch_extract_covers(
    library_id: Optional[int] = None,
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    批量提取缺失的封面（管理员）
    可选择指定书库，否则处理所有书籍
    """
    # 查询没有封面的书籍
    query = select(Book).where(Book.cover_path.is_(None))
    
    if library_id:
        query = query.where(Book.library_id == library_id)
    
    result = await db.execute(query)
    books = result.scalars().all()
    
    if not books:
        return {"message": "没有需要提取封面的书籍", "count": 0}
    
    # 这里应该使用后台任务处理，暂时返回统计
    count = len(books)
    
    log.info(f"管理员 {current_user.username} 触发了批量封面提取，共 {count} 本书")
    
    return {
        "message": f"已加入队列，将处理 {count} 本书",
        "count": count,
        "note": "批量提取功能需要后台任务支持，当前仅返回统计"
    }


@router.get("/admin/covers/stats")
async def get_cover_stats(
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    获取封面缓存统计（管理员）
    """
    from app.utils.cover_manager import cover_manager
    
    # 获取缓存统计
    cache_stats = await cover_manager.get_cache_stats()
    
    # 数据库统计
    result = await db.execute(select(func.count(Book.id)))
    total_books = result.scalar()
    
    result = await db.execute(
        select(func.count(Book.id)).where(Book.cover_path.isnot(None))
    )
    books_with_cover = result.scalar()
    
    result = await db.execute(
        select(func.count(Book.id)).where(Book.cover_path.is_(None))
    )
    books_without_cover = result.scalar()
    
    return {
        "database": {
            "total_books": total_books,
            "books_with_cover": books_with_cover,
            "books_without_cover": books_without_cover,
            "coverage_rate": round(books_with_cover / total_books * 100, 2) if total_books > 0 else 0
        },
        "cache": cache_stats
    }


@router.delete("/admin/covers/cleanup")
async def cleanup_orphaned_covers(
    current_user: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    """
    清理孤立的封面文件（管理员）
    删除数据库中不存在的封面文件
    """
    from app.utils.cover_manager import cover_manager
    
    deleted_count = await cover_manager.clear_orphaned_covers(db)
    
    log.info(f"管理员 {current_user.username} 清理了 {deleted_count} 个孤立封面")
    
    return {
        "message": f"已清理 {deleted_count} 个孤立封面文件",
        "deleted_count": deleted_count
    }


# ==================== 备份管理 API ====================

class BackupCreateRequest(BaseModel):
    """创建备份请求"""
    includes: Optional[List[str]] = None
    description: Optional[str] = ""


class BackupRestoreRequest(BaseModel):
    """恢复备份请求"""
    backup_id: str
    includes: Optional[List[str]] = None
    create_snapshot: bool = True


@router.post("/admin/backup/create")
async def create_backup(
    request: BackupCreateRequest,
    current_user: User = Depends(admin_required)
):
    """
    创建备份（管理员）
    
    参数：
    - includes: 可选，备份内容列表 ["database", "covers", "config"]
    - description: 可选，备份描述
    """
    try:
        result = await backup_manager.create_backup(
            includes=request.includes,
            description=request.description
        )
        
        log.info(
            f"管理员 {current_user.username} 创建了备份: {result['backup_id']}, "
            f"包含: {result['includes']}"
        )
        
        return result
        
    except Exception as e:
        log.error(f"创建备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建备份失败: {str(e)}")


@router.get("/admin/backup/list")
async def list_backups(
    current_user: User = Depends(admin_required)
):
    """
    获取所有备份列表（管理员）
    
    返回：
    - 备份列表，包含文件名、大小、创建时间等信息
    """
    try:
        backups = await backup_manager.list_backups()
        return {
            "backups": backups,
            "total": len(backups)
        }
        
    except Exception as e:
        log.error(f"获取备份列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取备份列表失败: {str(e)}")


@router.get("/admin/backup/download/{backup_id}")
async def download_backup(
    backup_id: str,
    current_user: User = Depends(admin_required)
):
    """
    下载备份文件（管理员）
    
    参数：
    - backup_id: 备份ID
    """
    from pathlib import Path
    
    backup_file = Path(backup_manager.backup_dir) / f"{backup_id}.zip"
    
    if not backup_file.exists():
        raise HTTPException(status_code=404, detail="备份文件不存在")
    
    log.info(f"管理员 {current_user.username} 下载了备份: {backup_id}")
    
    return FileResponse(
        path=str(backup_file),
        filename=f"{backup_id}.zip",
        media_type="application/zip"
    )


@router.delete("/admin/backup/{backup_id}")
async def delete_backup(
    backup_id: str,
    current_user: User = Depends(admin_required)
):
    """
    删除备份文件（管理员）
    
    参数：
    - backup_id: 备份ID
    """
    try:
        deleted = await backup_manager.delete_backup(backup_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="备份文件不存在")
        
        log.info(f"管理员 {current_user.username} 删除了备份: {backup_id}")
        
        return {
            "message": "备份已删除",
            "backup_id": backup_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"删除备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除备份失败: {str(e)}")


@router.post("/admin/backup/restore")
async def restore_backup(
    request: BackupRestoreRequest,
    current_user: User = Depends(admin_required)
):
    """
    恢复备份（管理员）
    
    ⚠️ 警告：此操作将覆盖现有数据！
    建议在恢复前先创建快照（create_snapshot=True）
    
    参数：
    - backup_id: 备份ID
    - includes: 可选，要恢复的内容，None 表示全部
    - create_snapshot: 是否在恢复前创建快照（默认 true）
    """
    try:
        # 验证备份
        validation = await backup_manager.validate_backup(request.backup_id)
        if not validation["valid"]:
            raise HTTPException(
                status_code=400,
                detail=f"备份验证失败: {validation.get('error')}"
            )
        
        # 执行恢复
        result = await backup_manager.restore_backup(
            backup_id=request.backup_id,
            includes=request.includes,
            create_snapshot=request.create_snapshot
        )
        
        log.warning(
            f"管理员 {current_user.username} 恢复了备份: {request.backup_id}, "
            f"恢复内容: {result['restored']}, "
            f"快照: {result.get('snapshot_id', 'None')}"
        )
        
        return result
        
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"恢复备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"恢复备份失败: {str(e)}")


@router.get("/admin/backup/validate/{backup_id}")
async def validate_backup(
    backup_id: str,
    current_user: User = Depends(admin_required)
):
    """
    验证备份文件完整性（管理员）
    
    参数：
    - backup_id: 备份ID
    """
    try:
        result = await backup_manager.validate_backup(backup_id)
        return result
        
    except Exception as e:
        log.error(f"验证备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"验证备份失败: {str(e)}")


@router.get("/admin/backup/stats")
async def get_backup_stats(
    current_user: User = Depends(admin_required)
):
    """
    获取备份统计信息（管理员）
    
    返回：
    - 备份总数、总大小、最新备份等统计信息
    """
    try:
        stats = await backup_manager.get_backup_stats()
        return stats
        
    except Exception as e:
        log.error(f"获取备份统计失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取备份统计失败: {str(e)}")


# ==================== 定时备份调度器管理 API ====================

class ScheduleUpdateRequest(BaseModel):
    """更新调度计划请求"""
    schedule: str  # Cron 表达式


@router.get("/admin/backup/scheduler/status")
async def get_scheduler_status(
    current_user: User = Depends(admin_required)
):
    """
    获取定时备份调度器状态（管理员）
    
    返回：
    - running: 调度器是否运行中
    - auto_backup_enabled: 自动备份是否启用
    - schedule: 当前 Cron 表达式
    - next_run: 下次执行时间
    - last_run: 上次执行时间
    - last_status: 上次执行状态
    - last_error: 上次错误信息（如果有）
    """
    from app.core.scheduler import backup_scheduler
    
    try:
        status = backup_scheduler.get_status()
        return status
        
    except Exception as e:
        log.error(f"获取调度器状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取调度器状态失败: {str(e)}")


@router.post("/admin/backup/scheduler/trigger")
async def trigger_backup_now(
    current_user: User = Depends(admin_required)
):
    """
    立即手动触发一次定时备份（管理员）
    
    不影响定时计划，立即执行一次备份任务
    """
    from app.core.scheduler import backup_scheduler
    
    try:
        result = await backup_scheduler.trigger_backup_now()
        
        log.info(f"管理员 {current_user.username} 手动触发了定时备份任务")
        
        return result
        
    except Exception as e:
        log.error(f"触发备份任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"触发备份任务失败: {str(e)}")


@router.post("/admin/backup/scheduler/enable")
async def enable_auto_backup(
    request: Optional[ScheduleUpdateRequest] = None,
    current_user: User = Depends(admin_required)
):
    """
    启用自动备份（管理员）
    
    参数：
    - schedule: 可选，新的 Cron 表达式
    
    如果不提供 schedule，使用当前配置的计划
    """
    from app.core.scheduler import backup_scheduler
    
    try:
        schedule = request.schedule if request else None
        
        await backup_scheduler.enable_auto_backup(schedule=schedule)
        
        log.info(
            f"管理员 {current_user.username} 启用了自动备份"
            + (f", 计划: {schedule}" if schedule else "")
        )
        
        status = backup_scheduler.get_status()
        
        return {
            "message": "自动备份已启用",
            "status": status
        }
        
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"启用自动备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"启用自动备份失败: {str(e)}")


@router.post("/admin/backup/scheduler/disable")
async def disable_auto_backup(
    current_user: User = Depends(admin_required)
):
    """
    禁用自动备份（管理员）
    
    停止定时备份任务，但不影响调度器运行
    """
    from app.core.scheduler import backup_scheduler
    
    try:
        await backup_scheduler.disable_auto_backup()
        
        log.info(f"管理员 {current_user.username} 禁用了自动备份")
        
        status = backup_scheduler.get_status()
        
        return {
            "message": "自动备份已禁用",
            "status": status
        }
        
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"禁用自动备份失败: {e}")
        raise HTTPException(status_code=500, detail=f"禁用自动备份失败: {str(e)}")


@router.put("/admin/backup/scheduler/schedule")
async def update_backup_schedule(
    request: ScheduleUpdateRequest,
    current_user: User = Depends(admin_required)
):
    """
    更新自动备份计划（管理员）
    
    参数：
    - schedule: 新的 Cron 表达式
    
    Cron 表达式格式：分 时 日 月 星期
    示例：
    - "0 2 * * *" - 每天凌晨2点
    - "0 */6 * * *" - 每6小时
    - "0 0 * * 0" - 每周日午夜
    """
    from app.core.scheduler import backup_scheduler
    
    try:
        await backup_scheduler.update_schedule(request.schedule)
        
        log.info(
            f"管理员 {current_user.username} 更新了备份计划: {request.schedule}"
        )
        
        status = backup_scheduler.get_status()
        
        return {
            "message": "备份计划已更新",
            "schedule": request.schedule,
            "status": status
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"更新备份计划失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新备份计划失败: {str(e)}")
