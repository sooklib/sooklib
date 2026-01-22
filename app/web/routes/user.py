"""
用户个人功能路由
处理收藏、个人标签等用户数据
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import Book, Favorite, User, UserBookTag
from app.web.routes.auth import get_current_user
from app.web.routes.dependencies import get_accessible_book
from app.utils.logger import log
from app.bot.handlers import generate_bind_code, cleanup_expired_codes
from app.config import settings
from app.web.routes.settings import load_telegram_settings
from app.security import verify_password, hash_password

router = APIRouter()


# ===== Pydantic 模型 =====

class FavoriteResponse(BaseModel):
    """收藏响应"""
    id: int
    book_id: int
    book_title: str
    author_name: Optional[str] = None
    created_at: str
    
    class Config:
        from_attributes = True


class PersonalTagCreate(BaseModel):
    """创建个人标签请求"""
    tag_name: str


class PersonalTagResponse(BaseModel):
    """个人标签响应"""
    id: int
    book_id: int
    book_title: str
    tag_name: str
    created_at: str
    
    class Config:
        from_attributes = True


class UserSettingsUpdate(BaseModel):
    """用户设置更新请求"""
    age_rating_limit: Optional[str] = None  # 'all', 'teen', 'adult'
    kindle_email: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    """修改密码请求"""
    current_password: str
    new_password: str
    confirm_password: Optional[str] = None


# ===== 收藏管理 =====

@router.post("/favorites/{book_id}")
async def add_favorite(
    book_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    添加书籍到收藏夹
    
    Args:
        book_id: 书籍 ID
        book: 书籍对象（通过依赖注入验证权限）
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    # 检查是否已收藏
    result = await db.execute(
        select(Favorite)
        .where(Favorite.user_id == current_user.id)
        .where(Favorite.book_id == book_id)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该书籍已在收藏夹中"
        )
    
    # 添加收藏
    favorite = Favorite(
        user_id=current_user.id,
        book_id=book_id
    )
    db.add(favorite)
    await db.commit()
    await db.refresh(favorite)
    
    log.info(f"用户 {current_user.username} 收藏了书籍 {book.title}")
    
    return {
        "status": "success",
        "favorite_id": favorite.id,
        "book_id": book_id,
        "book_title": book.title
    }


@router.delete("/favorites/{book_id}")
async def remove_favorite(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    从收藏夹移除书籍
    
    Args:
        book_id: 书籍 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    result = await db.execute(
        select(Favorite)
        .where(Favorite.user_id == current_user.id)
        .where(Favorite.book_id == book_id)
    )
    favorite = result.scalar_one_or_none()
    
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="收藏记录不存在"
        )
    
    await db.delete(favorite)
    await db.commit()
    
    log.info(f"用户 {current_user.username} 取消收藏书籍 {book_id}")
    
    return {"status": "success", "message": "已从收藏夹移除"}


@router.get("/favorites", response_model=List[FavoriteResponse])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户的收藏列表
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        收藏列表
    """
    result = await db.execute(
        select(Favorite, Book)
        .join(Book, Favorite.book_id == Book.id)
        .options(joinedload(Book.author))
        .where(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc())
    )
    favorites = result.all()
    
    response = []
    for favorite, book in favorites:
        response.append({
            "id": favorite.id,
            "book_id": book.id,
            "book_title": book.title,
            "author_name": book.author.name if book.author else None,
            "created_at": favorite.created_at.isoformat()
        })
    
    return response


