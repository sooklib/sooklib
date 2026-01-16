"""
Dashboard API - Emby 风格首页数据接口
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    User, Book, BookVersion, Library, LibraryPermission, 
    ReadingProgress, Author, Favorite
)
from app.web.routes.dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["dashboard"])


# ============= 响应模型 =============

class LibrarySummary(BaseModel):
    id: int
    name: str
    book_count: int
    cover_url: Optional[str] = None
    
    class Config:
        from_attributes = True


class BookSummary(BaseModel):
    id: int
    title: str
    author_name: Optional[str] = None
    cover_url: Optional[str] = None
    is_new: bool = False  # 7天内新增
    added_at: Optional[datetime] = None
    file_format: Optional[str] = None
    
    class Config:
        from_attributes = True


class ContinueReadingItem(BaseModel):
    id: int
    title: str
    author_name: Optional[str] = None
    cover_url: Optional[str] = None
    progress: float  # 0.0 - 1.0
    last_read_at: datetime
    library_id: int
    library_name: str
    
    class Config:
        from_attributes = True


class LibraryLatest(BaseModel):
    library_id: int
    library_name: str
    books: List[BookSummary]


class DashboardResponse(BaseModel):
    continue_reading: List[ContinueReadingItem]
    libraries: List[LibrarySummary]
    latest_by_library: List[LibraryLatest]
    favorites_count: int = 0


# ============= 辅助函数 =============

async def get_user_accessible_libraries(db: AsyncSession, user: User) -> List[Library]:
    """获取用户可访问的书库列表"""
    if user.is_admin:
        result = await db.execute(select(Library))
        return list(result.scalars().all())
    
    # 公共书库
    result = await db.execute(
        select(Library).where(Library.is_public == True)
    )
    public_libraries = list(result.scalars().all())
    
    # 用户有权限的书库
    result = await db.execute(
        select(LibraryPermission.library_id).where(
            LibraryPermission.user_id == user.id
        )
    )
    permitted_library_ids = [row[0] for row in result.all()]
    
    permitted_libraries = []
    if permitted_library_ids:
        result = await db.execute(
            select(Library).where(Library.id.in_(permitted_library_ids))
        )
        permitted_libraries = list(result.scalars().all())
    
    # 合并并去重
    all_libraries = {lib.id: lib for lib in public_libraries}
    for lib in permitted_libraries:
        all_libraries[lib.id] = lib
    
    return list(all_libraries.values())


def book_to_summary(book: Book, base_url: str = "") -> BookSummary:
    """转换书籍为摘要格式"""
    # 获取主版本的格式
    file_format = None
    if hasattr(book, 'versions') and book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
        if primary_version:
            file_format = primary_version.file_format
    
    # 判断是否为新书（7天内添加）
    is_new = False
    if book.added_at:
        is_new = (datetime.utcnow() - book.added_at) < timedelta(days=7)
    
    return BookSummary(
        id=book.id,
        title=book.title,
        author_name=book.author.name if book.author else None,
        cover_url=f"{base_url}/books/{book.id}/cover",
        is_new=is_new,
        added_at=book.added_at,
        file_format=file_format
    )


# ============= API 端点 =============

@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取首页 Dashboard 数据
    
    返回:
    - continue_reading: 继续阅读列表（未完成的书籍，按最后阅读时间排序）
    - libraries: 用户可访问的书库列表
    - latest_by_library: 每个书库的最新书籍
    - favorites_count: 收藏数量
    """
    
    # 1. 获取用户可访问的书库
    accessible_libraries = await get_user_accessible_libraries(db, current_user)
    library_ids = [lib.id for lib in accessible_libraries]
    
    # 2. 构建书库摘要列表（包含书籍数量）
    libraries_summary = []
    for library in accessible_libraries:
        # 获取书籍数量
        result = await db.execute(
            select(func.count(Book.id)).where(Book.library_id == library.id)
        )
        book_count = result.scalar() or 0
        
        # 获取最新一本书作为封面
        result = await db.execute(
            select(Book).where(Book.library_id == library.id)
            .order_by(desc(Book.added_at)).limit(1)
        )
        latest_book = result.scalar_one_or_none()
        
        cover_url = f"/books/{latest_book.id}/cover" if latest_book else None
        
        libraries_summary.append(LibrarySummary(
            id=library.id,
            name=library.name,
            book_count=book_count,
            cover_url=cover_url
        ))
    
    # 3. 获取继续阅读列表（有进度但未完成的书籍）
    continue_reading = []
    result = await db.execute(
        select(ReadingProgress).options(
            selectinload(ReadingProgress.book).selectinload(Book.library),
            selectinload(ReadingProgress.book).selectinload(Book.author)
        ).where(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.finished == False,
            ReadingProgress.progress > 0
        ).order_by(desc(ReadingProgress.last_read_at)).limit(20)
    )
    reading_progress_list = result.scalars().all()
    
    for progress in reading_progress_list:
        book = progress.book
        if book and book.library_id in library_ids:
            continue_reading.append(ContinueReadingItem(
                id=book.id,
                title=book.title,
                author_name=book.author.name if book.author else None,
                cover_url=f"/books/{book.id}/cover",
                progress=progress.progress,
                last_read_at=progress.last_read_at,
                library_id=book.library_id,
                library_name=book.library.name
            ))
    
    # 4. 获取每个书库的最新书籍
    latest_by_library = []
    for library in accessible_libraries:
        result = await db.execute(
            select(Book).options(
                selectinload(Book.author),
                selectinload(Book.versions)
            ).where(Book.library_id == library.id)
            .order_by(desc(Book.added_at)).limit(10)
        )
        latest_books = list(result.scalars().all())
        
        if latest_books:
            latest_by_library.append(LibraryLatest(
                library_id=library.id,
                library_name=library.name,
                books=[book_to_summary(book) for book in latest_books]
            ))
    
    # 5. 获取收藏数量
    result = await db.execute(
        select(func.count(Favorite.id)).where(Favorite.user_id == current_user.id)
    )
    favorites_count = result.scalar() or 0
    
    return DashboardResponse(
        continue_reading=continue_reading,
        libraries=libraries_summary,
        latest_by_library=latest_by_library,
        favorites_count=favorites_count
    )


