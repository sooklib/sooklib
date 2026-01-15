"""
页面路由
提供HTML页面
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.web.app import templates

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """首页"""
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
