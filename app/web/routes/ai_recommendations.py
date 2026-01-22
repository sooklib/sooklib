"""
AI 推荐与对话式找书
"""
import json
from collections import Counter
from typing import List, Optional, Dict, Any, Iterable, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import (
    Book,
    BookTag,
    Tag,
    User,
    UserFavorite,
    ReadingProgress,
    Author,
    BookVersion,
)
from app.utils.permissions import check_book_access, get_accessible_library_ids
from app.web.routes.auth import get_current_user
from app.core.ai.config import ai_config
from app.core.ai.service import get_ai_service


router = APIRouter()


class RecommendationItem(BaseModel):
    id: int
    title: str
    author_name: Optional[str]
    file_format: str
    file_size: int
    added_at: str
    score: float


class ChatSearchRequest(BaseModel):
    query: str
    limit: int = 20
    library_id: Optional[int] = None


class ChatSearchResponse(BaseModel):
    parsed: Dict[str, Any]
    books: List[Dict[str, Any]]
    total: int


class ReadingListRequest(BaseModel):
    theme: Optional[str] = None
    limit: int = 12
    list_count: int = 3
    library_id: Optional[int] = None


class ReadingListBook(BaseModel):
    id: int
    title: str
    author_name: Optional[str]
    file_format: str
    file_size: int
    added_at: str
    score: float = 0.0


class ReadingList(BaseModel):
    title: str
    description: Optional[str] = None
    books: List[ReadingListBook]


class ReadingListsResponse(BaseModel):
    lists: List[ReadingList]
    parsed: Optional[Dict[str, Any]] = None


def _get_primary_version(book: Book) -> Optional[BookVersion]:
    if book.versions:
        primary = next((v for v in book.versions if v.is_primary), None)
        if not primary:
            primary = book.versions[0] if book.versions else None
        return primary
    return None


def _get_book_tag_names(book: Book) -> List[str]:
    if not book.book_tags:
        return []
    names = []
    for book_tag in book.book_tags:
        if book_tag.tag and book_tag.tag.name:
            names.append(book_tag.tag.name)
    return names


def _book_to_item(book: Book, score: float = 0.0) -> ReadingListBook:
    primary = _get_primary_version(book)
    return ReadingListBook(
        id=book.id,
        title=book.title,
        author_name=book.author.name if book.author else None,
        file_format=primary.file_format if primary else "unknown",
        file_size=primary.file_size if primary else 0,
        added_at=book.added_at.isoformat(),
        score=score,
    )


def _clamp(value: int, min_value: int, max_value: int) -> int:
    return max(min_value, min(max_value, value))