@router.get("/favorites/{book_id}/check")
async def check_favorite(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    检查书籍是否已收藏
    
    Args:
        book_id: 书籍 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        是否已收藏
    """
    result = await db.execute(
        select(Favorite)
        .where(Favorite.user_id == current_user.id)
        .where(Favorite.book_id == book_id)
    )
    favorite = result.scalar_one_or_none()
    
    return {
        "is_favorite": favorite is not None,
        "favorite_id": favorite.id if favorite else None
    }


# ===== 个人标签管理 =====

@router.post("/my-tags/{book_id}")
async def add_personal_tag(
    book_id: int,
    tag_data: PersonalTagCreate,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    为书籍添加个人标签
    
    Args:
        book_id: 书籍 ID
        tag_data: 标签数据
        book: 书籍对象（通过依赖注入验证权限）
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    # 验证标签名称
    tag_name = tag_data.tag_name.strip()
    if not tag_name or len(tag_name) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="标签名称无效（长度应在1-50字符之间）"
        )
    
    # 检查是否已存在相同标签
    result = await db.execute(
        select(UserBookTag)
        .where(UserBookTag.user_id == current_user.id)
        .where(UserBookTag.book_id == book_id)
        .where(UserBookTag.tag_name == tag_name)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该标签已存在"
        )
    
    # 添加个人标签
    user_tag = UserBookTag(
        user_id=current_user.id,
        book_id=book_id,
        tag_name=tag_name
    )
    db.add(user_tag)
    await db.commit()
    await db.refresh(user_tag)
    
    log.info(f"用户 {current_user.username} 为书籍 {book.title} 添加了个人标签 {tag_name}")
    
    return {
        "status": "success",
        "tag_id": user_tag.id,
        "book_id": book_id,
        "tag_name": tag_name
    }


@router.delete("/my-tags/{tag_id}")
async def remove_personal_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    删除个人标签
    
    Args:
        tag_id: 标签 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    result = await db.execute(
        select(UserBookTag)
        .where(UserBookTag.id == tag_id)
        .where(UserBookTag.user_id == current_user.id)
    )
    user_tag = result.scalar_one_or_none()
    
    if not user_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    await db.delete(user_tag)
    await db.commit()
    
    log.info(f"用户 {current_user.username} 删除了个人标签 {user_tag.tag_name}")
    
    return {"status": "success", "message": "标签已删除"}


@router.get("/my-tags", response_model=List[PersonalTagResponse])
async def list_personal_tags(
    book_id: Optional[int] = None,
    tag_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取个人标签列表
    
    Args:
        book_id: 可选的书籍 ID 过滤
        tag_name: 可选的标签名称过滤
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        个人标签列表
    """
    query = select(UserBookTag, Book).join(Book, UserBookTag.book_id == Book.id).where(UserBookTag.user_id == current_user.id)
    
    if book_id:
        query = query.where(UserBookTag.book_id == book_id)
    
    if tag_name:
        query = query.where(UserBookTag.tag_name.like(f"%{tag_name}%"))
    
    query = query.order_by(UserBookTag.created_at.desc())
    
    result = await db.execute(query)
    tags = result.all()
    
    response = []
    for user_tag, book in tags:
        response.append({
            "id": user_tag.id,
            "book_id": book.id,
            "book_title": book.title,
            "tag_name": user_tag.tag_name,
            "created_at": user_tag.created_at.isoformat()
        })
    
    return response


@router.get("/my-tags/books/{book_id}")
async def get_book_personal_tags(
    book_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍的所有个人标签
    
    Args:
        book_id: 书籍 ID
        book: 书籍对象（通过依赖注入验证权限）
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        个人标签列表
    """
    result = await db.execute(
        select(UserBookTag)
        .where(UserBookTag.user_id == current_user.id)
        .where(UserBookTag.book_id == book_id)
        .order_by(UserBookTag.created_at.desc())
    )
    tags = result.scalars().all()
    
    return {
        "book_id": book_id,
        "tags": [
            {
                "id": tag.id,
                "tag_name": tag.tag_name,
                "created_at": tag.created_at.isoformat()
            }
            for tag in tags
        ]
    }


# ===== 阅读历史 =====

@router.get("/reading-history")
async def get_reading_history(
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取阅读历史记录（按最后阅读时间倒序）
    
    Args:
        page: 页码
        limit: 每页数量
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        阅读历史列表
    """
    from app.models import ReadingProgress, Author
    
    # 查询阅读进度，按最后阅读时间倒序
    query = (
        select(ReadingProgress, Book)
        .join(Book, ReadingProgress.book_id == Book.id)
        .options(joinedload(Book.author))
        .where(ReadingProgress.user_id == current_user.id)
        .order_by(ReadingProgress.last_read_at.desc())
    )
    
    # 获取所有记录
    result = await db.execute(query)
    all_records = result.all()
    
    # 分页
    total = len(all_records)
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    start = (page - 1) * limit
    end = start + limit
    paginated_records = all_records[start:end]
    
    # 构建响应
    history = []
    for progress, book in paginated_records:
        history.append({
            "book_id": book.id,
            "book_title": book.title,
            "author_name": book.author.name if book.author else None,
            "progress": progress.progress,
            "finished": progress.finished,
            "last_read_at": progress.last_read_at.isoformat()
        })
    
    return {
        "history": history,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


# ===== 用户设置 =====

@router.get("/settings")
async def get_user_settings(
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户设置
    
    Args:
        current_user: 当前用户
        
    Returns:
        用户设置
    """
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "age_rating_limit": current_user.age_rating_limit,
        "kindle_email": current_user.kindle_email,
        "created_at": current_user.created_at.isoformat()
    }


@router.put("/settings")
async def update_user_settings(
    settings_data: UserSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    更新用户设置
    
    Args:
        settings_data: 设置数据
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    # 更新年龄分级限制
    if settings_data.age_rating_limit is not None:
        valid_ratings = ['all', 'teen', 'adult']
        if settings_data.age_rating_limit not in valid_ratings:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"无效的年龄分级，必须是: {', '.join(valid_ratings)}"
            )
        current_user.age_rating_limit = settings_data.age_rating_limit

    # 更新 Kindle 收件邮箱
    if settings_data.kindle_email is not None:
        email = settings_data.kindle_email.strip()
        if not email:
            current_user.kindle_email = None
        else:
            if "@" not in email or len(email) > 255:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="无效的 Kindle 邮箱地址"
                )
            current_user.kindle_email = email
    
    await db.commit()
    
    log.info(f"用户 {current_user.username} 更新了设置")
    
    return {
        "status": "success",
        "age_rating_limit": current_user.age_rating_limit
    }


@router.put("/password")
async def change_password(
    password_data: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    修改当前用户密码
    
    Args:
        password_data: 密码变更数据
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码不正确"
        )

    if password_data.confirm_password is not None and password_data.new_password != password_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="两次输入的新密码不一致"
        )

    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度至少为 6 位"
        )

    if verify_password(password_data.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码不能与当前密码相同"
        )

    current_user.password_hash = hash_password(password_data.new_password)
    await db.commit()

    log.info(f"用户 {current_user.username} 修改了密码")

    return {"status": "success", "message": "密码已更新"}


# ===== Telegram 绑定管理 =====

@router.post("/telegram/bind-code")
async def generate_telegram_bind_code(
    current_user: User = Depends(get_current_user)
):
    """
    生成 Telegram 绑定授权码
    
    Args:
        current_user: 当前用户
        
    Returns:
        绑定码和过期时间
    """
    # 从动态配置读取 Telegram 启用状态
    tg_settings = load_telegram_settings()
    bot_enabled = tg_settings.get("enabled", False) and bool(tg_settings.get("bot_token", ""))
    
    if not bot_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram Bot 未启用"
        )
    
    # 清理过期的绑定码
    cleanup_expired_codes()
    
    # 生成新的绑定码
    bind_code = generate_bind_code(current_user.id)
    
    log.info(f"用户 {current_user.username} 生成了 Telegram 绑定码")
    
    # 绑定码过期时间（默认5分钟）
    bind_code_expiry = 300
    
    return {
        "status": "success",
        "bind_code": bind_code,
        "expires_in": bind_code_expiry,
        "instructions": [
            "1. 打开 Telegram",
            "2. 搜索并打开 Bot",
            f"3. 发送: /bind {bind_code}",
            f"4. 绑定码将在 {bind_code_expiry // 60} 分钟后过期"
        ]
    }


@router.get("/telegram/status")
async def get_telegram_binding_status(
    current_user: User = Depends(get_current_user)
):
    """
    获取 Telegram 绑定状态
    
    Args:
        current_user: 当前用户
        
    Returns:
        绑定状态
    """
    # 从动态配置读取 Telegram 启用状态
    tg_settings = load_telegram_settings()
    bot_enabled = tg_settings.get("enabled", False) and bool(tg_settings.get("bot_token", ""))
    
    return {
        "is_bound": current_user.telegram_id is not None,
        "telegram_id": current_user.telegram_id,
        "bot_enabled": bot_enabled
    }


@router.delete("/telegram/unbind")
async def unbind_telegram(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    解除 Telegram 绑定
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    if not current_user.telegram_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未绑定 Telegram 账号"
        )
    
    telegram_id = current_user.telegram_id
    current_user.telegram_id = None
    await db.commit()
    
    log.info(f"用户 {current_user.username} 解除了 Telegram 绑定 (ID: {telegram_id})")
    
    return {
        "status": "success",
        "message": "已解除 Telegram 绑定"
    }
