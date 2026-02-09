"""
分享链接相关路由
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.config import settings
from app.database import get_db
from app.models import Book, BookVersion, Favorite, User
from app.security import create_share_token, decode_share_token
from app.web.routes.auth import get_current_user

router = APIRouter(prefix="/api/share", tags=["share"])


def _get_primary_version(book: Book) -> Optional[BookVersion]:
    if not book.versions:
        return None
    primary = next((v for v in book.versions if v.is_primary), None)
    return primary or book.versions[0]


@router.post("/favorites")
async def create_favorites_share_link(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    生成收藏夹分享链接（公开访问）
    """
    expires_days = settings.security.share_token_expire_days
    expires_at = datetime.utcnow() + timedelta(days=expires_days)
    token = create_share_token(
        {"sub": str(current_user.id), "scope": "favorites"},
        expires_days=expires_days
    )
    base_url = str(request.base_url).rstrip("/")
    share_url = f"{base_url}/share/favorites?token={token}"

    return {
        "token": token,
        "url": share_url,
        "expires_at": expires_at.isoformat()
    }


@router.get("/favorites")
async def get_shared_favorites(
    token: str = Query(..., description="分享链接 Token"),
    db: AsyncSession = Depends(get_db)
):
    """
    公开访问收藏夹内容
    """
    payload = decode_share_token(token)
    if not payload or payload.get("scope") != "favorites":
        raise HTTPException(status_code=400, detail="分享链接无效或已过期")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="分享链接无效或已过期")

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="分享链接无效或已过期")

    user = await db.get(User, user_id_int)
    if not user:
        raise HTTPException(status_code=404, detail="分享用户不存在")

    result = await db.execute(
        select(Favorite, Book)
        .join(Book, Favorite.book_id == Book.id)
        .options(joinedload(Book.author), selectinload(Book.versions))
        .where(Favorite.user_id == user.id)
        .order_by(Favorite.created_at.desc())
    )
    # 若 Book 上存在 joined eager load 的集合关系，需要 unique() 去重
    favorites = result.unique().all()

    items = []
    for favorite, book in favorites:
        primary_version = _get_primary_version(book)
        items.append({
            "id": favorite.id,
            "book_id": book.id,
            "title": book.title,
            "author_name": book.author.name if book.author else None,
            "file_format": primary_version.file_format if primary_version else None,
            "added_at": favorite.created_at.isoformat() if favorite.created_at else None,
            "cover_url": f"/books/{book.id}/cover"
        })

    expires_at: Optional[str] = None
    if payload.get("exp"):
        try:
            expires_at = datetime.utcfromtimestamp(payload["exp"]).isoformat()
        except Exception:
            expires_at = None

    return {
        "owner": user.username,
        "total": len(items),
        "items": items,
        "expires_at": expires_at
    }