def _normalize_keyword(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _score_book_by_preferences(
    book: Book,
    preferred_tag_names: List[str],
    preferred_author_ids: List[int],
) -> float:
    tag_names = set(_get_book_tag_names(book))
    tag_score = len(tag_names & set(preferred_tag_names))
    author_score = 2.0 if book.author_id in preferred_author_ids else 0.0
    return tag_score * 2.0 + author_score


async def _filter_accessible_books(
    current_user: User,
    books: Iterable[Book],
    db: AsyncSession,
) -> List[Book]:
    accessible: List[Book] = []
    for book in books:
        if await check_book_access(current_user, book.id, db):
            accessible.append(book)
    return accessible


async def _build_list_from_books(
    title: str,
    books: Iterable[Book],
    current_user: User,
    db: AsyncSession,
    limit: int,
    description: Optional[str] = None,
    score_fn: Optional[Any] = None,
) -> ReadingList:
    limit = _clamp(limit, 5, 50)
    items: List[ReadingListBook] = []
    for book in books:
        if len(items) >= limit:
            break
        if not await check_book_access(current_user, book.id, db):
            continue
        score = score_fn(book) if score_fn else 0.0
        items.append(_book_to_item(book, score))

    if score_fn:
        items.sort(key=lambda item: (item.score, item.added_at), reverse=True)
        items = items[:limit]

    return ReadingList(title=title, description=description, books=items)


async def _build_ai_reading_lists(
    theme: Optional[str],
    preferred_tag_names: List[str],
    preferred_author_names: List[str],
    candidates: List[Book],
    list_count: int,
    limit: int,
) -> Tuple[Optional[List[ReadingList]], Optional[Dict[str, Any]]]:
    if not ai_config.is_enabled():
        return None, None

    if not candidates:
        return None, None

    sample_books = []
    for book in candidates[:60]:
        sample_books.append(
            {
                "id": book.id,
                "title": book.title,
                "author": book.author.name if book.author else None,
                "tags": _get_book_tag_names(book),
                "format": _get_primary_version(book).file_format if _get_primary_version(book) else "unknown",
            }
        )

    prompt = f"""你是书库推荐助手，只返回JSON。
请根据用户偏好和提供的书籍样本，生成书单列表。

用户主题: {theme or ""}
偏好标签: {preferred_tag_names}
偏好作者: {preferred_author_names}
书籍样本（只允许使用这些书籍的id）: {json.dumps(sample_books, ensure_ascii=False)}

返回JSON格式:
{{
  "lists": [
    {{
      "title": "书单标题",
      "description": "简短说明",
      "book_ids": [1,2,3]
    }}
  ]
}}
要求:
1. 只返回JSON，不要解释
2. lists 数量最多 {list_count} 个
3. 每个书单 book_ids 数量最多 {limit} 个
"""

    ai_service = get_ai_service()
    response = await ai_service.chat(
        messages=[
            {"role": "system", "content": "只返回JSON格式，不要解释。"},
            {"role": "user", "content": prompt},
        ]
    )
    if not response.success:
        return None, None

    content = response.content
    start = content.find("{")
    end = content.rfind("}") + 1
    if start < 0 or end <= start:
        return None, None

    try:
        parsed = json.loads(content[start:end])
    except Exception:
        return None, None

    raw_lists = parsed.get("lists") or []
    if not isinstance(raw_lists, list):
        return None, parsed

    book_map = {book.id: book for book in candidates}
    result_lists: List[ReadingList] = []
    for raw in raw_lists[:list_count]:
        if not isinstance(raw, dict):
            continue
        title = (raw.get("title") or "").strip()
        if not title:
            continue
        description = (raw.get("description") or "").strip() or None
        book_ids = raw.get("book_ids") or []
        if not isinstance(book_ids, list):
            continue
        items: List[ReadingListBook] = []
        for book_id in book_ids:
            if len(items) >= limit:
                break
            if not isinstance(book_id, int):
                continue
            book = book_map.get(book_id)
            if not book:
                continue
            items.append(_book_to_item(book))
        if items:
            result_lists.append(ReadingList(title=title, description=description, books=items))

    if not result_lists:
        return None, parsed

    return result_lists, parsed


@router.get("/recommendations", response_model=List[RecommendationItem])
async def get_recommendations(
    limit: int = 20,
    library_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    基于阅读历史/收藏/标签的推荐
    """
    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    if not accessible_library_ids:
        return []

    if library_id and library_id in accessible_library_ids:
        accessible_library_ids = [library_id]

    favorite_result = await db.execute(
        select(UserFavorite.book_id).where(UserFavorite.user_id == current_user.id)
    )
    favorite_ids = {row[0] for row in favorite_result.all()}

    progress_result = await db.execute(
        select(ReadingProgress.book_id).where(ReadingProgress.user_id == current_user.id)
    )
    progress_ids = {row[0] for row in progress_result.all()}

    seed_book_ids = favorite_ids | progress_ids

    if not seed_book_ids:
        query = (
            select(Book)
            .where(Book.library_id.in_(accessible_library_ids))
            .options(joinedload(Book.author), joinedload(Book.versions))
            .order_by(Book.added_at.desc())
            .limit(limit)
        )
        result = await db.execute(query)
        books = result.unique().scalars().all()
        response_items = []
        for book in books:
            if not await check_book_access(current_user, book.id, db):
                continue
            primary = _get_primary_version(book)
            response_items.append(
                RecommendationItem(
                    id=book.id,
                    title=book.title,
                    author_name=book.author.name if book.author else None,
                    file_format=primary.file_format if primary else "unknown",
                    file_size=primary.file_size if primary else 0,
                    added_at=book.added_at.isoformat(),
                    score=0.0,
                )
            )
        return response_items

    tag_result = await db.execute(
        select(BookTag.tag_id).where(BookTag.book_id.in_(seed_book_ids))
    )
    tag_ids = {row[0] for row in tag_result.all()}

    author_result = await db.execute(
        select(Book.author_id).where(Book.id.in_(seed_book_ids))
    )
    author_ids = {row[0] for row in author_result.all() if row[0] is not None}

    query = (
        select(Book)
        .where(Book.library_id.in_(accessible_library_ids))
        .options(
            joinedload(Book.author),
            joinedload(Book.book_tags).joinedload(BookTag.tag),
            joinedload(Book.versions),
        )
    )

    if seed_book_ids:
        query = query.where(Book.id.notin_(seed_book_ids))

    conditions = []
    if tag_ids:
        query = query.outerjoin(BookTag)
        conditions.append(BookTag.tag_id.in_(tag_ids))
    if author_ids:
        conditions.append(Book.author_id.in_(author_ids))
    if conditions:
        query = query.where(or_(*conditions))

    query = query.order_by(Book.added_at.desc()).limit(limit * 5)

    result = await db.execute(query)
    candidate_books = result.unique().scalars().all()

    recommendations: List[RecommendationItem] = []
    for book in candidate_books:
        if not await check_book_access(current_user, book.id, db):
            continue
        primary = _get_primary_version(book)
        book_tag_ids = {bt.tag_id for bt in book.book_tags}
        tag_score = len(book_tag_ids & tag_ids)
        author_score = 2.0 if book.author_id in author_ids else 0.0
        score = tag_score * 2.0 + author_score
        recommendations.append(
            RecommendationItem(
                id=book.id,
                title=book.title,
                author_name=book.author.name if book.author else None,
                file_format=primary.file_format if primary else "unknown",
                file_size=primary.file_size if primary else 0,
                added_at=book.added_at.isoformat(),
                score=score,
            )
        )

    recommendations.sort(key=lambda item: (item.score, item.added_at), reverse=True)
    return recommendations[:limit]


@router.post("/chat-search", response_model=ChatSearchResponse)
async def chat_search(
    request: ChatSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    对话式找书：将自然语言解析为检索条件
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="搜索内容不能为空")

    parsed: Dict[str, Any] = {
        "keywords": request.query.strip(),
        "author": None,
        "tags": [],
        "formats": [],
        "library_id": request.library_id,
    }

    if ai_config.is_enabled():
        prompt = f"""你是一个书籍检索助手。请把用户描述解析成检索条件，只返回JSON。
用户描述: {request.query}

返回JSON格式（字段可为空）:
{{
  "keywords": "核心关键词",
  "author": "作者名或null",
  "tags": ["标签1", "标签2"],
  "formats": ["txt","epub","pdf"],
  "library_id": null
}}
要求:
1. 只返回JSON
2. formats 必须是小写扩展名，不带点
"""
        ai_service = get_ai_service()
        response = await ai_service.chat(
            messages=[
                {"role": "system", "content": "只返回JSON格式，不要解释。"},
                {"role": "user", "content": prompt},
            ]
        )
        if response.success:
            content = response.content
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    parsed = json.loads(content[start:end])
                except Exception:
                    parsed = parsed

    keywords = (parsed.get("keywords") or "").strip()
    author_name = (parsed.get("author") or "").strip()
    tags = [t for t in (parsed.get("tags") or []) if isinstance(t, str)]
    formats = [f for f in (parsed.get("formats") or []) if isinstance(f, str)]

    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    if not accessible_library_ids:
        return {"parsed": parsed, "books": [], "total": 0}

    if request.library_id and request.library_id in accessible_library_ids:
        accessible_library_ids = [request.library_id]

    query = select(Book).options(
        joinedload(Book.author),
        joinedload(Book.book_tags).joinedload(BookTag.tag),
        joinedload(Book.versions),
    )
    query = query.where(Book.library_id.in_(accessible_library_ids))

    if keywords:
        search_term = f"%{keywords}%"
        query = query.outerjoin(Author, Book.author_id == Author.id)
        query = query.where(
            or_(
                Book.title.like(search_term),
                Author.name.like(search_term),
            )
        )

    if author_name:
        author_result = await db.execute(
            select(Author).where(Author.name.like(f"%{author_name}%"))
        )
        author = author_result.scalars().first()
        if author:
            query = query.where(Book.author_id == author.id)

    if formats:
        normalized = []
        for fmt in formats:
            cleaned = fmt.lower().replace(".", "").strip()
            if cleaned:
                normalized.append(f".{cleaned}")
                normalized.append(cleaned)
        if normalized:
            query = query.outerjoin(BookVersion).where(BookVersion.file_format.in_(normalized))

    if tags:
        query = query.outerjoin(BookTag).outerjoin(Tag).where(Tag.name.in_(tags))

    query = query.order_by(Book.added_at.desc()).limit(request.limit * 3)
    result = await db.execute(query)
    all_books = result.unique().scalars().all()

    filtered_books = []
    for book in all_books:
        if await check_book_access(current_user, book.id, db):
            filtered_books.append(book)

    response_books = []
    for book in filtered_books[: request.limit]:
        primary = _get_primary_version(book)
        response_books.append(
            {
                "id": book.id,
                "title": book.title,
                "author_name": book.author.name if book.author else None,
                "file_format": primary.file_format if primary else "unknown",
                "file_size": primary.file_size if primary else 0,
                "added_at": book.added_at.isoformat(),
            }
        )

    return {
        "parsed": parsed,
        "books": response_books,
        "total": len(filtered_books),
    }


@router.post("/reading-lists", response_model=ReadingListsResponse)
async def generate_reading_lists(
    request: ReadingListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    生成书单：支持主题/关键词/阅读偏好
    """
    limit = _clamp(request.limit, 5, 50)
    list_count = _clamp(request.list_count, 1, 6)

    accessible_library_ids = await get_accessible_library_ids(current_user, db)
    if not accessible_library_ids:
        return {"lists": []}

    if request.library_id and request.library_id in accessible_library_ids:
        accessible_library_ids = [request.library_id]

    favorite_result = await db.execute(
        select(UserFavorite.book_id).where(UserFavorite.user_id == current_user.id)
    )
    favorite_ids = {row[0] for row in favorite_result.all()}

    progress_result = await db.execute(
        select(ReadingProgress.book_id).where(ReadingProgress.user_id == current_user.id)
    )
    progress_ids = {row[0] for row in progress_result.all()}

    seed_book_ids = favorite_ids | progress_ids

    tag_counter: Counter = Counter()
    author_counter: Counter = Counter()
    if seed_book_ids:
        seed_books_result = await db.execute(
            select(Book)
            .where(Book.id.in_(seed_book_ids))
            .options(joinedload(Book.author), joinedload(Book.book_tags).joinedload(BookTag.tag))
        )
        seed_books = seed_books_result.unique().scalars().all()
        for book in seed_books:
            for tag_name in _get_book_tag_names(book):
                tag_counter[tag_name] += 1
            if book.author_id:
                author_counter[book.author_id] += 1

    preferred_tag_names = [name for name, _ in tag_counter.most_common(5)]
    preferred_author_ids = [author_id for author_id, _ in author_counter.most_common(3)]

    preferred_author_names: List[str] = []
    if preferred_author_ids:
        author_result = await db.execute(select(Author).where(Author.id.in_(preferred_author_ids)))
        preferred_author_names = [author.name for author in author_result.scalars().all() if author]

    query = (
        select(Book)
        .where(Book.library_id.in_(accessible_library_ids))
        .options(
            joinedload(Book.author),
            joinedload(Book.book_tags).joinedload(BookTag.tag),
            joinedload(Book.versions),
        )
        .order_by(Book.added_at.desc())
        .limit(200)
    )
    result = await db.execute(query)
    candidates = result.unique().scalars().all()

    if not candidates:
        return {"lists": []}

    # AI 生成书单（如果启用）
    ai_lists, parsed = await _build_ai_reading_lists(
        request.theme,
        preferred_tag_names,
        preferred_author_names,
        candidates,
        list_count,
        limit,
    )
    if ai_lists:
        return {"lists": ai_lists, "parsed": parsed}

    # 规则化生成书单
    theme_keyword = _normalize_keyword(request.theme)
    themed_candidates = candidates
    if theme_keyword:
        themed_candidates = [
            book
            for book in candidates
            if theme_keyword in (book.title or "").lower()
            or theme_keyword in (book.author.name.lower() if book.author else "")
            or any(theme_keyword in tag.lower() for tag in _get_book_tag_names(book))
        ]

    lists: List[ReadingList] = []

    if theme_keyword and themed_candidates:
        lists.append(
            await _build_list_from_books(
                title=f"主题精选：{request.theme}",
                description="根据你的主题关键词筛选",
                books=themed_candidates,
                current_user=current_user,
                db=db,
                limit=limit,
            )
        )

    if preferred_tag_names or preferred_author_ids:
        lists.append(
            await _build_list_from_books(
                title="你的偏好推荐",
                description="根据收藏与阅读偏好生成",
                books=candidates,
                current_user=current_user,
                db=db,
                limit=limit,
                score_fn=lambda book: _score_book_by_preferences(
                    book, preferred_tag_names, preferred_author_ids
                ),
            )
        )

    lists.append(
        await _build_list_from_books(
            title="最新入库",
            description="最近新增的书籍",
            books=candidates,
            current_user=current_user,
            db=db,
            limit=limit,
        )
    )

    # 保证书单数量
    lists = [lst for lst in lists if lst.books]
    return {"lists": lists[:list_count]}