@router.get("/reading/continue", response_model=List[ContinueReadingItem])
async def get_continue_reading(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取继续阅读列表"""
    
    accessible_libraries = await get_user_accessible_libraries(db, current_user)
    library_ids = [lib.id for lib in accessible_libraries]
    
    result = await db.execute(
        select(ReadingProgress).options(
            selectinload(ReadingProgress.book).selectinload(Book.library),
            selectinload(ReadingProgress.book).selectinload(Book.author)
        ).where(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.finished == False,
            ReadingProgress.progress > 0
        ).order_by(desc(ReadingProgress.last_read_at)).limit(limit)
    )
    reading_progress_list = result.scalars().all()
    
    items = []
    for progress in reading_progress_list:
        book = progress.book
        if book and book.library_id in library_ids:
            items.append(ContinueReadingItem(
                id=book.id,
                title=book.title,
                author_name=book.author.name if book.author else None,
                cover_url=f"/books/{book.id}/cover",
                progress=progress.progress,
                last_read_at=progress.last_read_at,
                library_id=book.library_id,
                library_name=book.library.name
            ))
    
    return items


@router.get("/libraries", response_model=List[LibrarySummary])
async def get_libraries(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户可访问的书库列表"""
    
    accessible_libraries = await get_user_accessible_libraries(db, current_user)
    
    result = []
    for library in accessible_libraries:
        # 获取书籍数量
        count_result = await db.execute(
            select(func.count(Book.id)).where(Book.library_id == library.id)
        )
        book_count = count_result.scalar() or 0
        
        # 获取最新一本书作为封面
        book_result = await db.execute(
            select(Book).where(Book.library_id == library.id)
            .order_by(desc(Book.added_at)).limit(1)
        )
        latest_book = book_result.scalar_one_or_none()
        
        cover_url = f"/books/{latest_book.id}/cover" if latest_book else None
        
        result.append(LibrarySummary(
            id=library.id,
            name=library.name,
            book_count=book_count,
            cover_url=cover_url
        ))
    
    return result


@router.get("/libraries/{library_id}/latest", response_model=LibraryLatest)
async def get_library_latest(
    library_id: int,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取指定书库的最新书籍"""
    
    # 验证权限
    accessible_libraries = await get_user_accessible_libraries(db, current_user)
    library_ids = [lib.id for lib in accessible_libraries]
    
    if library_id not in library_ids:
        raise HTTPException(status_code=403, detail="无权访问此书库")
    
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    result = await db.execute(
        select(Book).options(
            selectinload(Book.author),
            selectinload(Book.versions)
        ).where(Book.library_id == library_id)
        .order_by(desc(Book.added_at)).limit(limit)
    )
    latest_books = list(result.scalars().all())
    
    return LibraryLatest(
        library_id=library.id,
        library_name=library.name,
        books=[book_to_summary(book) for book in latest_books]
    )
