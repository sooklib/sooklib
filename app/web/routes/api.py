"""
API路由
提供REST API接口
"""
import asyncio
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, and_, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.scanner import Scanner
from app.core.conversion.ebook_convert import (
    get_cached_conversion_path,
    get_conversion_status,
    is_conversion_supported,
    request_conversion
)
from app.core.kindle_mailer import send_to_kindle
from app.core.kindle_settings import load_kindle_settings
from app.core.websocket import manager
from app.database import get_db
from app.models import Author, Book, BookReview, Library, ReadingProgress, ReadingSession, User
from app.web.routes.auth import get_current_admin, get_current_user
from app.web.routes.settings import load_settings
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


class KindleSendRequest(BaseModel):
    """发送到 Kindle 请求"""
    target_format: Optional[str] = "azw3"
    to_email: Optional[str] = None
    wait_for_conversion: bool = False


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


class ReviewCreate(BaseModel):
    """评分/评论请求"""
    rating: int = Field(..., ge=1, le=5)
    content: Optional[str] = None


class ReviewResponse(BaseModel):
    """评分/评论响应"""
    id: int
    rating: int
    content: Optional[str]
    created_at: str
    updated_at: str
    user_id: int
    user_name: str
    user_display_name: Optional[str] = None
    is_owner: bool


class ReviewListResponse(BaseModel):
    """评分/评论列表响应"""
    average_rating: Optional[float]
    rating_count: int
    reviews: List[ReviewResponse]
    page: int
    limit: int
    total: int
    my_review: Optional[ReviewResponse] = None


class StatsResponse(BaseModel):
    """统计信息响应"""
    total_books: int
    total_authors: int
    total_libraries: int


class ReadingSessionCreate(BaseModel):
    """阅读会话创建请求"""
    book_id: int
    start_time: Optional[datetime] = None


class ReadingHeartbeat(BaseModel):
    """阅读心跳请求"""
    session_id: int
    duration_seconds: int
    progress: Optional[float] = None
    position: Optional[str] = None


class ReadingSessionEnd(BaseModel):
    """结束阅读会话请求"""
    session_id: int
    duration_seconds: int
    progress: Optional[float] = None
    position: Optional[str] = None


