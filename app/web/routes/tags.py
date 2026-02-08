"""
标签管理路由
处理系统标签和书籍标签的管理
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, BookTag, Tag, User
from app.web.routes.auth import get_current_admin, get_current_user
from app.web.routes.dependencies import get_accessible_book
from app.utils.logger import log

router = APIRouter()


# ===== Pydantic 模型 =====

class TagCreate(BaseModel):
    """创建标签请求"""
    name: str
    type: str  # 'genre', 'age_rating', 'custom'
    description: Optional[str] = None


class TagResponse(BaseModel):
    """标签响应"""
    id: int
    name: str
    type: str
    description: Optional[str] = None
    created_at: str
    
    class Config:
        from_attributes = True


class BookTagCreate(BaseModel):
    """为书籍添加标签请求"""
    tag_id: int


class BlockedTagsUpdate(BaseModel):
    """更新屏蔽标签请求"""
    blocked_tag_ids: List[int]


class TagKeywordCategory(BaseModel):
    """标签关键词分类"""
    name: str
    tags: List[str]


class TagKeywordUpdate(BaseModel):
    """更新标签关键词库"""
    categories: dict


# ===== 标签管理 =====

@router.post("/tags/init-defaults")
async def init_default_tags(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    初始化预定义系统标签（需要管理员权限）
    
    Args:
        db: 数据库会话
        admin: 当前管理员
        
    Returns:
        创建结果
    """
    # 预定义标签
    predefined_tags = [
        # 年龄分级标签
        {"name": "全年龄", "type": "age_rating", "description": "适合所有年龄段阅读"},
        {"name": "12+", "type": "age_rating", "description": "适合12岁及以上读者"},
        {"name": "16+", "type": "age_rating", "description": "适合16岁及以上读者"},
        {"name": "18+", "type": "age_rating", "description": "仅限成人阅读"},
        
        # 题材标签
        {"name": "科幻", "type": "genre", "description": "科幻类小说"},
        {"name": "奇幻", "type": "genre", "description": "奇幻类小说"},
        {"name": "推理", "type": "genre", "description": "推理、侦探类小说"},
        {"name": "悬疑", "type": "genre", "description": "悬疑类小说"},
        {"name": "恐怖", "type": "genre", "description": "恐怖、惊悚类小说"},
        {"name": "言情", "type": "genre", "description": "言情、爱情类小说"},
        {"name": "武侠", "type": "genre", "description": "武侠类小说"},
        {"name": "仙侠", "type": "genre", "description": "仙侠、修真类小说"},
        {"name": "玄幻", "type": "genre", "description": "玄幻类小说"},
        {"name": "历史", "type": "genre", "description": "历史类小说"},
        {"name": "军事", "type": "genre", "description": "军事类小说"},
        {"name": "游戏", "type": "genre", "description": "游戏类小说"},
        {"name": "竞技", "type": "genre", "description": "竞技类小说"},
        {"name": "灵异", "type": "genre", "description": "灵异类小说"},
        {"name": "同人", "type": "genre", "description": "同人作品"},
        {"name": "轻小说", "type": "genre", "description": "轻小说"},
        {"name": "BL", "type": "genre", "description": "耽美/BL类小说"},
        {"name": "GL", "type": "genre", "description": "百合/GL类小说"},
        {"name": "都市", "type": "genre", "description": "都市类小说"},
        {"name": "校园", "type": "genre", "description": "校园类小说"},
        
        # 内容警告标签
        {"name": "暴力", "type": "custom", "description": "包含暴力内容"},
        {"name": "血腥", "type": "custom", "description": "包含血腥描写"},
        {"name": "情色", "type": "custom", "description": "包含情色内容"},
        {"name": "脏话", "type": "custom", "description": "包含粗俗语言"},
        
        # 其他常用标签
        {"name": "完结", "type": "custom", "description": "已完结作品"},
        {"name": "连载", "type": "custom", "description": "连载中作品"},
        {"name": "短篇", "type": "custom", "description": "短篇小说"},
        {"name": "长篇", "type": "custom", "description": "长篇小说"},
        {"name": "经典", "type": "custom", "description": "经典作品"},
        {"name": "热门", "type": "custom", "description": "热门作品"},
    ]
    
    created_count = 0
    skipped_count = 0
    created_tags = []
    
    for tag_data in predefined_tags:
        # 检查标签是否已存在
        result = await db.execute(
            select(Tag).where(Tag.name == tag_data["name"])
        )
        existing_tag = result.scalar_one_or_none()
        
        if existing_tag:
            skipped_count += 1
            continue
        
        # 创建新标签
        tag = Tag(**tag_data)
        db.add(tag)
        created_count += 1
        created_tags.append(tag_data["name"])
    
    await db.commit()
    
    log.info(f"管理员 {admin.username} 初始化了预定义标签，创建 {created_count} 个，跳过 {skipped_count} 个")
    
    return {
        "status": "success",
        "created_count": created_count,
        "skipped_count": skipped_count,
        "total_predefined": len(predefined_tags),
        "created_tags": created_tags
    }


