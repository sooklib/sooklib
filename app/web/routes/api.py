"""
API路由
提供REST API接口
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.scanner import Scanner
from app.database import get_db
from app.models import Author, Book, Library, ReadingProgress, User
from app.web.routes.auth import get_current_admin, get_current_user
from app.utils.logger import log

router = APIRouter()


# ===== Pydantic模型 =====

class LibraryCreate(BaseModel):
    """创建书库请求"""
    name: str
    path: str


class LibraryResponse(BaseModel):
    """书库响应"""
    id: int
    name: str
    path: str
    last_scan: Optional[str]
    
    class Config:
        from_attributes = True


class BookResponse(BaseModel):
    """书籍响应"""
    id: int
    title: str
    author_name: Optional[str] = None
    file_format: str
    file_size: int
    added_at: str
    
    class Config:
        from_attributes = True


class AuthorResponse(BaseModel):
    """作者响应"""
    id: int
    name: str
    book_count: int
    
    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    """进度更新请求"""
    progress: float
    position: Optional[str] = None
    finished: bool = False


class StatsResponse(BaseModel):
    """统计信息响应"""
    total_books: int
    total_authors: int
    total_libraries: int


# ===== 书库管理 =====

@router.get("/libraries", response_model=List[LibraryResponse])
async def list_libraries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取所有书库"""
    result = await db.execute(select(Library))
    libraries = result.scalars().all()
    return libraries


@router.post("/libraries", response_model=LibraryResponse)
async def create_library(
    library_data: LibraryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """创建新书库（需要管理员权限）"""
    library = Library(
        name=library_data.name,
        path=library_data.path
    )
    db.add(library)
    await db.commit()
    await db.refresh(library)
    
    log.info(f"创建书库: {library.name}")
    return library


@router.post("/libraries/{library_id}/scan")
async def scan_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """触发书库扫描（需要管理员权限）"""
    scanner = Scanner(db)
    
    try:
        stats = await scanner.scan_library(library_id)
        return {"status": "success", "stats": stats}
    except Exception as e:
        log.error(f"扫描失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/libraries/{library_id}")
async def delete_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """删除书库（需要管理员权限）"""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    
    if not library:
        raise HTTPException(status_code=404, detail="书库不存在")
    
    await db.delete(library)
    await db.commit()
    
    log.info(f"删除书库: {library.name}")
    return {"status": "success"}


# ===== 书籍管理 =====

@router.get("/books", response_model=List[BookResponse])
async def list_books(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    author_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取书籍列表"""
    query = select(Book).options(joinedload(Book.author))
    
    if author_id:
        query = query.where(Book.author_id == author_id)
    
    query = query.offset((page - 1) * limit).limit(limit)
    query = query.order_by(Book.added_at.desc())
    
    result = await db.execute(query)
    books = result.scalars().all()
    
    # 手动构建响应
    response = []
    for book in books:
        response.append({
            "id": book.id,
            "title": book.title,
            "author_name": book.author.name if book.author else None,
            "file_format": book.file_format,
            "file_size": book.file_size,
            "added_at": book.added_at.isoformat(),
        })
    
    return response


@router.get("/books/{book_id}")
async def get_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取书籍详情"""
    result = await db.execute(
        select(Book).where(Book.id == book_id).options(joinedload(Book.author))
    )
    book = result.scalar_one_or_none()
    
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    return {
        "id": book.id,
        "title": book.title,
        "author_name": book.author.name if book.author else None,
        "file_path": book.file_path,
        "file_format": book.file_format,
        "file_size": book.file_size,
        "description": book.description,
        "publisher": book.publisher,
        "added_at": book.added_at.isoformat(),
    }


# ===== 作者管理 =====

@router.get("/authors", response_model=List[AuthorResponse])
async def list_authors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取作者列表"""
    result = await db.execute(
        select(Author).order_by(Author.name)
    )
    authors = result.scalars().all()
    return authors


# ===== 阅读进度 =====

@router.get("/progress/{book_id}")
async def get_progress(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取阅读进度"""
    result = await db.execute(
        select(ReadingProgress)
        .where(ReadingProgress.user_id == current_user.id)
        .where(ReadingProgress.book_id == book_id)
    )
    progress = result.scalar_one_or_none()
    
    if not progress:
        return {"progress": 0.0, "position": None, "finished": False}
    
    return {
        "progress": progress.progress,
        "position": progress.position,
        "finished": progress.finished,
        "last_read_at": progress.last_read_at.isoformat(),
    }


@router.post("/progress/{book_id}")
async def update_progress(
    book_id: int,
    progress_data: ProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新阅读进度"""
    # 查找现有进度
    result = await db.execute(
        select(ReadingProgress)
        .where(ReadingProgress.user_id == current_user.id)
        .where(ReadingProgress.book_id == book_id)
    )
    progress = result.scalar_one_or_none()
    
    if progress:
        # 更新现有进度
        progress.progress = progress_data.progress
        progress.position = progress_data.position
        progress.finished = progress_data.finished
    else:
        # 创建新进度
        progress = ReadingProgress(
            user_id=current_user.id,
            book_id=book_id,
            progress=progress_data.progress,
            position=progress_data.position,
            finished=progress_data.finished,
        )
        db.add(progress)
    
    await db.commit()
    return {"status": "success"}


# ===== 统计信息 =====

@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取统计信息"""
    # 统计书籍数量
    book_count = await db.execute(select(func.count(Book.id)))
    total_books = book_count.scalar()
    
    # 统计作者数量
    author_count = await db.execute(select(func.count(Author.id)))
    total_authors = author_count.scalar()
    
    # 统计书库数量
    library_count = await db.execute(select(func.count(Library.id)))
    total_libraries = library_count.scalar()
    
    return {
        "total_books": total_books,
        "total_authors": total_authors,
        "total_libraries": total_libraries,
    }
