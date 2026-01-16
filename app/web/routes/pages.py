"""
页面路由
提供HTML页面
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.web.app import templates

router = APIRouter()


# 根路径由 Flutter Web UI 处理，无需路由

@router.get("/legacy", response_class=HTMLResponse)
async def legacy_index(request: Request):
    """旧版Jinja2首页（保留）"""
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "title": "首页"}
    )


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """登录页"""
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "title": "登录"}
    )


@router.get("/library", response_class=HTMLResponse)
async def library_page(request: Request):
    """书库浏览页"""
    return templates.TemplateResponse(
        "library.html",
        {"request": request, "title": "书库"}
    )


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    """书库管理页"""
    return templates.TemplateResponse(
        "settings.html",
        {"request": request, "title": "书库管理"}
    )


@router.get("/search", response_class=HTMLResponse)
async def search_page(request: Request):
    """高级搜索页"""
    return templates.TemplateResponse(
        "search.html",
        {"request": request, "title": "搜索"}
    )


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


@router.get("/profile", response_class=HTMLResponse)
async def profile_page(request: Request):
    """用户个人设置页"""
    return templates.TemplateResponse(
        "profile.html",
        {"request": request, "title": "个人设置"}
    )


@router.get("/book/{book_id}", response_class=HTMLResponse)
async def book_detail_page(request: Request, book_id: int):
    """书籍详情页"""
    return templates.TemplateResponse(
        "book_detail.html",
        {"request": request, "book_id": book_id, "title": "书籍详情"}
    )