@router.get("/tags/keywords", response_model=List[TagKeywordCategory])
async def get_tag_keywords(
    admin: User = Depends(get_current_admin)
):
    """
    获取内置标签关键词分类（管理员）
    """
    from app.core.tag_keywords import get_keyword_map

    keyword_map = get_keyword_map()
    categories = [
        {"name": category, "tags": list(tag_dict.keys())}
        for category, tag_dict in keyword_map.items()
    ]

    return categories


@router.get("/tags/keywords/raw")
async def get_tag_keywords_raw(
    admin: User = Depends(get_current_admin)
):
    """
    获取完整标签关键词库（管理员）
    """
    from app.core.tag_keywords import get_keyword_map

    return {
        "categories": get_keyword_map()
    }


@router.put("/tags/keywords")
async def update_tag_keywords(
    request: TagKeywordUpdate,
    admin: User = Depends(get_current_admin)
):
    """
    更新标签关键词库（管理员）
    """
    from app.core.tag_keywords import update_keywords

    try:
        keyword_map = update_keywords(request.categories)
        return {
            "message": "标签关键词库已更新",
            "category_count": len(keyword_map),
            "tag_count": sum(len(tag_dict) for tag_dict in keyword_map.values())
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/tags", response_model=TagResponse)
async def create_tag(
    tag_data: TagCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    创建系统标签（需要管理员权限）
    
    Args:
        tag_data: 标签数据
        db: 数据库会话
        admin: 当前管理员
        
    Returns:
        标签信息
    """
    # 验证标签类型
    valid_types = ['genre', 'age_rating', 'custom']
    if tag_data.type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的标签类型，必须是: {', '.join(valid_types)}"
        )
    
    # 检查标签名是否已存在
    result = await db.execute(
        select(Tag).where(Tag.name == tag_data.name)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="标签名称已存在"
        )
    
    # 创建标签
    tag = Tag(
        name=tag_data.name,
        type=tag_data.type,
        description=tag_data.description
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    
    log.info(f"管理员 {admin.username} 创建了标签: {tag.name} (类型: {tag.type})")
    
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "description": tag.description,
        "created_at": tag.created_at.isoformat()
    }


@router.post("/admin/tags", response_model=TagResponse)
async def create_tag_admin_alias(
    tag_data: TagCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    管理端创建标签（兼容前端使用 /api/admin/tags）
    """
    return await create_tag(tag_data, db, admin)


@router.get("/tags", response_model=List[TagResponse])
async def list_tags(
    type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取所有标签列表
    
    Args:
        type: 可选的标签类型过滤
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        标签列表
    """
    query = select(Tag)
    
    if type:
        query = query.where(Tag.type == type)
    
    query = query.order_by(Tag.type, Tag.name)
    
    result = await db.execute(query)
    tags = result.scalars().all()
    
    return [
        {
            "id": tag.id,
            "name": tag.name,
            "type": tag.type,
            "description": tag.description,
            "created_at": tag.created_at.isoformat()
        }
        for tag in tags
    ]


@router.get("/tags/library/{library_id}")
async def list_tags_by_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取指定书库中使用的标签及数量
    
    Args:
        library_id: 书库 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        标签列表（带书籍数量）
    """
    from sqlalchemy import func
    
    # 查询书库中书籍使用的标签及数量
    query = (
        select(
            Tag.id,
            Tag.name,
            Tag.type,
            Tag.description,
            func.count(BookTag.book_id).label('book_count')
        )
        .join(BookTag, BookTag.tag_id == Tag.id)
        .join(Book, Book.id == BookTag.book_id)
        .where(Book.library_id == library_id)
        .group_by(Tag.id, Tag.name, Tag.type, Tag.description)
        .having(func.count(BookTag.book_id) > 0)
        .order_by(func.count(BookTag.book_id).desc(), Tag.name)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "description": row.description,
            "book_count": row.book_count
        }
        for row in rows
    ]


@router.get("/tags/all-libraries")
async def list_tags_all_libraries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取所有书库中使用的标签及数量
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        标签列表（带书籍数量）
    """
    from sqlalchemy import func
    
    # 查询所有书籍使用的标签及数量
    query = (
        select(
            Tag.id,
            Tag.name,
            Tag.type,
            Tag.description,
            func.count(BookTag.book_id).label('book_count')
        )
        .join(BookTag, BookTag.tag_id == Tag.id)
        .group_by(Tag.id, Tag.name, Tag.type, Tag.description)
        .having(func.count(BookTag.book_id) > 0)
        .order_by(func.count(BookTag.book_id).desc(), Tag.name)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "description": row.description,
            "book_count": row.book_count
        }
        for row in rows
    ]


@router.get("/tags/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取标签详情
    
    Args:
        tag_id: 标签 ID
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        标签信息
    """
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "description": tag.description,
        "created_at": tag.created_at.isoformat()
    }


@router.put("/tags/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    tag_data: TagCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    更新标签信息（需要管理员权限）
    
    Args:
        tag_id: 标签 ID
        tag_data: 标签数据
        db: 数据库会话
        admin: 当前管理员
        
    Returns:
        更新后的标签信息
    """
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    # 检查新名称是否与其他标签冲突
    if tag_data.name != tag.name:
        result = await db.execute(
            select(Tag).where(Tag.name == tag_data.name)
        )
        existing = result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="标签名称已存在"
            )
    
    # 更新标签
    tag.name = tag_data.name
    tag.type = tag_data.type
    tag.description = tag_data.description
    
    await db.commit()
    await db.refresh(tag)
    
    log.info(f"管理员 {admin.username} 更新了标签: {tag.name}")
    
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "description": tag.description,
        "created_at": tag.created_at.isoformat()
    }


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    删除标签（需要管理员权限）
    
    Args:
        tag_id: 标签 ID
        db: 数据库会话
        admin: 当前管理员
        
    Returns:
        操作结果
    """
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    tag_name = tag.name
    await db.delete(tag)
    await db.commit()
    
    log.info(f"管理员 {admin.username} 删除了标签: {tag_name}")
    
    return {"status": "success", "message": "标签已删除"}


# ===== 书籍标签管理 =====

@router.post("/books/{book_id}/tags")
async def add_book_tag(
    book_id: int,
    tag_data: BookTagCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    为书籍添加标签（需要管理员权限）
    
    Args:
        book_id: 书籍 ID
        tag_data: 标签数据
        db: 数据库会话
        admin: 当前管理员
        
    Returns:
        操作结果
    """
    # 检查书籍是否存在
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="书籍不存在"
        )
    
    # 检查标签是否存在
    tag = await db.get(Tag, tag_data.tag_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    # 检查是否已存在此标签
    result = await db.execute(
        select(BookTag)
        .where(BookTag.book_id == book_id)
        .where(BookTag.tag_id == tag_data.tag_id)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该书籍已拥有此标签"
        )
    
    # 添加标签
    book_tag = BookTag(
        book_id=book_id,
        tag_id=tag_data.tag_id
    )
    db.add(book_tag)
    await db.commit()
    
    log.info(f"管理员 {admin.username} 为书籍 {book.title} 添加了标签 {tag.name}")
    
    return {
        "status": "success",
        "book_id": book_id,
        "tag_id": tag_data.tag_id,
        "tag_name": tag.name
    }


@router.delete("/books/{book_id}/tags/{tag_id}")
async def remove_book_tag(
    book_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    移除书籍标签（需要管理员权限）
    
    Args:
        book_id: 书籍 ID
        tag_id: 标签 ID
        db: 数据库会话
        admin: 当前管理员
        
    Returns:
        操作结果
    """
    result = await db.execute(
        select(BookTag)
        .where(BookTag.book_id == book_id)
        .where(BookTag.tag_id == tag_id)
    )
    book_tag = result.scalar_one_or_none()
    
    if not book_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签关联不存在"
        )
    
    await db.delete(book_tag)
    await db.commit()
    
    log.info(f"管理员 {admin.username} 移除了书籍 {book_id} 的标签 {tag_id}")
    
    return {"status": "success", "message": "标签已移除"}


@router.get("/books/{book_id}/tags", response_model=List[TagResponse])
async def get_book_tags(
    book_id: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书籍的所有标签
    
    Args:
        book_id: 书籍 ID
        book: 书籍对象（通过依赖注入验证权限）
        db: 数据库会话
        
    Returns:
        标签列表
    """
    result = await db.execute(
        select(Tag)
        .join(BookTag, BookTag.tag_id == Tag.id)
        .where(BookTag.book_id == book_id)
    )
    tags = result.scalars().all()
    
    return [
        {
            "id": tag.id,
            "name": tag.name,
            "type": tag.type,
            "description": tag.description,
            "created_at": tag.created_at.isoformat()
        }
        for tag in tags
    ]


# ===== 用户屏蔽标签设置 =====

@router.get("/user/blocked-tags")
async def get_blocked_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户的屏蔽标签列表
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        屏蔽的标签列表
    """
    if not current_user.blocked_tags:
        return {"blocked_tag_ids": []}
    
    try:
        blocked_tag_ids = json.loads(current_user.blocked_tags)
    except (json.JSONDecodeError, TypeError):
        blocked_tag_ids = []
    
    # 获取标签详情
    if blocked_tag_ids:
        result = await db.execute(
            select(Tag).where(Tag.id.in_(blocked_tag_ids))
        )
        tags = result.scalars().all()
        
        return {
            "blocked_tag_ids": blocked_tag_ids,
            "blocked_tags": [
                {
                    "id": tag.id,
                    "name": tag.name,
                    "type": tag.type
                }
                for tag in tags
            ]
        }
    
    return {"blocked_tag_ids": [], "blocked_tags": []}


@router.post("/user/blocked-tags")
async def update_blocked_tags(
    blocked_data: BlockedTagsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    更新当前用户的屏蔽标签列表
    
    Args:
        blocked_data: 屏蔽标签数据
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        操作结果
    """
    # 验证所有标签ID是否存在
    if blocked_data.blocked_tag_ids:
        result = await db.execute(
            select(Tag.id).where(Tag.id.in_(blocked_data.blocked_tag_ids))
        )
        valid_tag_ids = {row[0] for row in result.all()}
        
        invalid_ids = set(blocked_data.blocked_tag_ids) - valid_tag_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"无效的标签ID: {list(invalid_ids)}"
            )
    
    # 更新用户的屏蔽标签
    current_user.blocked_tags = json.dumps(blocked_data.blocked_tag_ids)
    await db.commit()
    
    log.info(f"用户 {current_user.username} 更新了屏蔽标签列表")
    
    return {
        "status": "success",
        "blocked_tag_ids": blocked_data.blocked_tag_ids
    }
