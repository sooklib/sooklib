"""
页面路由
提供阅读器等HTML页面
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.web.app import templates

router = APIRouter()


# 阅读器页面（保留，供Flutter调用）

@router.get("/reader/{book_id}", response_class=HTMLResponse)
async def reader_page(request: Request, book_id: int):
    """
    统一阅读器入口
    根据书籍格式自动选择合适的阅读器
    """
    return templates.TemplateResponse(
        "reader.html",
        {"request": request, "book_id": book_id, "title": "在线阅读"}
    )


@router.get("/reader/txt/{book_id}", response_class=HTMLResponse)
async def txt_reader_page(request: Request, book_id: int):
    """TXT阅读器页面"""
    return templates.TemplateResponse(
        "reader_txt.html",
        {"request": request, "book_id": book_id, "title": "TXT阅读器"}
    )


@router.get("/reader/epub/{book_id}", response_class=HTMLResponse)
async def epub_reader_page(request: Request, book_id: int):
    """EPUB阅读器页面"""
    return templates.TemplateResponse(
        "reader_epub.html",
        {"request": request, "book_id": book_id, "title": "EPUB阅读器"}
    )