class SearchSuggestion(BaseModel):
    """搜索建议"""
    text: str
    type: str  # 'book' or 'author'
    id: int


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
    from app.models import LibraryPath
    
    library = Library(
        name=library_data.name,
        path=library_data.path
    )
    db.add(library)
    await db.flush()  # 获取 library.id
    
    # 同时将第一个路径添加到 library_paths 表
    library_path = LibraryPath(
        library_id=library.id,
        path=library_data.path,
        enabled=True
    )
    db.add(library_path)
    
    await db.commit()
    await db.refresh(library)
    
    log.info(f"创建书库: {library.name}, 路径: {library_data.path}")
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
    author_ids: Optional[str] = Query(None, description="按作者筛选（逗号分隔的作者ID）"),
    library_id: Optional[int] = None,
    formats: Optional[str] = Query(None, description="按格式筛选（逗号分隔，如'txt,epub'）"),
    tag_ids: Optional[str] = Query(None, description="按标签筛选（逗号分隔的标签ID）"),
    age_ratings: Optional[str] = Query(None, description="按内容分级筛选（逗号分隔，如'general,teen'）"),
    min_size: Optional[int] = Query(None, ge=0, description="最小文件大小（字节）"),
    max_size: Optional[int] = Query(None, ge=0, description="最大文件大小（字节）"),
    added_from: Optional[date] = Query(None, description="添加时间起始（YYYY-MM-DD）"),
    added_to: Optional[date] = Query(None, description="添加时间结束（YYYY-MM-DD）"),
    sort: Optional[str] = Query("added_at_desc", description="排序方式：added_at_desc, added_at_asc, title_asc, title_desc, size_desc, size_asc, format_asc, format_desc, rating_asc, rating_desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取用户有权访问的书籍列表，返回分页数据和总数
    支持筛选：
    - author_id: 按作者ID筛选
    - author_ids: 按作者ID筛选（逗号分隔）
    - library_id: 按书库ID筛选
    - formats: 按格式筛选，多个格式用逗号分隔（如'txt,epub,mobi'）
    - tag_ids: 按标签筛选，多个标签ID用逗号分隔（如'1,2,3'）
    - age_ratings: 按内容分级筛选
    - min_size/max_size: 按文件大小筛选（字节）
    - added_from/added_to: 按添加日期筛选
    支持排序：
    - added_at_desc/asc: 按添加时间排序
    - title_asc/desc: 按书名排序
    - size_desc/asc: 按文件大小排序
    - format_asc/desc: 按格式排序
    - rating_asc/desc: 按分级排序
    """
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

    if author_ids:
        try:
            author_id_list = [int(a.strip()) for a in author_ids.split(',') if a.strip()]
            if author_id_list:
                query = query.where(Book.author_id.in_(author_id_list))
        except ValueError as e:
            log.error(f"作者筛选解析错误: {e}")

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

    if age_ratings:
        rating_list = [r.strip().lower() for r in age_ratings.split(',') if r.strip()]
        if rating_list:
            query = query.where(func.lower(Book.age_rating).in_(rating_list))

    if added_from:
        query = query.where(cast(Book.added_at, Date) >= added_from)

    if added_to:
        query = query.where(cast(Book.added_at, Date) <= added_to)
    
    # 按格式筛选
    if formats:
        from app.models import BookVersion
        from sqlalchemy import or_, func
        format_list = [f.strip().lower() for f in formats.split(',') if f.strip()]
        if format_list:
            # 处理带点和不带点的格式（如 txt 和 .txt）
            # 数据库可能存储为 .txt 或 txt，需要兼容
            format_conditions = []
            for fmt in format_list:
                # 不带点的格式
                format_conditions.append(func.lower(BookVersion.file_format) == fmt.lower())
                # 带点的格式
                format_conditions.append(func.lower(BookVersion.file_format) == f".{fmt}".lower())
            
            # 子查询：找到有匹配格式版本的书籍ID
            subquery = select(BookVersion.book_id).where(
                or_(*format_conditions)
            ).distinct()
            query = query.where(Book.id.in_(subquery))
    
    # 按标签筛选（AND逻辑：必须同时包含所有选中标签）
    if tag_ids:
        from app.models import BookTag
        try:
            tag_id_list = [int(t.strip()) for t in tag_ids.split(',') if t.strip()]
            if tag_id_list:
                # 先查询符合条件的书籍ID列表
                if len(tag_id_list) == 1:
                    # 单个标签：简单的IN查询
                    tag_subquery = select(BookTag.book_id).where(
                        BookTag.tag_id == tag_id_list[0]
                    ).distinct()
                    
                    # 执行子查询
                    tag_book_result = await db.execute(tag_subquery)
                    tag_book_ids = [row[0] for row in tag_book_result.fetchall()]
                else:
                    # 多个标签：使用 group by + having count 确保必须包含所有标签
                    # 使用 DISTINCT COUNT 确保正确计数
                    tag_subquery = select(BookTag.book_id).where(
                        BookTag.tag_id.in_(tag_id_list)
                    ).group_by(BookTag.book_id).having(
                        func.count(func.distinct(BookTag.tag_id)) >= len(tag_id_list)
                    )
                    
                    # 执行子查询
                    tag_book_result = await db.execute(tag_subquery)
                    tag_book_ids = [row[0] for row in tag_book_result.fetchall()]
                
                if tag_book_ids:
                    query = query.where(Book.id.in_(tag_book_ids))
                else:
                    # 没有匹配的书籍，直接返回空结果
                    return {
                        "books": [],
                        "total": 0,
                        "page": page,
                        "limit": limit,
                        "total_pages": 0
                    }
        except ValueError as e:
            log.error(f"标签筛选解析错误: {e}")
        except Exception as e:
            log.error(f"标签筛选查询错误: {e}")
    
    # 应用排序
    # 对于需要 BookVersion 的排序（size, format），在内存中处理
    db_sort_applied = False
    if sort:
        sort_lower = sort.lower()
        if sort_lower == "added_at_desc":
            query = query.order_by(Book.added_at.desc())
            db_sort_applied = True
        elif sort_lower == "added_at_asc":
            query = query.order_by(Book.added_at.asc())
            db_sort_applied = True
        elif sort_lower == "title_asc":
            query = query.order_by(Book.title.asc())
            db_sort_applied = True
        elif sort_lower == "title_desc":
            query = query.order_by(Book.title.desc())
            db_sort_applied = True
        elif sort_lower == "rating_asc":
            query = query.order_by(Book.age_rating.asc())
            db_sort_applied = True
        elif sort_lower == "rating_desc":
            query = query.order_by(Book.age_rating.desc())
            db_sort_applied = True
        # size_asc/desc 和 format_asc/desc 需要在获取数据后排序
    
    if not db_sort_applied:
        query = query.order_by(Book.added_at.desc())
    
    # 获取所有符合条件的书籍（使用unique()去重，因为有joinedload关联）
    result = await db.execute(query)
    all_books = result.unique().scalars().all()
    
    # 应用内容分级过滤
    filtered_books = []
    for book in all_books:
        if await check_book_access(current_user, book.id, db):
            filtered_books.append(book)
    
    # 内存中排序（对于需要 BookVersion 的排序）
    if sort:
        sort_lower = sort.lower()
        
        def get_primary_version(book):
            """获取书籍的主版本"""
            if book.versions:
                primary = next((v for v in book.versions if v.is_primary), None)
                if not primary:
                    primary = book.versions[0] if book.versions else None
                return primary
            return None
        
        if sort_lower == "size_desc":
            filtered_books.sort(key=lambda b: (get_primary_version(b).file_size if get_primary_version(b) else 0), reverse=True)
        elif sort_lower == "size_asc":
            filtered_books.sort(key=lambda b: (get_primary_version(b).file_size if get_primary_version(b) else 0))
        elif sort_lower == "format_asc":
            filtered_books.sort(key=lambda b: (get_primary_version(b).file_format if get_primary_version(b) else ""))
        elif sort_lower == "format_desc":
            filtered_books.sort(key=lambda b: (get_primary_version(b).file_format if get_primary_version(b) else ""), reverse=True)
    
    # 按文件大小过滤（主版本）
    if min_size is not None or max_size is not None:
        def in_size_range(book):
            primary_version = None
            if book.versions:
                primary_version = next((v for v in book.versions if v.is_primary), None)
                if not primary_version:
                    primary_version = book.versions[0] if book.versions else None
            size = primary_version.file_size if primary_version else 0
            if min_size is not None and size < min_size:
                return False
            if max_size is not None and size > max_size:
                return False
            return True

        filtered_books = [book for book in filtered_books if in_size_range(book)]

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
    
    # 构建版本列表
    versions_data = []
    for v in sorted(book.versions, key=lambda x: (not x.is_primary, x.added_at)):
        versions_data.append({
            "id": v.id,
            "file_name": v.file_name,
            "file_format": v.file_format,
            "file_size": v.file_size,
            "quality": v.quality,
            "source": v.source,
            "is_primary": v.is_primary,
            "added_at": v.added_at.isoformat(),
        })
    
    # 获取可用格式列表
    available_formats = list(set(v.file_format for v in book.versions))
    
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
        # 多版本支持
        "version_count": len(book.versions),
        "versions": versions_data,
        "available_formats": available_formats,
    }


@router.get("/books/{book_id}/reviews", response_model=ReviewListResponse)
async def list_book_reviews(
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(5, ge=1, le=50)
):
    """获取书籍评分与评论"""
    settings = load_settings()
    if not settings.get("ratings_enabled", True):
        raise HTTPException(status_code=403, detail="评分功能未启用")

    stats_result = await db.execute(
        select(func.count(BookReview.id), func.avg(BookReview.rating))
        .where(BookReview.book_id == book.id)
    )
    total, average_rating = stats_result.one()
    total = int(total or 0)
    average_rating = float(average_rating) if average_rating is not None else None

    offset = (page - 1) * limit
    result = await db.execute(
        select(BookReview, User)
        .join(User, User.id == BookReview.user_id)
        .where(BookReview.book_id == book.id)
        .order_by(BookReview.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()

    reviews: List[ReviewResponse] = []
    for review, user in rows:
        reviews.append({
            "id": review.id,
            "rating": review.rating,
            "content": review.content,
            "created_at": review.created_at.isoformat() if review.created_at else "",
            "updated_at": review.updated_at.isoformat() if review.updated_at else "",
            "user_id": user.id,
            "user_name": user.username,
            "user_display_name": user.display_name,
            "is_owner": user.id == current_user.id,
        })

    my_review = None
    my_result = await db.execute(
        select(BookReview).where(
            and_(BookReview.book_id == book.id, BookReview.user_id == current_user.id)
        )
    )
    my = my_result.scalars().first()
    if my:
        my_review = {
            "id": my.id,
            "rating": my.rating,
            "content": my.content,
            "created_at": my.created_at.isoformat() if my.created_at else "",
            "updated_at": my.updated_at.isoformat() if my.updated_at else "",
            "user_id": current_user.id,
            "user_name": current_user.username,
            "user_display_name": current_user.display_name,
            "is_owner": True,
        }

    return {
        "average_rating": average_rating,
        "rating_count": total,
        "reviews": reviews,
        "page": page,
        "limit": limit,
        "total": total,
        "my_review": my_review,
    }


@router.post("/books/{book_id}/reviews", response_model=ReviewResponse)
async def upsert_book_review(
    review_data: ReviewCreate,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """提交或更新书籍评分与评论"""
    settings = load_settings()
    if not settings.get("ratings_enabled", True):
        raise HTTPException(status_code=403, detail="评分功能未启用")

    result = await db.execute(
        select(BookReview).where(
            and_(BookReview.book_id == book.id, BookReview.user_id == current_user.id)
        )
    )
    review = result.scalars().first()

    if review:
        review.rating = review_data.rating
        review.content = review_data.content
        review.updated_at = datetime.utcnow()
    else:
        review = BookReview(
            user_id=current_user.id,
            book_id=book.id,
            rating=review_data.rating,
            content=review_data.content
        )
        db.add(review)

    await db.commit()
    await db.refresh(review)

    return {
        "id": review.id,
        "rating": review.rating,
        "content": review.content,
        "created_at": review.created_at.isoformat() if review.created_at else "",
        "updated_at": review.updated_at.isoformat() if review.updated_at else "",
        "user_id": current_user.id,
        "user_name": current_user.username,
        "user_display_name": current_user.display_name,
        "is_owner": True,
    }


@router.delete("/books/{book_id}/reviews/me")
async def delete_my_review(
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除自己的评分与评论"""
    settings = load_settings()
    if not settings.get("ratings_enabled", True):
        raise HTTPException(status_code=403, detail="评分功能未启用")

    result = await db.execute(
        select(BookReview).where(
            and_(BookReview.book_id == book.id, BookReview.user_id == current_user.id)
        )
    )
    review = result.scalars().first()
    if not review:
        raise HTTPException(status_code=404, detail="评分不存在")

    await db.delete(review)
    await db.commit()
    return {"status": "deleted"}


@router.post("/books/{book_id}/send-to-kindle")
async def send_book_to_kindle(
    book_id: int,
    payload: KindleSendRequest,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """发送书籍到 Kindle 邮箱"""
    kindle_settings = load_kindle_settings()
    if not kindle_settings.get("enabled", False):
        raise HTTPException(status_code=400, detail="Kindle 推送未启用")

    to_email = (payload.to_email or current_user.kindle_email or "").strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="未配置 Kindle 收件邮箱")

    await db.refresh(book, ['versions'])
    if not book.versions:
        raise HTTPException(status_code=404, detail="书籍文件不存在")

    primary_version = next((v for v in book.versions if v.is_primary), None)
    version = primary_version or book.versions[0]
    file_path = Path(version.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="书籍文件不存在")

    input_format = version.file_format.lower().lstrip(".")
    target_format = (payload.target_format or input_format).lower().lstrip(".")

    attachment_path = file_path

    if input_format in {"epub", "mobi", "azw3"} and target_format != input_format:
        if not is_conversion_supported(input_format, target_format):
            raise HTTPException(status_code=400, detail="不支持的转换格式")

        cached = get_cached_conversion_path(file_path, target_format)
        if cached:
            attachment_path = cached
        else:
            result = request_conversion(file_path, target_format)
            if result.get("status") == "failed":
                raise HTTPException(status_code=400, detail=result.get("message", "转换失败"))

            job_id = result.get("job_id")
            if not payload.wait_for_conversion:
                return {
                    "status": "converting",
                    "job_id": job_id,
                    "message": "格式转换中，请稍后重试发送"
                }

            deadline = asyncio.get_running_loop().time() + 90
            while asyncio.get_running_loop().time() < deadline:
                status = get_conversion_status(job_id) if job_id else None
                if status and status.get("status") == "success":
                    output_path = status.get("output_path")
                    if output_path:
                        attachment_path = Path(output_path)
                    break
                if status and status.get("status") == "failed":
                    raise HTTPException(status_code=400, detail=status.get("message", "转换失败"))
                await asyncio.sleep(2)

            if attachment_path == file_path:
                raise HTTPException(status_code=408, detail="转换超时，请稍后重试")

    if input_format == "txt" and target_format not in {"txt", "text"}:
        raise HTTPException(status_code=400, detail="TXT 不支持自动转换，请直接发送 TXT")

    max_mb = int(kindle_settings.get("max_attachment_mb") or 50)
    if attachment_path.stat().st_size > max_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"文件超过 {max_mb}MB，无法通过邮件发送")

    subject = f"{book.title}"
    try:
        send_to_kindle(to_email=to_email, attachment_path=attachment_path, subject=subject)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        log.error(f"发送到 Kindle 失败: {exc}")
        raise HTTPException(status_code=500, detail="发送失败，请检查 SMTP 配置")

    return {
        "status": "sent",
        "to_email": to_email,
        "format": attachment_path.suffix.lstrip("."),
        "file_name": attachment_path.name
    }


