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
from app.web.routes.dependencies import get_accessible_book, get_accessible_library
from app.utils.logger import log
from app.utils.permissions import check_book_access, get_accessible_library_ids

router = APIRouter()


# ===== Pydantic模型 =====

class LibraryCreate(BaseModel):
    """创建书库请求"""
    name: str
    path: str


class LibraryUpdate(BaseModel):
    """更新书库请求"""
    name: Optional[str] = None
    path: Optional[str] = None


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


class BookUpdate(BaseModel):
    """书籍更新请求"""
    title: Optional[str] = None
    author_name: Optional[str] = None  # 作者名，如不存在会创建
    description: Optional[str] = None
    publisher: Optional[str] = None
    age_rating: Optional[str] = None
    content_warning: Optional[str] = None


class BookTagsUpdate(BaseModel):
    """书籍标签更新请求"""
    tag_ids: List[int]


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
    """获取用户有权访问的书库列表"""
    # 获取用户可访问的书库ID列表
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    # 查询这些书库
    if not accessible_library_ids:
        return []
    
    result = await db.execute(
        select(Library).where(Library.id.in_(accessible_library_ids))
    )
    libraries = result.scalars().all()
    
    # 手动构建响应，转换 datetime 为字符串
    response = []
    for library in libraries:
        response.append({
            "id": library.id,
            "name": library.name,
            "path": library.path,
            "last_scan": library.last_scan.isoformat() if library.last_scan else None,
        })
    
    return response


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


