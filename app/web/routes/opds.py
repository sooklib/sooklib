"""
OPDS 路由
提供符合 OPDS 1.2 规范的目录服务
支持 HTTP Basic Auth 认证（OPDS 阅读器标准）
"""
import math
from typing import Optional
import base64

from fastapi import APIRouter, Depends, Query, Request, Response, HTTPException, Header
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import Author, Book, Library, User
from app.security import verify_password
from app.utils.logger import log
from app.utils.opds_builder import (
    build_opds_acquisition_feed,
    build_opds_navigation_feed,
    build_opds_root,
    build_opds_search_descriptor,
)
from app.utils.permissions import check_book_access, get_accessible_library_ids

router = APIRouter()
security = HTTPBasic(auto_error=False)


async def get_opds_user_optional(
    request: Request,
    credentials: HTTPBasicCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    OPDS 用户认证（可选）- 支持 HTTP Basic Auth
    用于根目录等可以匿名访问的页面
    """
    if credentials:
        username = credentials.username
        password = credentials.password
        
        # 查找用户
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        
        if user and verify_password(password, user.password_hash):
            return user
    
    return None


async def get_opds_user(
    request: Request,
    credentials: HTTPBasicCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    OPDS 用户认证（必需）- 支持 HTTP Basic Auth
    OPDS 客户端（如古腾堡、Calibre等）使用 Basic Auth 而非 JWT
    用于需要认证才能访问的内容页面
    """
    # 首先检查是否有 Basic Auth 头
    if credentials:
        username = credentials.username
        password = credentials.password
        
        # 查找用户
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        
        if user and verify_password(password, user.password_hash):
            return user
    
    # 没有认证或认证失败，返回 401 要求认证
    raise HTTPException(
        status_code=401,
        detail="需要认证",
        headers={"WWW-Authenticate": 'Basic realm="Sooklib OPDS"'}
    )


def get_base_url(request: Request) -> str:
    """获取应用的基础 URL"""
    # 从请求中获取协议和主机
    return f"{request.url.scheme}://{request.url.netloc}"


@router.get("")
@router.get("/")
async def opds_root(
    request: Request,
    current_user: Optional[User] = Depends(get_opds_user_optional)
):
    """
    OPDS 根目录
    返回主导航 Feed
    
    注意：根目录无需认证即可访问（类似 Calibre）
    访问具体内容（书籍列表、下载）时才需要认证
    """
    base_url = get_base_url(request)
    xml = build_opds_root(base_url)
    
    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=navigation"
    )


@router.get("/search_descriptor")
@router.get("/search-descriptor")
async def opds_search_descriptor_public(request: Request):
    """
    OpenSearch 描述文档（公开访问）
    供 OPDS 客户端发现搜索功能
    """
    base_url = get_base_url(request)
    xml = build_opds_search_descriptor(base_url)
    
    return Response(
        content=xml,
        media_type="application/opensearchdescription+xml"
    )


