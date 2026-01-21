"""
AI 推荐与对话式找书
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import (
    Book,
    BookTag,
    User,
    UserFavorite,
    ReadingProgress,
    BookVersion,
)
from app.utils.permissions import check_book_access, get_accessible_library_ids
from app.web.routes.auth import get_current_user


router = APIRouter()


class RecommendationItem(BaseModel):
    id: int
    title: str
    author_name: Optional[str]
    file_format: str
    file_size: int
    added_at: str
    score: float


def _get_primary_version(book: Book) -> Optional[BookVersion]:
    if book.versions:
        primary = next((v for v in book.versions if v.is_primary), None)
        if not primary:
            primary = book.versions[0] if book.versions else None
        return primary
    return None


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
