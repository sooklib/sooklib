"""
FastAPI Web应用
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import settings
from app.database import init_database
from app.core.scheduler import backup_scheduler
from app.bot.bot import telegram_bot
from app.utils.logger import log


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    log.info("应用启动中...")
    
    # 确保必要的目录存在
    settings.ensure_directories()
    
    # 初始化数据库
    await init_database()
    log.info("数据库初始化完成")
    
    # 启动定时备份调度器
    await backup_scheduler.start()
    log.info("定时备份调度器已启动")
    
    # 启动 Telegram Bot
    await telegram_bot.start()
    if telegram_bot.is_running:
        log.info("Telegram Bot 已启动")
    
    yield
    
    # 关闭时
    log.info("应用关闭中...")
    
    # 关闭 Telegram Bot
    await telegram_bot.stop()
    
    # 关闭调度器
    await backup_scheduler.shutdown()
    log.info("定时备份调度器已关闭")
    
    log.info("应用已关闭")


# 创建FastAPI应用
app = FastAPI(
    title="Novel Library",
    description="小说书库管理系统",
    version="1.0.0",
    lifespan=lifespan,
)

# 配置静态文件（仅CSS/JS等，不包含flutter）
app.mount("/static", StaticFiles(directory="app/web/static", html=False), name="static")

# 配置模板
templates = Jinja2Templates(directory="app/web/templates")

# 导入路由（延迟导入避免循环依赖）
from app.web.routes import admin, api, auth, bookmarks, dashboard, opds, pages, permissions, reader, tags, user

# 注册路由（必须在挂载Flutter之前）
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(api.router, prefix="/api", tags=["API"])
app.include_router(admin.router, prefix="/api", tags=["管理员"])
app.include_router(bookmarks.router, prefix="/api", tags=["书签管理"])
app.include_router(permissions.router, prefix="/api", tags=["权限管理"])
app.include_router(tags.router, prefix="/api", tags=["标签管理"])
app.include_router(user.router, prefix="/api/user", tags=["用户功能"])
app.include_router(dashboard.router, tags=["Dashboard"])
app.include_router(opds.router, prefix="/opds", tags=["OPDS"])
app.include_router(pages.router, tags=["页面"])
app.include_router(reader.router, prefix="/api", tags=["阅读器"])

# Flutter Web 静态资源目录
FLUTTER_DIR = Path("app/web/static/flutter")

# 挂载 Flutter 静态资源（JS、CSS、assets 等）
# 不使用 html=True，因为我们要手动处理 SPA 路由
app.mount("/assets", StaticFiles(directory=FLUTTER_DIR / "assets"), name="flutter_assets")
app.mount("/canvaskit", StaticFiles(directory=FLUTTER_DIR / "canvaskit"), name="flutter_canvaskit")


@app.get("/flutter.js")
async def flutter_js():
    """返回 Flutter JS 引导文件"""
    return FileResponse(FLUTTER_DIR / "flutter.js")


@app.get("/flutter_service_worker.js")
async def flutter_service_worker():
    """返回 Flutter Service Worker"""
    return FileResponse(FLUTTER_DIR / "flutter_service_worker.js")


@app.get("/main.dart.js")
async def flutter_main():
    """返回 Flutter 主应用 JS"""
    return FileResponse(FLUTTER_DIR / "main.dart.js")


@app.get("/manifest.json")
async def flutter_manifest():
    """返回 Flutter Web Manifest"""
    return FileResponse(FLUTTER_DIR / "manifest.json", media_type="application/json")


@app.get("/version.json")
async def flutter_version():
    """返回 Flutter 版本信息"""
    return FileResponse(FLUTTER_DIR / "version.json", media_type="application/json")


# SPA Catch-all 路由：所有未匹配的路径都返回 index.html
# 这样 Flutter 的 go_router 就能正确处理客户端路由
@app.get("/{full_path:path}")
async def spa_fallback(request: Request, full_path: str):
    """
    SPA 路由回退
    所有非 API、非静态资源的路径都返回 Flutter 的 index.html
    让 Flutter 的 go_router 在客户端处理路由
    """
    # 检查是否请求的是根路径或 Flutter 路由
    index_file = FLUTTER_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    else:
        log.error("Flutter index.html not found")
        return {"error": "Flutter app not found"}


log.info("FastAPI应用初始化完成")
