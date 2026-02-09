"""
权限检查工具
提供书库和书籍访问权限验证
"""
import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Book, Library, LibraryPermission, User


async def check_library_access(
    user: User,
    library_id: int,
    db: AsyncSession
) -> bool:
    """
    检查用户是否有访问指定书库的权限
    
    Args:
        user: 用户对象
        library_id: 书库 ID
        db: 数据库会话
        
    Returns:
        bool: 是否有权限访问
    """
    # 管理员拥有所有权限
    if user.is_admin:
        return True
    
    # 检查书库是否存在
    library = await db.get(Library, library_id)
    if not library:
        return False
    
    # 检查书库是否为公共书库
    if library.is_public:
        return True
    
    # 检查用户权限表
    result = await db.execute(
        select(LibraryPermission)
        .where(LibraryPermission.user_id == user.id)
        .where(LibraryPermission.library_id == library_id)
    )
    permission = result.scalar_one_or_none()
    
    return permission is not None


async def check_book_access(
    user: User,
    book_id: int,
    db: AsyncSession
) -> bool:
    """
    检查用户是否有访问指定书籍的权限
    
    包含书库访问权限检查和内容分级检查
    
    Args:
        user: 用户对象
        book_id: 书籍 ID
        db: 数据库会话
        
    Returns:
        bool: 是否有权限访问
    """
    # 获取书籍所属书库（避免延迟加载 book_tags 引发 greenlet_spawn）
    result = await db.execute(
        select(Book)
        .options(selectinload(Book.book_tags))
        .where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        return False
    
    # 检查书库访问权限
    if not await check_library_access(user, book.library_id, db):
        return False
    
    # 检查内容分级限制
    return await check_content_rating(user, book, db)


async def check_content_rating(
    user: User,
    book: Book,
    db: AsyncSession
) -> bool:
    """
    检查内容分级是否符合用户限制
    
    Args:
        user: 用户对象
        book: 书籍对象
        db: 数据库会话
        
    Returns:
        bool: 内容是否符合用户限制
    """
    # 管理员无限制
    if user.is_admin:
        return True
    
    # 检查年龄分级
    rating_hierarchy = {
        'general': 0,
        'teen': 1,
        'adult': 2
    }
    
    user_limit = rating_hierarchy.get(user.age_rating_limit, 2)
    book_rating = rating_hierarchy.get(book.age_rating, 0)
    
    if book_rating > user_limit:
        return False
    
    # 检查被屏蔽的标签
    if user.blocked_tags:
        try:
            blocked_tag_ids = json.loads(user.blocked_tags)
            if blocked_tag_ids and book.book_tags:
                book_tag_ids = [bt.tag_id for bt in book.book_tags]
                if any(tag_id in blocked_tag_ids for tag_id in book_tag_ids):
                    return False
        except (json.JSONDecodeError, TypeError):
            pass
    
    return True


async def get_accessible_library_ids(
    user: User,
    db: AsyncSession
) -> list[int]:
    """
    获取用户有权访问的所有书库 ID 列表
    
    Args:
        user: 用户对象
        db: 数据库会话
        
    Returns:
        list[int]: 可访问的书库 ID 列表
    """
    # 管理员可访问所有书库
    if user.is_admin:
        result = await db.execute(select(Library.id))
        return [row[0] for row in result.all()]
    
    # 获取公共书库
    public_result = await db.execute(
        select(Library.id).where(Library.is_public == True)
    )
    public_library_ids = [row[0] for row in public_result.all()]
    
    # 获取用户被授权的书库
    permission_result = await db.execute(
        select(LibraryPermission.library_id)
        .where(LibraryPermission.user_id == user.id)
    )
    permission_library_ids = [row[0] for row in permission_result.all()]
    
    # 合并并去重
    all_library_ids = list(set(public_library_ids + permission_library_ids))
    
    return all_library_ids


async def filter_books_by_access(
    user: User,
    book_ids: list[int],
    db: AsyncSession
) -> list[int]:
    """
    过滤出用户有权访问的书籍 ID 列表
    
    Args:
        user: 用户对象
        book_ids: 要过滤的书籍 ID 列表
        db: 数据库会话
        
    Returns:
        list[int]: 用户有权访问的书籍 ID 列表
    """
    accessible_ids = []
    
    for book_id in book_ids:
        if await check_book_access(user, book_id, db):
            accessible_ids.append(book_id)
    
    return accessible_ids
