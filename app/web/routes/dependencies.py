"""
API 依赖注入
提供常用的依赖注入函数
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Book, Library, User
from app.utils.permissions import check_content_rating, check_library_access
from app.web.routes.auth import get_current_user


async def get_accessible_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Book:
    """
    获取用户有权访问的书籍
    
    Args:
        book_id: 书籍 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        Book: 书籍对象
        
    Raises:
        HTTPException: 书籍不存在或无权访问
    """
    result = await db.execute(
        select(Book)
        .options(
            selectinload(Book.author),
            selectinload(Book.versions),
            selectinload(Book.book_tags),
        )
        .where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="书籍不存在"
        )
    
    if not await check_library_access(current_user, book.library_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此书籍"
        )

    if not await check_content_rating(current_user, book, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此书籍"
        )
    
    return book


async def get_accessible_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Library:
    """
    获取用户有权访问的书库
    
    Args:
        library_id: 书库 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        Library: 书库对象
        
    Raises:
        HTTPException: 书库不存在或无权访问
    """
    library = await db.get(Library, library_id)
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="书库不存在"
        )
    
    if not await check_library_access(current_user, library_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此书库"
        )
    
    return library