@router.get("/libraries/{library_id}")
async def get_library(
    library_id: int,
    library: Library = Depends(get_accessible_library),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取书库详情"""
    # 统计该书库的书籍数量
    from sqlalchemy import func
    book_count = await db.execute(
        select(func.count(Book.id)).where(Book.library_id == library_id)
    )
    total_books = book_count.scalar()
    
    return {
        "id": library.id,
        "name": library.name,
        "path": library.path,
        "last_scan": library.last_scan.isoformat() if library.last_scan else None,
        "book_count": total_books,
    }


@router.put("/libraries/{library_id}", response_model=LibraryResponse)
async def update_library(
    library_id: int,
    library_data: LibraryUpdate,
    library: Library = Depends(get_accessible_library),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """更新书库信息（需要管理员权限）"""
    if library_data.name is not None:
        library.name = library_data.name
    if library_data.path is not None:
        library.path = library_data.path
    
    await db.commit()
    await db.refresh(library)
    
    log.info(f"更新书库: {library.name}")
    return {
        "id": library.id,
        "name": library.name,
        "path": library.path,
        "last_scan": library.last_scan.isoformat() if library.last_scan else None,
    }


@router.get("/libraries/{library_id}/stats")
async def get_library_stats(
    library_id: int,
    library: Library = Depends(get_accessible_library),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取书库统计信息"""
    from sqlalchemy import func
    from app.models import BookVersion
    
    # 书籍总数
    book_count = await db.execute(
        select(func.count(Book.id)).where(Book.library_id == library_id)
    )
    total_books = book_count.scalar()
    
    # 作者数量
    author_count = await db.execute(
        select(func.count(func.distinct(Book.author_id)))
        .where(Book.library_id == library_id)
        .where(Book.author_id.isnot(None))
    )
    total_authors = author_count.scalar()
    
    # 总文件大小
    total_size = await db.execute(
        select(func.sum(BookVersion.file_size))
        .join(Book)
        .where(Book.library_id == library_id)
    )
    total_file_size = total_size.scalar() or 0
    
    # 格式分布
    format_stats = await db.execute(
        select(BookVersion.file_format, func.count(BookVersion.id))
        .join(Book)
        .where(Book.library_id == library_id)
        .group_by(BookVersion.file_format)
    )
    formats = {row[0]: row[1] for row in format_stats}
    
    return {
        "library_id": library_id,
        "library_name": library.name,
        "total_books": total_books,
        "total_authors": total_authors,
        "total_file_size": total_file_size,
        "format_distribution": formats,
        "last_scan": library.last_scan.isoformat() if library.last_scan else None,
    }


@router.post("/libraries/{library_id}/scan")
async def scan_library(
    library_id: int,
    library: Library = Depends(get_accessible_library),
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
    library: Library = Depends(get_accessible_library),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """删除书库（需要管理员权限）"""
    await db.delete(library)
    await db.commit()
    
    log.info(f"删除书库: {library.name}")
    return {"status": "success"}


# ===== 书籍管理 =====

@router.get("/books")
async def list_books(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    author_id: Optional[int] = None,
    library_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取用户有权访问的书籍列表，返回分页数据和总数"""
    # 获取用户可访问的书库ID列表
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        return {
            "books": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "total_pages": 0
        }
    
    # 构建查询，只包含可访问书库的书籍，并加载主版本
    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags),
        joinedload(Book.versions)
    )
    query = query.where(Book.library_id.in_(accessible_library_ids))
    
    if author_id:
        query = query.where(Book.author_id == author_id)
    
    if library_id:
        # 确保请求的书库在可访问列表中
        if library_id not in accessible_library_ids:
            return {
                "books": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "total_pages": 0
            }
        query = query.where(Book.library_id == library_id)
    
    query = query.order_by(Book.added_at.desc())
    
    # 获取所有符合条件的书籍（使用unique()去重，因为有joinedload关联）
    result = await db.execute(query)
    all_books = result.unique().scalars().all()
    
    # 应用内容分级过滤
    filtered_books = []
    for book in all_books:
        if await check_book_access(current_user, book.id, db):
            filtered_books.append(book)
    
    # 计算总数和分页
    total_count = len(filtered_books)
    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_books = filtered_books[start_idx:end_idx]
    
    # 手动构建响应
    books_data = []
    for book in paginated_books:
        # 获取主版本或第一个版本
        primary_version = None
        if book.versions:
            primary_version = next((v for v in book.versions if v.is_primary), None)
            if not primary_version:
                primary_version = book.versions[0] if book.versions else None
        
        books_data.append({
            "id": book.id,
            "title": book.title,
            "author_name": book.author.name if book.author else None,
            "file_format": primary_version.file_format if primary_version else "unknown",
            "file_size": primary_version.file_size if primary_version else 0,
            "added_at": book.added_at.isoformat(),
        })
    
    return {
        "books": books_data,
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.get("/books/{book_id}")
async def get_book(
    book_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db)
):
    """获取用户有权访问的书籍详情"""
    from app.models import BookTag, Tag
    
    # 加载关联数据
    await db.refresh(book, ['author', 'versions', 'book_tags'])
    
    # 获取主版本或第一个版本
    primary_version = None
    if book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
    
    # 获取标签信息
    tag_ids = [bt.tag_id for bt in book.book_tags]
    tags = []
    if tag_ids:
        result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
        tag_objects = result.scalars().all()
        tags = [{"id": t.id, "name": t.name, "type": t.type} for t in tag_objects]
    
    return {
        "id": book.id,
        "title": book.title,
        "author_name": book.author.name if book.author else None,
        "file_path": primary_version.file_path if primary_version else "",
        "file_format": primary_version.file_format if primary_version else "unknown",
        "file_size": primary_version.file_size if primary_version else 0,
        "description": book.description,
        "publisher": book.publisher,
        "age_rating": book.age_rating,
        "content_warning": book.content_warning,
        "added_at": book.added_at.isoformat(),
        "tags": tags,
    }


@router.put("/books/{book_id}")
async def update_book(
    book_id: int,
    book_data: BookUpdate,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新书籍信息"""
    # 更新基本字段
    if book_data.title is not None:
        book.title = book_data.title
    if book_data.description is not None:
        book.description = book_data.description
    if book_data.publisher is not None:
        book.publisher = book_data.publisher
    if book_data.age_rating is not None:
        book.age_rating = book_data.age_rating
    if book_data.content_warning is not None:
        book.content_warning = book_data.content_warning
    
    # 处理作者
    if book_data.author_name is not None:
        if book_data.author_name.strip():
            # 查找或创建作者
            result = await db.execute(
                select(Author).where(Author.name == book_data.author_name.strip())
            )
            author = result.scalar_one_or_none()
            if not author:
                author = Author(name=book_data.author_name.strip())
                db.add(author)
                await db.flush()
            book.author_id = author.id
        else:
            # 清空作者
            book.author_id = None
    
    await db.commit()
    await db.refresh(book, ['author', 'versions'])
    
    # 获取主版本
    primary_version = None
    if book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
    
    log.info(f"更新书籍: {book.title}")
    
    return {
        "id": book.id,
        "title": book.title,
        "author_name": book.author.name if book.author else None,
        "file_path": primary_version.file_path if primary_version else "",
        "file_format": primary_version.file_format if primary_version else "unknown",
        "file_size": primary_version.file_size if primary_version else 0,
        "description": book.description,
        "publisher": book.publisher,
        "age_rating": book.age_rating,
        "content_warning": book.content_warning,
        "added_at": book.added_at.isoformat(),
    }


@router.get("/books/{book_id}/tags")
async def get_book_tags(
    book_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取书籍的标签"""
    from app.models import BookTag, Tag
    
    await db.refresh(book, ['book_tags'])
    
    tag_ids = [bt.tag_id for bt in book.book_tags]
    if not tag_ids:
        return {"tags": []}
    
    result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
    tags = result.scalars().all()
    
    return {
        "tags": [{"id": t.id, "name": t.name, "type": t.type, "description": t.description} for t in tags]
    }


@router.put("/books/{book_id}/tags")
async def update_book_tags(
    book_id: int,
    data: BookTagsUpdate,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新书籍的标签"""
    from app.models import BookTag, Tag
    
    # 删除现有标签关联
    await db.execute(
        BookTag.__table__.delete().where(BookTag.book_id == book_id)
    )
    
    # 添加新标签关联
    if data.tag_ids:
        # 验证标签存在
        result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids)))
        valid_tags = result.scalars().all()
        valid_tag_ids = [t.id for t in valid_tags]
        
        for tag_id in valid_tag_ids:
            book_tag = BookTag(book_id=book_id, tag_id=tag_id)
            db.add(book_tag)
    
    await db.commit()
    
    # 返回更新后的标签列表
    if data.tag_ids:
        result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids)))
        tags = result.scalars().all()
        return {
            "tags": [{"id": t.id, "name": t.name, "type": t.type} for t in tags]
        }
    
    return {"tags": []}


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
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新阅读进度（需要有书籍访问权限）"""
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


# ===== 搜索功能 =====

@router.get("/search")
async def search_books(
    q: str = Query("", description="搜索关键词"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    author_id: Optional[int] = Query(None, description="按作者筛选"),
    formats: Optional[str] = Query(None, description="按格式筛选（逗号分隔，如'txt,epub'）"),
    library_id: Optional[int] = Query(None, description="按书库筛选"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    搜索书籍
    支持关键词搜索和高级筛选
    - q: 搜索关键词（书名或作者名）
    - author_id: 按作者ID筛选
    - formats: 按格式筛选，多个格式用逗号分隔（如'txt,epub,mobi'）
    - library_id: 按书库ID筛选
    """
    # 如果既没有搜索词也没有筛选条件，返回空结果
    if not q.strip() and not author_id and not formats and not library_id:
        return {
            "books": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "total_pages": 0,
            "query": q,
            "filters": {}
        }
    
    # 获取用户可访问的书库
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        return {
            "books": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "total_pages": 0
        }
    
    # 构建搜索查询
    from sqlalchemy import or_
    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags),
        joinedload(Book.versions)
    )
    query = query.where(Book.library_id.in_(accessible_library_ids))
    
    # 关键词搜索（书名或作者名）
    if q.strip():
        search_term = f"%{q}%"
        query = query.outerjoin(Author, Book.author_id == Author.id)
        query = query.where(
            or_(
                Book.title.like(search_term),
                Author.name.like(search_term)
            )
        )
    else:
        # 即使没有搜索词，也需要 join Author 表以便后续使用
        query = query.outerjoin(Author, Book.author_id == Author.id)
    
    # 按作者筛选
    if author_id:
        query = query.where(Book.author_id == author_id)
    
    # 按格式筛选
    if formats:
        format_list = [f.strip().lower() for f in formats.split(',') if f.strip()]
        if format_list:
            query = query.where(Book.file_format.in_(format_list))
    
    # 按书库筛选
    if library_id:
        # 确保请求的书库在用户可访问列表中
        if library_id in accessible_library_ids:
            query = query.where(Book.library_id == library_id)
        else:
            # 用户无权访问该书库，返回空结果
            return {
                "books": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "total_pages": 0,
                "query": q,
                "filters": {
                    "author_id": author_id,
                    "formats": formats,
                    "library_id": library_id
                }
            }
    
    query = query.order_by(Book.title)
    
    result = await db.execute(query)
    all_books = result.unique().scalars().all()
    
    # 应用内容分级过滤
    filtered_books = []
    for book in all_books:
        if await check_book_access(current_user, book.id, db):
            filtered_books.append(book)
    
    # 计算分页
    total_books = len(filtered_books)
    total_pages = (total_books + limit - 1) // limit if total_books > 0 else 0
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_books = filtered_books[start_idx:end_idx]
    
    # 构建响应
    response_books = []
    for book in paginated_books:
        # 获取主版本或第一个版本
        primary_version = None
        if book.versions:
            primary_version = next((v for v in book.versions if v.is_primary), None)
            if not primary_version:
                primary_version = book.versions[0] if book.versions else None
        
        response_books.append({
            "id": book.id,
            "title": book.title,
            "author_name": book.author.name if book.author else None,
            "file_format": primary_version.file_format if primary_version else "unknown",
            "file_size": primary_version.file_size if primary_version else 0,
            "added_at": book.added_at.isoformat(),
        })
    
    return {
        "books": response_books,
        "total": total_books,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "query": q,
        "filters": {
            "author_id": author_id,
            "formats": formats,
            "library_id": library_id
        }
    }


# ===== 统计信息 =====

@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取用户可访问范围内的统计信息"""
    # 获取用户可访问的书库ID列表
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        return {
            "total_books": 0,
            "total_authors": 0,
            "total_libraries": 0,
        }
    
    # 统计可访问书库中的书籍数量
    book_count = await db.execute(
        select(func.count(Book.id))
        .where(Book.library_id.in_(accessible_library_ids))
    )
    total_books = book_count.scalar()
    
    # 统计可访问书库中的作者数量
    author_count = await db.execute(
        select(func.count(func.distinct(Book.author_id)))
        .where(Book.library_id.in_(accessible_library_ids))
        .where(Book.author_id.isnot(None))
    )
    total_authors = author_count.scalar()
    
    # 统计可访问的书库数量
    total_libraries = len(accessible_library_ids)
    
    return {
        "total_books": total_books,
        "total_authors": total_authors,
        "total_libraries": total_libraries,
    }