@router.get("/recent")
async def opds_recent_books(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    最新书籍 Feed
    返回最近添加的书籍列表，按时间倒序
    """
    base_url = get_base_url(request)
    
    # 获取用户可访问的书库
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        xml = build_opds_acquisition_feed(
            books=[],
            title="最新书籍",
            feed_id=f"{base_url}/opds/recent",
            base_url=base_url,
            page=1,
            total_pages=1,
            self_link=f"{base_url}/opds/recent?page=1&limit={limit}"
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=acquisition")
    
    # 查询可访问书库中的书籍
    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags),
        joinedload(Book.versions),
    )
    query = query.where(Book.library_id.in_(accessible_library_ids))
    query = query.order_by(Book.added_at.desc())
    
    # 获取所有符合条件的书籍
    result = await db.execute(query)
    all_books = result.unique().scalars().all()
    
    # 应用内容分级过滤
    filtered_books = []
    for book in all_books:
        if await check_book_access(current_user, book.id, db):
            filtered_books.append(book)
    
    # 计算分页
    total_books = len(filtered_books)
    total_pages = math.ceil(total_books / limit) if total_books > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_books = filtered_books[start_idx:end_idx]
    
    # 构建 Feed
    self_link = f"{base_url}/opds/recent?page={page}&limit={limit}"
    xml = build_opds_acquisition_feed(
        books=paginated_books,
        title="最新书籍",
        feed_id=f"{base_url}/opds/recent",
        base_url=base_url,
        page=page,
        total_pages=total_pages,
        self_link=self_link
    )
    
    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=acquisition"
    )


@router.get("/authors")
async def opds_authors_index(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    作者索引 Feed
    返回所有作者的导航列表
    """
    base_url = get_base_url(request)
    
    # 获取用户可访问的书库
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        xml = build_opds_navigation_feed(
            entries=[],
            title="作者索引",
            feed_id=f"{base_url}/opds/authors",
            base_url=base_url
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=navigation")
    
    # 查询可访问书库中的作者
    # 获取在可访问书库中有书籍的作者
    result = await db.execute(
        select(Author)
        .join(Book, Book.author_id == Author.id)
        .where(Book.library_id.in_(accessible_library_ids))
        .group_by(Author.id)
        .order_by(Author.name)
    )
    authors = result.scalars().all()
    
    # 构建导航条目
    entries = []
    for author in authors:
        entries.append({
            'title': author.name,
            'link': f"{base_url}/opds/author/{author.id}",
            'content': f"{author.book_count} 本书籍",
            'id': f"{base_url}/opds/author/{author.id}"
        })
    
    # 构建 Feed
    xml = build_opds_navigation_feed(
        entries=entries,
        title="作者索引",
        feed_id=f"{base_url}/opds/authors",
        base_url=base_url
    )
    
    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=navigation"
    )


@router.get("/author/{author_id}")
async def opds_author_books(
    author_id: int,
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    作者书籍 Feed
    返回特定作者的所有书籍
    """
    base_url = get_base_url(request)
    
    # 获取作者信息
    result = await db.execute(select(Author).where(Author.id == author_id))
    author = result.scalar_one_or_none()
    
    if not author:
        xml = build_opds_acquisition_feed(
            books=[],
            title="作者不存在",
            feed_id=f"{base_url}/opds/author/{author_id}",
            base_url=base_url,
            page=1,
            total_pages=1,
            self_link=f"{base_url}/opds/author/{author_id}?page=1&limit={limit}"
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=acquisition")
    
    # 获取用户可访问的书库
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        xml = build_opds_acquisition_feed(
            books=[],
            title=f"{author.name} 的书籍",
            feed_id=f"{base_url}/opds/author/{author_id}",
            base_url=base_url,
            page=1,
            total_pages=1,
            self_link=f"{base_url}/opds/author/{author_id}?page=1&limit={limit}"
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=acquisition")
    
    # 查询作者的书籍（限定在可访问书库中）
    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags),
        joinedload(Book.versions),
    )
    query = query.where(Book.author_id == author_id)
    query = query.where(Book.library_id.in_(accessible_library_ids))
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
    total_pages = math.ceil(total_books / limit) if total_books > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_books = filtered_books[start_idx:end_idx]
    
    # 构建 Feed
    self_link = f"{base_url}/opds/author/{author_id}?page={page}&limit={limit}"
    xml = build_opds_acquisition_feed(
        books=paginated_books,
        title=f"{author.name} 的书籍",
        feed_id=f"{base_url}/opds/author/{author_id}",
        base_url=base_url,
        page=page,
        total_pages=total_pages,
        self_link=self_link
    )
    
    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=acquisition"
    )


@router.get("/search")
async def opds_search(
    request: Request,
    q: str = Query("", description="搜索关键词"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    搜索 Feed
    根据关键词搜索书籍（书名或作者）
    """
    base_url = get_base_url(request)
    
    # 如果没有搜索词，返回空结果
    if not q.strip():
        xml = build_opds_acquisition_feed(
            books=[],
            title="搜索结果",
            feed_id=f"{base_url}/opds/search",
            base_url=base_url,
            page=1,
            total_pages=1,
            self_link=f"{base_url}/opds/search?q=&page=1&limit={limit}"
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=acquisition")
    
    # 获取用户可访问的书库
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    
    if not accessible_library_ids:
        xml = build_opds_acquisition_feed(
            books=[],
            title=f"搜索: {q}",
            feed_id=f"{base_url}/opds/search",
            base_url=base_url,
            page=1,
            total_pages=1,
            self_link=f"{base_url}/opds/search?q={q}&page=1&limit={limit}"
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=acquisition")
    
    # 构建搜索查询
    search_term = f"%{q}%"
    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags),
        joinedload(Book.versions),
    )
    query = query.where(Book.library_id.in_(accessible_library_ids))
    
    # 搜索书名或作者名
    query = query.outerjoin(Author, Book.author_id == Author.id)
    query = query.where(
        or_(
            Book.title.like(search_term),
            Author.name.like(search_term)
        )
    )
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
    total_pages = math.ceil(total_books / limit) if total_books > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_books = filtered_books[start_idx:end_idx]
    
    # 构建 Feed
    self_link = f"{base_url}/opds/search?q={q}&page={page}&limit={limit}"
    xml = build_opds_acquisition_feed(
        books=paginated_books,
        title=f"搜索: {q}",
        feed_id=f"{base_url}/opds/search",
        base_url=base_url,
        page=page,
        total_pages=total_pages,
        self_link=self_link
    )
    
    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=acquisition"
    )


@router.get("/libraries")
async def opds_libraries_index(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    书库索引 Feed
    返回用户可访问的书库列表
    """
    base_url = get_base_url(request)
    accessible_library_ids = await get_accessible_library_ids(current_user, db)

    if not accessible_library_ids:
        xml = build_opds_navigation_feed(
            entries=[],
            title="书库",
            feed_id=f"{base_url}/opds/libraries",
            base_url=base_url
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=navigation")

    result = await db.execute(
        select(Library)
        .where(Library.id.in_(accessible_library_ids))
        .order_by(Library.name)
    )
    libraries = result.scalars().all()

    entries = []
    for library in libraries:
        entries.append({
            'title': library.name,
            'link': f"{base_url}/opds/library/{library.id}",
            'content': "书库",
            'id': f"{base_url}/opds/library/{library.id}"
        })

    xml = build_opds_navigation_feed(
        entries=entries,
        title="书库",
        feed_id=f"{base_url}/opds/libraries",
        base_url=base_url
    )

    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=navigation"
    )


@router.get("/library/{library_id}")
async def opds_library_books(
    library_id: int,
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    书库书籍 Feed
    返回指定书库的书籍列表
    """
    base_url = get_base_url(request)
    accessible_library_ids = await get_accessible_library_ids(current_user, db)

    if library_id not in accessible_library_ids:
        xml = build_opds_acquisition_feed(
            books=[],
            title="无权访问书库",
            feed_id=f"{base_url}/opds/library/{library_id}",
            base_url=base_url,
            page=1,
            total_pages=1,
            self_link=f"{base_url}/opds/library/{library_id}?page=1&limit={limit}"
        )
        return Response(content=xml, media_type="application/atom+xml;profile=opds-catalog;kind=acquisition")

    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags),
        joinedload(Book.versions),
    )
    query = query.where(Book.library_id == library_id).order_by(Book.added_at.desc())

    result = await db.execute(query)
    all_books = result.unique().scalars().all()

    filtered_books = []
    for book in all_books:
        if await check_book_access(current_user, book.id, db):
            filtered_books.append(book)

    total_books = len(filtered_books)
    total_pages = math.ceil(total_books / limit) if total_books > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_books = filtered_books[start_idx:end_idx]

    self_link = f"{base_url}/opds/library/{library_id}?page={page}&limit={limit}"
    xml = build_opds_acquisition_feed(
        books=paginated_books,
        title="书库书籍",
        feed_id=f"{base_url}/opds/library/{library_id}",
        base_url=base_url,
        page=page,
        total_pages=total_pages,
        self_link=self_link
    )

    return Response(
        content=xml,
        media_type="application/atom+xml;profile=opds-catalog;kind=acquisition"
    )


