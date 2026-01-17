"""
阅读器路由
提供在线阅读功能
"""
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, User
from app.web.routes.auth import get_current_user
from app.web.routes.dependencies import get_accessible_book
from app.utils.logger import log

router = APIRouter()


# 大文件阈值：500KB
LARGE_FILE_THRESHOLD = 500 * 1024
# 每页字符数
CHARS_PER_PAGE = 50000


@router.get("/books/{book_id}/toc")
async def get_book_toc(
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍目录（完整目录，不返回内容）
    对于大TXT文件，解析全书章节后返回目录信息
    """
    from sqlalchemy.orm import selectinload
    import re
    
    await db.refresh(book, ['versions'])
    
    primary_version = None
    if book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
    
    if not primary_version:
        raise HTTPException(status_code=404, detail="书籍没有可用的文件版本")
    
    file_path = Path(primary_version.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    file_format = primary_version.file_format.lower()
    
    if file_format in ['txt', '.txt']:
        # 读取全文并解析章节（仅提取目录，不返回内容）
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
            raise HTTPException(status_code=500, detail="无法解码文件内容")
        
        # 清理内容
        content = _clean_txt_content(content)
        total_length = len(content)
        
        # 解析章节
        chapters = _parse_chapters(content)
        
        return {
            "format": "txt",
            "totalLength": total_length,
            "chapters": chapters,
            "charsPerPage": CHARS_PER_PAGE,
            "totalPages": (total_length + CHARS_PER_PAGE - 1) // CHARS_PER_PAGE
        }
    
    elif file_format in ['epub', '.epub']:
        # EPUB 目录由 epub.js 处理
        return {
            "format": "epub",
            "message": "EPUB目录由前端处理"
        }
    
    else:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {file_format}")


def _parse_chapters(content: str) -> list:
    """解析章节目录"""
    import re
    
    chapter_patterns = [
        # 标准中文章节：第xxx章/节/卷/集/部/篇/回
        r'^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        # 英文章节：Chapter 1
        r'^Chapter\s+\d+.*$',
        # 卷号：卷一
        r'^卷[零一二三四五六七八九十百千\d]+.*$',
        # 特殊符号包裹：【xxx】、[xxx]、(xxx)
        r'^[【\[\(].+[】\]\)]$',
        # 纯数字章节：1、2、3 (通常后面跟标题)
        r'^\d+\s+.*$',
        # 序章、前言、后记、番外
        r'^(序章|前言|后记|番外|尾声|楔子).*$',
        # 章节名直接开始（需要谨慎，避免误判）
        # r'^[^\s].*$' 
    ]
    
    all_matches = []
    
    for pattern in chapter_patterns:
        regex = re.compile(pattern, re.MULTILINE | re.IGNORECASE)
        for match in regex.finditer(content):
            all_matches.append({
                "title": match.group().strip(),
                "startOffset": match.start()
            })
    
    # 按位置排序并去重
    all_matches.sort(key=lambda x: x["startOffset"])
    
    filtered = []
    for match in all_matches:
        if not filtered or match["startOffset"] - filtered[-1]["startOffset"] > 100:
            filtered.append(match)
    
    # 计算结束位置
    chapters = []
    for i, ch in enumerate(filtered):
        end_offset = filtered[i + 1]["startOffset"] if i < len(filtered) - 1 else len(content)
        chapters.append({
            "title": ch["title"],
            "startOffset": ch["startOffset"],
            "endOffset": end_offset
        })
    
    # 如果没有章节，返回"全文"
    if not chapters:
        chapters.append({
            "title": "全文",
            "startOffset": 0,
            "endOffset": len(content)
        })
    
    return chapters


@router.get("/books/{book_id}/chapter/{chapter_index}")
async def get_chapter_content(
    chapter_index: int,
    buffer: int = Query(1, ge=0, le=3, description="前后缓冲章节数"),
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取指定章节及前后缓冲章节的内容
    
    参数:
    - chapter_index: 章节索引（从0开始）
    - buffer: 前后各加载多少章作为缓冲（默认1，即加载前后各1章）
    
    返回:
    - chapters: 章节内容列表（包含当前章节及缓冲章节）
    - currentIndex: 当前章节在返回列表中的索引
    - totalChapters: 全书总章节数
    """
    from sqlalchemy.orm import selectinload
    
    await db.refresh(book, ['versions'])
    
    primary_version = None
    if book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
    
    if not primary_version:
        raise HTTPException(status_code=404, detail="书籍没有可用的文件版本")
    
    file_path = Path(primary_version.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    file_format = primary_version.file_format.lower()
    
    if file_format not in ['txt', '.txt']:
        raise HTTPException(status_code=400, detail="此API仅支持TXT格式")
    
    # 读取文件内容
    content = await _read_txt_file(file_path)
    if content is None:
        raise HTTPException(status_code=500, detail="无法解码文件内容")
    
    # 解析章节
    all_chapters = _parse_chapters(content)
    total_chapters = len(all_chapters)
    
    if chapter_index < 0 or chapter_index >= total_chapters:
        raise HTTPException(status_code=400, detail=f"章节索引超出范围，有效范围: 0-{total_chapters-1}")
    
    # 计算加载范围（当前章节 ± buffer）
    start_index = max(0, chapter_index - buffer)
    end_index = min(total_chapters, chapter_index + buffer + 1)
    
    # 提取章节内容
    result_chapters = []
    for i in range(start_index, end_index):
        ch = all_chapters[i]
        chapter_content = content[ch["startOffset"]:ch["endOffset"]]
        # 移除章节标题（因为会单独显示）
        chapter_content = chapter_content.replace(ch["title"], "", 1).strip()
        result_chapters.append({
            "index": i,
            "title": ch["title"],
            "content": chapter_content,
            "startOffset": ch["startOffset"],
            "endOffset": ch["endOffset"]
        })
    
    # 当前章节在返回列表中的位置
    current_index_in_result = chapter_index - start_index
    
    return {
        "format": "txt",
        "chapters": result_chapters,
        "currentIndex": current_index_in_result,
        "requestedChapterIndex": chapter_index,
        "totalChapters": total_chapters,
        "totalLength": len(content),
        "loadedRange": {
            "start": start_index,
            "end": end_index - 1
        }
    }


async def _read_txt_file(file_path: Path) -> Optional[str]:
    """读取TXT文件内容（支持多种编码）"""
    encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030']
    
    for encoding in encodings:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                content = f.read()
            return _clean_txt_content(content)
        except UnicodeDecodeError:
            continue
    
    return None


@router.get("/books/{book_id}/content")
async def get_book_content(
    page: int = Query(0, ge=0, description="页码，从0开始（兼容旧API）"),
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍内容（用于在线阅读）
    需要有书籍访问权限
    
    对于大文件（>500KB）支持分页加载：
    - page: 页码，从0开始
    - 每页约50000字符
    """
    from sqlalchemy.orm import selectinload
    
    # 加载书籍版本
    await db.refresh(book, ['versions'])
    
    # 获取主版本
    primary_version = None
    if book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
    
    if not primary_version:
        raise HTTPException(status_code=404, detail="书籍没有可用的文件版本")
    
    file_path = Path(primary_version.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 根据文件格式返回内容
    file_format = primary_version.file_format.lower()
    
    if file_format == 'txt' or file_format == '.txt':
        return await _read_txt_content(file_path, page)
    elif file_format == 'epub' or file_format == '.epub':
        # EPUB 文件直接返回，由前端 epub.js 处理
        return FileResponse(
            file_path,
            media_type="application/epub+zip",
            filename=primary_version.file_name
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {file_format}"
        )


async def _read_txt_content(file_path: Path, page: int = 0) -> dict:
    """
    读取TXT文件内容（支持分页）
    
    Args:
        file_path: 文件路径
        page: 页码（从0开始）
    """
    import re
    
    try:
        file_size = file_path.stat().st_size
        is_large_file = file_size > LARGE_FILE_THRESHOLD
        
        # 尝试多种编码
        encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030']
        content = None
        used_encoding = None
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                used_encoding = encoding
                break
            except UnicodeDecodeError:
                continue
        
        if content is None:
            raise HTTPException(
                status_code=500,
                detail="无法解码文件内容"
            )
        
        # 清理常见的网站标记和乱码
        content = _clean_txt_content(content)
        
        total_length = len(content)
        total_pages = (total_length + CHARS_PER_PAGE - 1) // CHARS_PER_PAGE
        
        # 小文件或page=0时返回全部（向后兼容）
        if not is_large_file or total_pages <= 1:
            return {
                "format": "txt",
                "content": content,
                "length": total_length,
                "page": 0,
                "totalPages": 1,
                "hasMore": False
            }
        
        # 大文件分页加载
        start = page * CHARS_PER_PAGE
        end = min(start + CHARS_PER_PAGE, total_length)
        
        if start >= total_length:
            raise HTTPException(
                status_code=400,
                detail=f"页码超出范围，最大页码为 {total_pages - 1}"
            )
        
        page_content = content[start:end]
        
        return {
            "format": "txt",
            "content": page_content,
            "length": total_length,
            "page": page,
            "totalPages": total_pages,
            "hasMore": end < total_length,
            "startOffset": start,
            "endOffset": end
        }
    
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"读取TXT文件失败: {file_path}, 错误: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"读取文件失败: {str(e)}"
        )


@router.get("/books/{book_id}/download")
async def download_book(
    book_id: int,
    token: str = Query(None, description="JWT Token（可选，用于不支持 Header 的场景）"),
    db: AsyncSession = Depends(get_db)
):
    """
    下载书籍原始文件
    支持两种认证方式:
    1. Authorization Header (优先)
    2. URL 参数 ?token=xxx (用于浏览器直接下载)
    """
    from sqlalchemy.orm import selectinload
    from app.security import decode_access_token
    from app.utils.permissions import check_book_access
    from app.models import BookVersion
    
    # 获取 token - 优先从 URL 参数获取
    if not token:
        raise HTTPException(status_code=401, detail="需要认证，请在 URL 中添加 ?token=xxx")
    
    # 验证 token
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="无效的 token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token 验证失败: {str(e)}")
    
    # 获取用户
    result = await db.execute(
        select(User).where(User.username == username)
    )
    current_user = result.scalar_one_or_none()
    
    if not current_user:
        raise HTTPException(status_code=401, detail="用户不存在")
    
    # 获取书籍（带版本）
    result = await db.execute(
        select(Book).options(selectinload(Book.versions)).where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    # 检查权限
    if not await check_book_access(current_user, book_id, db):
        raise HTTPException(status_code=403, detail="无权访问此书籍")
    
    # 获取主版本
    primary_version = None
    if book.versions:
        primary_version = next((v for v in book.versions if v.is_primary), None)
        if not primary_version:
            primary_version = book.versions[0] if book.versions else None
    
    if not primary_version:
        raise HTTPException(status_code=404, detail="书籍没有可用的文件版本")
    
    file_path = Path(primary_version.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 返回文件
    return FileResponse(
        file_path,
        filename=primary_version.file_name,
        media_type="application/octet-stream"
    )


@router.get("/books/{book_id}/cover")
async def get_book_cover(
    book_id: int,
    size: str = Query("original", regex="^(original|thumbnail)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书籍封面
    公开访问（封面不是敏感数据）
    
    参数:
    - size: original(原图) 或 thumbnail(缩略图)
    
    注意：如果书籍没有封面，返回404，由前端处理fallback显示
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
    
    # 没有封面时返回404，让前端显示fallback UI
    raise HTTPException(status_code=404, detail="该书籍没有封面")


def _clean_txt_content(content: str) -> str:
    """
    清理TXT内容中的常见乱码和网站标记
    """
    import re
    
    # 移除常见的网站广告标记
    patterns_to_remove = [
        # [书库] [数字] 等标记
        r'\[书库\][\[\]\d,，\.。\s]*',
        r'\[\d+\][\[\]\d,，\.。\s]*',
        # 网站水印
        r'本书来自[^\n]+\n?',
        r'更多精彩[^\n]+\n?',
        r'手机阅读[^\n]+\n?',
        r'本书.*?网.*?\n?',
        r'全文阅读[^\n]+\n?',
        r'最新章节[^\n]+\n?',
        r'www\.[a-zA-Z0-9]+\.[a-zA-Z]+',
        r'http[s]?://[^\s\n]+',
        # 零宽字符
        r'[\u200b\u200c\u200d\ufeff]',
        # 过多的空行（超过2个连续空行）
        r'\n{4,}',
    ]
    
    for pattern in patterns_to_remove:
        try:
            content = re.sub(pattern, '', content, flags=re.IGNORECASE)
        except Exception as e:
            log.warning(f"清理模式失败: {pattern}, 错误: {e}")
    
    # 规范化换行
    content = re.sub(r'\n{3,}', '\n\n', content)
    
    # 移除行首行尾的空白字符（保留缩进）
    lines = content.split('\n')
    cleaned_lines = [line.rstrip() for line in lines]
    content = '\n'.join(cleaned_lines)
    
    return content.strip()