# ===== 书籍版本管理 =====

@router.get("/books/{book_id}/versions")
async def get_book_versions(
    book_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db)
):
    """获取书籍的所有版本"""
    await db.refresh(book, ['versions'])
    
    versions_data = []
    for v in sorted(book.versions, key=lambda x: (not x.is_primary, x.added_at)):
        versions_data.append({
            "id": v.id,
            "file_name": v.file_name,
            "file_path": v.file_path,
            "file_format": v.file_format,
            "file_size": v.file_size,
            "file_hash": v.file_hash,
            "quality": v.quality,
            "source": v.source,
            "is_primary": v.is_primary,
            "added_at": v.added_at.isoformat(),
        })
    
    return {
        "book_id": book_id,
        "book_title": book.title,
        "version_count": len(versions_data),
        "versions": versions_data,
    }


@router.post("/books/{book_id}/versions/{version_id}/set-primary")
async def set_primary_version(
    book_id: int,
    version_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """设置主版本"""
    from app.models import BookVersion
    
    await db.refresh(book, ['versions'])
    
    # 验证版本属于该书籍
    target_version = None
    for v in book.versions:
        if v.id == version_id:
            target_version = v
            break
    
    if not target_version:
        raise HTTPException(status_code=404, detail="版本不存在")
    
    # 取消所有其他版本的主版本标记
    for v in book.versions:
        v.is_primary = (v.id == version_id)
    
    await db.commit()
    
    log.info(f"设置书籍 {book.title} 的主版本为 {target_version.file_name}")
    
    return {
        "status": "success",
        "message": f"已将 {target_version.file_name} 设为主版本",
        "version_id": version_id,
    }


@router.delete("/books/{book_id}/versions/{version_id}")
async def delete_book_version(
    book_id: int,
    version_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """删除书籍版本（需要管理员权限）"""
    from app.models import BookVersion
    
    await db.refresh(book, ['versions'])
    
    # 验证版本属于该书籍
    target_version = None
    for v in book.versions:
        if v.id == version_id:
            target_version = v
            break
    
    if not target_version:
        raise HTTPException(status_code=404, detail="版本不存在")
    
    # 不允许删除唯一版本
    if len(book.versions) == 1:
        raise HTTPException(status_code=400, detail="不能删除唯一的版本")
    
    # 如果删除的是主版本，需要设置其他版本为主版本
    was_primary = target_version.is_primary
    file_name = target_version.file_name
    
    await db.delete(target_version)
    
    if was_primary:
        # 设置第一个剩余版本为主版本
        remaining = [v for v in book.versions if v.id != version_id]
        if remaining:
            remaining[0].is_primary = True
    
    await db.commit()
    
    log.info(f"删除书籍 {book.title} 的版本 {file_name}")
    
    return {
        "status": "success",
        "message": f"已删除版本 {file_name}",
    }


@router.put("/books/{book_id}")
async def update_book(
    book_id: int,
    book_data: BookUpdate,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """更新书籍信息（需要管理员权限）"""
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
    min_books: int = Query(1, ge=0, description="最少书籍数量过滤"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取作者列表
    只返回用户可访问书库中有书籍的作者，并按书籍数量排序
    """
    # 获取用户可访问的书库ID列表
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        return []
    
    # 查询有书的作者，并统计书籍数量
    result = await db.execute(
        select(
            Author.id,
            Author.name,
            func.count(Book.id).label('book_count')
        )
        .join(Book, Book.author_id == Author.id)
        .where(Book.library_id.in_(accessible_library_ids))
        .group_by(Author.id, Author.name)
        .having(func.count(Book.id) >= min_books)
        .order_by(func.count(Book.id).desc(), Author.name)
    )
    
    authors = []
    for row in result:
        authors.append({
            "id": row.id,
            "name": row.name,
            "book_count": row.book_count
        })
    
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
    from datetime import datetime, timezone
    
    # 查找现有进度
    result = await db.execute(
        select(ReadingProgress)
        .where(ReadingProgress.user_id == current_user.id)
        .where(ReadingProgress.book_id == book_id)
    )
    progress = result.scalar_one_or_none()
    
    now = datetime.now(timezone.utc)  # 使用带时区的UTC时间
    
    if progress:
        # 更新现有进度
        progress.progress = progress_data.progress
        progress.position = progress_data.position
        progress.finished = progress_data.finished
        progress.last_read_at = now
    else:
        # 创建新进度
        progress = ReadingProgress(
            user_id=current_user.id,
            book_id=book_id,
            progress=progress_data.progress,
            position=progress_data.position,
            finished=progress_data.finished,
            last_read_at=now,
        )
        db.add(progress)
    
    await db.commit()

    # 广播进度更新
    await manager.broadcast_to_user(current_user.id, {
        "type": "progress_update",
        "book_id": book_id,
        "progress": progress_data.progress,
        "position": progress_data.position,
        "timestamp": now.isoformat()
    })

    return {"status": "success"}


# ===== 搜索功能 =====

@router.get("/search/suggestions", response_model=List[SearchSuggestion])
async def search_suggestions(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取搜索建议
    返回匹配的书名和作者名
    """
    if not q.strip():
        return []
        
    # 获取用户可访问的书库
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        return []
    
    search_term = f"%{q}%"
    suggestions = []
    
    # 1. 搜索匹配的书籍
    # 只查询可访问书库中的书籍
    book_stmt = select(Book.id, Book.title).where(
        and_(
            Book.library_id.in_(accessible_library_ids),
            Book.title.like(search_term)
        )
    ).limit(limit)
    
    book_result = await db.execute(book_stmt)
    for row in book_result:
        suggestions.append(SearchSuggestion(
            text=row.title,
            type="book",
            id=row.id
        ))
    
    # 如果建议数量还不够，搜索作者
    if len(suggestions) < limit:
        remaining = limit - len(suggestions)
        
        # 搜索作者（需要确保作者至少有一本书在用户可访问的书库中）
        # 这里为了性能简化查询，只查作者名匹配，不严格检查每本书的权限
        # 但通常作者存在就意味着有书。为了更严谨，可以关联 Book 表检查 library_id
        author_stmt = select(Author.id, Author.name).join(Book).where(
            and_(
                Book.library_id.in_(accessible_library_ids),
                Author.name.like(search_term)
            )
        ).distinct().limit(remaining)
        
        author_result = await db.execute(author_stmt)
        for row in author_result:
            suggestions.append(SearchSuggestion(
                text=row.name,
                type="author",
                id=row.id
            ))
            
    return suggestions


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


# ===== 阅读统计 =====

@router.post("/stats/session/start", response_model=dict)
async def start_reading_session(
    data: ReadingSessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """开始阅读会话"""
    from app.models import ReadingSession
    from app.utils.permissions import check_book_access
    
    # 检查书籍访问权限
    if not await check_book_access(current_user, data.book_id, db):
        raise HTTPException(status_code=403, detail="无权访问此书籍")
    
    start_time = data.start_time or datetime.now(timezone.utc)
    
    # 获取客户端IP和设备信息
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    session = ReadingSession(
        user_id=current_user.id,
        book_id=data.book_id,
        start_time=start_time,
        ip_address=ip_address,
        device_info=user_agent
    )
    
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return {"session_id": session.id, "status": "started"}


@router.post("/stats/session/heartbeat", response_model=dict)
async def heartbeat_reading_session(
    data: ReadingHeartbeat,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """阅读心跳更新"""
    from app.models import ReadingSession, ReadingProgress
    
    # 获取会话
    result = await db.execute(
        select(ReadingSession).where(ReadingSession.id == data.session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
        
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此会话")
    
    # 更新会话信息
    session.duration_seconds = data.duration_seconds
    if data.progress is not None:
        session.progress = data.progress
    
    # 同时更新总体阅读进度
    if data.progress is not None or data.position is not None:
        progress_result = await db.execute(
            select(ReadingProgress)
            .where(ReadingProgress.user_id == current_user.id)
            .where(ReadingProgress.book_id == session.book_id)
        )
        reading_progress = progress_result.scalar_one_or_none()
        
        now = datetime.now(timezone.utc)
        
        if reading_progress:
            if data.progress is not None:
                reading_progress.progress = max(reading_progress.progress, data.progress)
            if data.position is not None:
                reading_progress.position = data.position
            reading_progress.last_read_at = now
        else:
            reading_progress = ReadingProgress(
                user_id=current_user.id,
                book_id=session.book_id,
                progress=data.progress or 0.0,
                position=data.position,
                last_read_at=now
            )
            db.add(reading_progress)
            
    await db.commit()

    # 广播进度更新
    if data.progress is not None or data.position is not None:
        await manager.broadcast_to_user(current_user.id, {
            "type": "progress_update",
            "book_id": session.book_id,
            "progress": reading_progress.progress,
            "position": reading_progress.position,
            "timestamp": now.isoformat()
        })
    
    return {"status": "updated"}


@router.post("/stats/session/end", response_model=dict)
async def end_reading_session(
    data: ReadingSessionEnd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """结束阅读会话"""
    from app.models import ReadingSession, ReadingProgress
    
    # 获取会话
    result = await db.execute(
        select(ReadingSession).where(ReadingSession.id == data.session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
        
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此会话")
    
    # 更新会话信息
    session.end_time = datetime.now(timezone.utc)
    session.duration_seconds = data.duration_seconds
    if data.progress is not None:
        session.progress = data.progress
        
    # 同时更新总体阅读进度
    if data.progress is not None or data.position is not None:
        progress_result = await db.execute(
            select(ReadingProgress)
            .where(ReadingProgress.user_id == current_user.id)
            .where(ReadingProgress.book_id == session.book_id)
        )
        reading_progress = progress_result.scalar_one_or_none()
        
        now = datetime.now(timezone.utc)
        
        if reading_progress:
            if data.progress is not None:
                reading_progress.progress = max(reading_progress.progress, data.progress)
            if data.position is not None:
                reading_progress.position = data.position
            reading_progress.last_read_at = now
        else:
            reading_progress = ReadingProgress(
                user_id=current_user.id,
                book_id=session.book_id,
                progress=data.progress or 0.0,
                position=data.position,
                last_read_at=now
            )
            db.add(reading_progress)
    
    await db.commit()

    # 广播进度更新
    if data.progress is not None or data.position is not None:
        await manager.broadcast_to_user(current_user.id, {
            "type": "progress_update",
            "book_id": session.book_id,
            "progress": reading_progress.progress,
            "position": reading_progress.position,
            "timestamp": now.isoformat()
        })
    
    return {"status": "ended"}


@router.get("/stats/reading/overview")
async def get_reading_stats_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取阅读统计概览"""
    # 总阅读时长（秒）
    total_duration_result = await db.execute(
        select(func.sum(ReadingSession.duration_seconds))
        .where(ReadingSession.user_id == current_user.id)
    )
    total_duration_seconds = total_duration_result.scalar() or 0
    
    # 总阅读会话数
    session_count_result = await db.execute(
        select(func.count(ReadingSession.id))
        .where(ReadingSession.user_id == current_user.id)
    )
    total_sessions = session_count_result.scalar() or 0
    
    # 阅读过的书籍数量（有阅读会话记录）
    books_read_result = await db.execute(
        select(func.count(func.distinct(ReadingSession.book_id)))
        .where(ReadingSession.user_id == current_user.id)
    )
    books_read = books_read_result.scalar() or 0
    
    # 已完成阅读的书籍数量
    finished_books_result = await db.execute(
        select(func.count(ReadingProgress.id))
        .where(ReadingProgress.user_id == current_user.id)
        .where(ReadingProgress.finished == True)
    )
    finished_books = finished_books_result.scalar() or 0
    
    # 今日阅读时长
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_duration_result = await db.execute(
        select(func.sum(ReadingSession.duration_seconds))
        .where(ReadingSession.user_id == current_user.id)
        .where(ReadingSession.start_time >= today_start)
    )
    today_duration = today_duration_result.scalar() or 0
    
    # 本周阅读时长（从周一开始）
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    week_duration_result = await db.execute(
        select(func.sum(ReadingSession.duration_seconds))
        .where(ReadingSession.user_id == current_user.id)
        .where(ReadingSession.start_time >= week_start_dt)
    )
    week_duration = week_duration_result.scalar() or 0
    
    # 本月阅读时长
    month_start = today.replace(day=1)
    month_start_dt = datetime.combine(month_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    month_duration_result = await db.execute(
        select(func.sum(ReadingSession.duration_seconds))
        .where(ReadingSession.user_id == current_user.id)
        .where(ReadingSession.start_time >= month_start_dt)
    )
    month_duration = month_duration_result.scalar() or 0
    
    # 平均每日阅读时长（过去30天）
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    avg_daily_result = await db.execute(
        select(func.sum(ReadingSession.duration_seconds))
        .where(ReadingSession.user_id == current_user.id)
        .where(ReadingSession.start_time >= thirty_days_ago)
    )
    last_30_days_total = avg_daily_result.scalar() or 0
    avg_daily_seconds = last_30_days_total / 30
    
    return {
        "total_duration_seconds": total_duration_seconds,
        "total_duration_formatted": _format_duration(total_duration_seconds),
        "total_sessions": total_sessions,
        "books_read": books_read,
        "finished_books": finished_books,
        "today_duration_seconds": today_duration,
        "today_duration_formatted": _format_duration(today_duration),
        "week_duration_seconds": week_duration,
        "week_duration_formatted": _format_duration(week_duration),
        "month_duration_seconds": month_duration,
        "month_duration_formatted": _format_duration(month_duration),
        "avg_daily_seconds": int(avg_daily_seconds),
        "avg_daily_formatted": _format_duration(int(avg_daily_seconds)),
    }


@router.get("/stats/reading/daily")
async def get_daily_reading_stats(
    days: int = Query(30, ge=1, le=365, description="统计天数"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取每日阅读时长统计"""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # 按日期分组统计阅读时长
    # 使用 SQLite 的 date() 函数提取日期
    result = await db.execute(
        select(
            func.date(ReadingSession.start_time).label('date'),
            func.sum(ReadingSession.duration_seconds).label('duration'),
            func.count(ReadingSession.id).label('sessions')
        )
        .where(ReadingSession.user_id == current_user.id)
        .where(ReadingSession.start_time >= start_date)
        .group_by(func.date(ReadingSession.start_time))
        .order_by(func.date(ReadingSession.start_time))
    )
    
    daily_stats = []
    for row in result:
        daily_stats.append({
            "date": row.date,
            "duration_seconds": row.duration or 0,
            "duration_formatted": _format_duration(row.duration or 0),
            "sessions": row.sessions or 0
        })
    
    # 补充没有阅读记录的日期
    full_daily_stats = []
    current_date = start_date.date()
    end_date = datetime.now(timezone.utc).date()
    existing_dates = {row["date"] for row in daily_stats}
    
    while current_date <= end_date:
        date_str = current_date.isoformat()
        if date_str in existing_dates:
            # 找到对应的记录
            for row in daily_stats:
                if row["date"] == date_str:
                    full_daily_stats.append(row)
                    break
        else:
            full_daily_stats.append({
                "date": date_str,
                "duration_seconds": 0,
                "duration_formatted": "0分钟",
                "sessions": 0
            })
        current_date += timedelta(days=1)
    
    return {
        "days": days,
        "start_date": start_date.date().isoformat(),
        "end_date": datetime.now(timezone.utc).date().isoformat(),
        "daily_stats": full_daily_stats
    }


@router.get("/stats/reading/hourly")
async def get_hourly_reading_distribution(
    days: int = Query(30, ge=1, le=365, description="统计天数"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取每小时阅读分布（阅读习惯分析）"""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # 按小时分组统计
    # 使用 strftime 提取小时
    result = await db.execute(
        select(
            func.strftime('%H', ReadingSession.start_time).label('hour'),
            func.sum(ReadingSession.duration_seconds).label('duration'),
            func.count(ReadingSession.id).label('sessions')
        )
        .where(ReadingSession.user_id == current_user.id)
        .where(ReadingSession.start_time >= start_date)
        .group_by(func.strftime('%H', ReadingSession.start_time))
        .order_by(func.strftime('%H', ReadingSession.start_time))
    )
    
    hourly_data = {str(i).zfill(2): {"duration_seconds": 0, "sessions": 0} for i in range(24)}
    
    for row in result:
        hour = row.hour
        if hour:
            hourly_data[hour] = {
                "duration_seconds": row.duration or 0,
                "sessions": row.sessions or 0
            }
    
    # 转换为列表格式
    hourly_stats = []
    for hour in range(24):
        hour_str = str(hour).zfill(2)
        data = hourly_data[hour_str]
        hourly_stats.append({
            "hour": hour,
            "hour_label": f"{hour}:00-{hour+1}:00" if hour < 23 else "23:00-00:00",
            "duration_seconds": data["duration_seconds"],
            "duration_formatted": _format_duration(data["duration_seconds"]),
            "sessions": data["sessions"]
        })
    
    return {
        "days": days,
        "hourly_stats": hourly_stats
    }


@router.get("/stats/reading/books")
async def get_book_reading_stats(
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取各书籍阅读时长统计"""
    settings = load_settings()
    if not settings.get("rankings_enabled", True):
        raise HTTPException(status_code=403, detail="排行榜功能已关闭")
    # 按书籍分组统计阅读时长
    result = await db.execute(
        select(
            ReadingSession.book_id,
            func.sum(ReadingSession.duration_seconds).label('total_duration'),
            func.count(ReadingSession.id).label('session_count'),
            func.max(ReadingSession.start_time).label('last_read')
        )
        .where(ReadingSession.user_id == current_user.id)
        .group_by(ReadingSession.book_id)
        .order_by(func.sum(ReadingSession.duration_seconds).desc())
        .limit(limit)
    )
    
    book_stats = []
    for row in result:
        # 获取书籍信息
        book_result = await db.execute(
            select(Book).options(joinedload(Book.author)).where(Book.id == row.book_id)
        )
        book = book_result.scalar_one_or_none()
        
        if book:
            # 获取阅读进度
            progress_result = await db.execute(
                select(ReadingProgress)
                .where(ReadingProgress.user_id == current_user.id)
                .where(ReadingProgress.book_id == row.book_id)
            )
            progress = progress_result.scalar_one_or_none()
            
            book_stats.append({
                "book_id": row.book_id,
                "title": book.title,
                "author_name": book.author.name if book.author else None,
                "total_duration_seconds": row.total_duration or 0,
                "total_duration_formatted": _format_duration(row.total_duration or 0),
                "session_count": row.session_count or 0,
                "last_read": row.last_read.isoformat() if row.last_read else None,
                "progress": progress.progress if progress else 0,
                "finished": progress.finished if progress else False
            })
    
    return {
        "limit": limit,
        "book_stats": book_stats
    }


@router.get("/stats/reading/recent-sessions")
async def get_recent_reading_sessions(
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取最近的阅读会话记录"""
    result = await db.execute(
        select(ReadingSession)
        .where(ReadingSession.user_id == current_user.id)
        .order_by(ReadingSession.start_time.desc())
        .limit(limit)
    )
    
    sessions = result.scalars().all()
    
    session_list = []
    for session in sessions:
        # 获取书籍信息
        book_result = await db.execute(
            select(Book).options(joinedload(Book.author)).where(Book.id == session.book_id)
        )
        book = book_result.scalar_one_or_none()
        
        session_list.append({
            "id": session.id,
            "book_id": session.book_id,
            "book_title": book.title if book else "未知书籍",
            "author_name": book.author.name if book and book.author else None,
            "start_time": session.start_time.isoformat() if session.start_time else None,
            "end_time": session.end_time.isoformat() if session.end_time else None,
            "duration_seconds": session.duration_seconds or 0,
            "duration_formatted": _format_duration(session.duration_seconds or 0),
            "progress": session.progress,
            "device_info": session.device_info
        })
    
    return {
        "limit": limit,
        "sessions": session_list
    }


def _format_duration(seconds: int) -> str:
    """格式化时长显示"""
    if seconds < 60:
        return f"{seconds}秒"
    elif seconds < 3600:
        minutes = seconds // 60
        return f"{minutes}分钟"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if minutes > 0:
            return f"{hours}小时{minutes}分钟"
        return f"{hours}小时"
