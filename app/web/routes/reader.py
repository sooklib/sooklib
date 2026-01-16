"""
阅读器路由
提供在线阅读功能
"""
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, User
from app.web.routes.auth import get_current_user
from app.web.routes.dependencies import get_accessible_book
from app.utils.logger import log

router = APIRouter()


@router.get("/books/{book_id}/content")
async def get_book_content(
    book: Book = Depends(get_accessible_book),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍内容（用于在线阅读）
    需要有书籍访问权限
    """
    
    file_path = Path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 根据文件格式返回内容
    file_format = book.file_format.lower()
    
    if file_format == '.txt':
        return await _read_txt_content(file_path)
    elif file_format == '.epub':
        # EPUB 文件直接返回，由前端 epub.js 处理
        return FileResponse(
            file_path,
            media_type="application/epub+zip",
            filename=book.file_name
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {file_format}"
        )


async def _read_txt_content(file_path: Path) -> dict:
    """
    读取TXT文件内容
    """
    try:
        # 尝试多种编码
        encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030']
        content = None
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                break
            except UnicodeDecodeError:
                continue
        
        if content is None:
            raise HTTPException(
                status_code=500,
                detail="无法解码文件内容"
            )
        
        return {
            "format": "txt",
            "content": content,
            "length": len(content)
        }
    
    except Exception as e:
        log.error(f"读取TXT文件失败: {file_path}, 错误: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"读取文件失败: {str(e)}"
        )


@router.get("/books/{book_id}/download")
async def download_book(
    book: Book = Depends(get_accessible_book),
    current_user: User = Depends(get_current_user)
):
    """
    下载书籍原始文件
    需要有书籍访问权限
    """
    
    file_path = Path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 返回文件
    return FileResponse(
        file_path,
        filename=book.file_name,
        media_type="application/octet-stream"
    )


@router.get("/books/{book_id}/cover")
async def get_book_cover(
    book_id: int,
    size: str = Query("original", regex="^(original|thumbnail)$"),
    style: str = Query("gradient", regex="^(gradient|letter|book|minimal)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书籍封面
    公开访问（封面不是敏感数据）
    
    参数:
    - size: original(原图) 或 thumbnail(缩略图)
    - style: 默认封面风格 (gradient/letter/book/minimal)
    """
    from app.utils.cover_manager import cover_manager
    from sqlalchemy.orm import selectinload
    
    # 获取书籍
    result = await db.execute(
        select(Book).options(selectinload(Book.author)).where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    # 如果有封面路径，返回封面
    if book.cover_path:
        cover_path = await cover_manager.get_cover_path(book.id, db, size)
        if cover_path and Path(cover_path).exists():
            return FileResponse(
                cover_path,
                media_type="image/jpeg"
            )
    
    # 否则生成默认封面
    cover_bytes = cover_manager.generate_default_cover(
        title=book.title,
        author=book.author.name if book.author else None,
        style=style
    )
    
    return Response(
        content=cover_bytes,
        media_type="image/png"
    )
