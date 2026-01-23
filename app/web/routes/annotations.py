"""
笔记/批注相关的 API 路由
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Annotation, Book, User
from app.web.routes.dependencies import get_current_user

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


def _safe_int_param(value: Optional[str], default: int, min_value: int, max_value: int) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(min_value, min(max_value, parsed))


# ============== Pydantic 模型 ==============

class AnnotationCreate(BaseModel):
    """创建批注请求"""
    book_id: int
    chapter_index: int
    chapter_title: Optional[str] = None
    start_offset: int
    end_offset: int
    selected_text: str
    note: Optional[str] = None
    annotation_type: str = "highlight"  # highlight, note, underline
    color: str = "yellow"  # yellow, green, blue, red, purple


class AnnotationUpdate(BaseModel):
    """更新批注请求"""
    note: Optional[str] = None
    color: Optional[str] = None
    annotation_type: Optional[str] = None


class AnnotationResponse(BaseModel):
    """批注响应"""
    id: int
    user_id: int
    book_id: int
    chapter_index: int
    chapter_title: Optional[str]
    start_offset: int
    end_offset: int
    selected_text: str
    note: Optional[str]
    annotation_type: str
    color: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnnotationExport(BaseModel):
    """导出批注"""
    book_title: str
    total_annotations: int
    annotations: List[AnnotationResponse]
    exported_at: datetime


class AnnotationListItem(BaseModel):
    """批注列表项"""
    id: int
    book_id: int
    book_title: str
    chapter_index: int
    chapter_title: Optional[str]
    selected_text: str
    note: Optional[str]
    annotation_type: str
    color: str
    updated_at: datetime

    class Config:
        from_attributes = True


# ============== API 路由 ==============

@router.post("", response_model=AnnotationResponse)
async def create_annotation(
    data: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    创建新的批注/高亮
    """
    # 验证书籍存在
    book = await db.get(Book, data.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    # 检查是否已存在相同位置的批注
    stmt = select(Annotation).where(
        and_(
            Annotation.user_id == current_user.id,
            Annotation.book_id == data.book_id,
            Annotation.chapter_index == data.chapter_index,
            Annotation.start_offset == data.start_offset,
            Annotation.end_offset == data.end_offset
        )
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    
    if existing:
        # 更新现有批注
        existing.selected_text = data.selected_text
        existing.note = data.note
        existing.annotation_type = data.annotation_type
        existing.color = data.color
        existing.chapter_title = data.chapter_title
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing
    
    # 创建新批注
    annotation = Annotation(
        user_id=current_user.id,
        book_id=data.book_id,
        chapter_index=data.chapter_index,
        chapter_title=data.chapter_title,
        start_offset=data.start_offset,
        end_offset=data.end_offset,
        selected_text=data.selected_text,
        note=data.note,
        annotation_type=data.annotation_type,
        color=data.color
    )
    
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    
    return annotation


@router.get("/book/{book_id}", response_model=List[AnnotationResponse])
async def get_book_annotations(
    book_id: int,
    chapter_index: Optional[int] = None,
    annotation_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍的所有批注
    可选筛选：章节索引、批注类型
    """
    conditions = [
        Annotation.user_id == current_user.id,
        Annotation.book_id == book_id
    ]
    
    if chapter_index is not None:
        conditions.append(Annotation.chapter_index == chapter_index)
    
    if annotation_type:
        conditions.append(Annotation.annotation_type == annotation_type)
    
    stmt = select(Annotation).where(and_(*conditions)).order_by(
        Annotation.chapter_index,
        Annotation.start_offset
    )
    
    result = await db.execute(stmt)
    annotations = result.scalars().all()
    
    return annotations


@router.get("/book/{book_id}/chapter/{chapter_index}", response_model=List[AnnotationResponse])
async def get_chapter_annotations(
    book_id: int,
    chapter_index: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取指定章节的所有批注
    """
    stmt = select(Annotation).where(
        and_(
            Annotation.user_id == current_user.id,
            Annotation.book_id == book_id,
            Annotation.chapter_index == chapter_index
        )
    ).order_by(Annotation.start_offset)
    
    result = await db.execute(stmt)
    annotations = result.scalars().all()
    
    return annotations


@router.get("/book/{book_id}/export", response_model=AnnotationExport)
async def export_book_annotations(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    导出书籍的所有批注
    """
    # 获取书籍信息
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    # 获取所有批注
    stmt = select(Annotation).where(
        and_(
            Annotation.user_id == current_user.id,
            Annotation.book_id == book_id
        )
    ).order_by(
        Annotation.chapter_index,
        Annotation.start_offset
    )
    
    result = await db.execute(stmt)
    annotations = result.scalars().all()
    
    return AnnotationExport(
        book_title=book.title,
        total_annotations=len(annotations),
        annotations=annotations,
        exported_at=datetime.utcnow()
    )


@router.get("/my/stats")
async def get_annotation_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取用户的批注统计信息
    """
    # 总批注数
    stmt_total = select(func.count(Annotation.id)).where(
        Annotation.user_id == current_user.id
    )
    result = await db.execute(stmt_total)
    total = result.scalar() or 0
    
    # 按类型统计
    stmt_by_type = select(
        Annotation.annotation_type,
        func.count(Annotation.id)
    ).where(
        Annotation.user_id == current_user.id
    ).group_by(Annotation.annotation_type)
    
    result = await db.execute(stmt_by_type)
    by_type = {row[0]: row[1] for row in result.all()}
    
    # 按颜色统计
    stmt_by_color = select(
        Annotation.color,
        func.count(Annotation.id)
    ).where(
        Annotation.user_id == current_user.id
    ).group_by(Annotation.color)
    
    result = await db.execute(stmt_by_color)
    by_color = {row[0]: row[1] for row in result.all()}
    
    # 有批注的书籍数
    stmt_books = select(func.count(func.distinct(Annotation.book_id))).where(
        Annotation.user_id == current_user.id
    )
    result = await db.execute(stmt_books)
    books_with_annotations = result.scalar() or 0
    
    return {
        "total_annotations": total,
        "by_type": by_type,
        "by_color": by_color,
        "books_with_annotations": books_with_annotations
    }


@router.get("/my/recent", response_model=List[AnnotationResponse])
async def get_recent_annotations(
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取用户最近的批注
    """
    stmt = select(Annotation).where(
        Annotation.user_id == current_user.id
    ).order_by(
        Annotation.updated_at.desc()
    ).limit(limit)
    
    result = await db.execute(stmt)
    annotations = result.scalars().all()
    
    return annotations


@router.get("/my")
async def list_my_annotations(
    page: Optional[str] = Query(default="1"),
    limit: Optional[str] = Query(default="50"),
    book_id: Optional[int] = None,
    keyword: Optional[str] = None,
    annotation_type: Optional[str] = None,
    color: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取用户批注列表（支持筛选与分页）
    """
    page_num = _safe_int_param(page, 1, 1, 100000)
    limit_num = _safe_int_param(limit, 50, 1, 200)

    conditions = [Annotation.user_id == current_user.id]

    if book_id is not None:
        conditions.append(Annotation.book_id == book_id)

    if annotation_type:
        conditions.append(Annotation.annotation_type == annotation_type)

    if color:
        conditions.append(Annotation.color == color)

    if keyword:
        keyword_like = f"%{keyword}%"
        conditions.append(or_(
            Annotation.selected_text.ilike(keyword_like),
            Annotation.note.ilike(keyword_like),
            Book.title.ilike(keyword_like)
        ))

    count_stmt = select(func.count(Annotation.id)).select_from(Annotation).join(
        Book, Annotation.book_id == Book.id
    ).where(and_(*conditions))
    result = await db.execute(count_stmt)
    total = result.scalar() or 0

    stmt = (
        select(Annotation, Book)
        .join(Book, Annotation.book_id == Book.id)
        .where(and_(*conditions))
        .order_by(Annotation.updated_at.desc())
        .limit(limit_num)
        .offset((page_num - 1) * limit_num)
    )

    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for annotation, book in rows:
        items.append({
            "id": annotation.id,
            "book_id": book.id,
            "book_title": book.title,
            "chapter_index": annotation.chapter_index,
            "chapter_title": annotation.chapter_title,
            "selected_text": annotation.selected_text,
            "note": annotation.note,
            "annotation_type": annotation.annotation_type,
            "color": annotation.color,
            "updated_at": annotation.updated_at
        })

    total_pages = (total + limit_num - 1) // limit_num if total else 0

    return {
        "items": items,
        "total": total,
        "page": page_num,
        "limit": limit_num,
        "total_pages": total_pages
    }


@router.get("/{annotation_id}", response_model=AnnotationResponse)
async def get_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取单个批注详情
    """
    stmt = select(Annotation).where(
        and_(
            Annotation.id == annotation_id,
            Annotation.user_id == current_user.id
        )
    )
    result = await db.execute(stmt)
    annotation = result.scalar_one_or_none()
    
    if not annotation:
        raise HTTPException(status_code=404, detail="批注不存在")
    
    return annotation


@router.put("/{annotation_id}", response_model=AnnotationResponse)
async def update_annotation(
    annotation_id: int,
    data: AnnotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    更新批注（笔记内容、颜色等）
    """
    stmt = select(Annotation).where(
        and_(
            Annotation.id == annotation_id,
            Annotation.user_id == current_user.id
        )
    )
    result = await db.execute(stmt)
    annotation = result.scalar_one_or_none()
    
    if not annotation:
        raise HTTPException(status_code=404, detail="批注不存在")
    
    # 更新字段
    if data.note is not None:
        annotation.note = data.note
        if data.note.strip():
            annotation.annotation_type = "note"  # 有笔记内容则设为 note 类型
    
    if data.color:
        annotation.color = data.color
    
    if data.annotation_type:
        annotation.annotation_type = data.annotation_type
    
    annotation.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(annotation)
    
    return annotation


@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    删除批注
    """
    stmt = select(Annotation).where(
        and_(
            Annotation.id == annotation_id,
            Annotation.user_id == current_user.id
        )
    )
    result = await db.execute(stmt)
    annotation = result.scalar_one_or_none()
    
    if not annotation:
        raise HTTPException(status_code=404, detail="批注不存在")
    
    await db.delete(annotation)
    await db.commit()
    
    return {"message": "批注已删除"}


@router.delete("/book/{book_id}/all")
async def delete_all_book_annotations(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    删除书籍的所有批注
    """
    stmt = select(Annotation).where(
        and_(
            Annotation.user_id == current_user.id,
            Annotation.book_id == book_id
        )
    )
    result = await db.execute(stmt)
    annotations = result.scalars().all()
    
    count = len(annotations)
    
    for annotation in annotations:
        await db.delete(annotation)
    
    await db.commit()
    
    return {"message": f"已删除 {count} 个批注"}