@router.get("/download/{book_id}")
async def opds_download_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_opds_user)
):
    """
    下载书籍
    验证权限后提供书籍文件下载
    """
    # 检查书籍是否存在
    result = await db.execute(
        select(Book)
        .options(joinedload(Book.versions))
        .where(Book.id == book_id)
    )
    book = result.unique().scalar_one_or_none()
    
    if not book:
        return Response(content="书籍不存在", status_code=404)
    
    # 检查访问权限
    has_access = await check_book_access(current_user, book_id, db)
    if not has_access:
        return Response(content="无权访问此书籍", status_code=403)
    
    # 读取主版本文件
    try:
        import os
        if not book.versions:
            return Response(content="书籍版本不存在", status_code=404)

        primary = next((v for v in book.versions if v.is_primary), None)
        if not primary:
            primary = book.versions[0]

        if not os.path.exists(primary.file_path):
            return Response(content="文件不存在", status_code=404)

        # 确定 MIME 类型
        mime_types = {
            'epub': 'application/epub+zip',
            'mobi': 'application/x-mobipocket-ebook',
            'azw': 'application/vnd.amazon.ebook',
            'azw3': 'application/vnd.amazon.ebook',
            'pdf': 'application/pdf',
            'txt': 'text/plain; charset=utf-8',
            'cbz': 'application/vnd.comicbook+zip',
            'cbr': 'application/vnd.comicbook-rar',
        }
        mime_type = mime_types.get(primary.file_format.lower(), 'application/octet-stream')

        filename = primary.file_name or f"{book.title}.{primary.file_format}"
        return FileResponse(
            primary.file_path,
            media_type=mime_type,
            filename=filename
        )
    except Exception as e:
        log.error(f"下载书籍失败: {e}")
        return Response(content=f"下载失败: {str(e)}", status_code=500)
