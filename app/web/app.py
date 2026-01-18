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

# 配置静态文件（仅CSS/JS等）
app.mount("/static", StaticFiles(directory="app/web/static", html=False), name="static")

# 配置模板
templates = Jinja2Templates(directory="app/web/templates")

# 导入路由（延迟导入避免循环依赖）
from app.web.routes import admin, admin_scan, ai, annotations, api, auth, bookmarks, dashboard, fonts, opds, pages, permissions, reader, tags, user, ws
from app.web.routes import settings as settings_routes  # 避免与app.config.settings冲突

# 注册路由（必须在挂载静态文件之前）
app.include_router(ws.router, tags=["WebSocket"])
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(api.router, prefix="/api", tags=["API"])
app.include_router(admin.router, prefix="/api", tags=["管理员"])
app.include_router(admin_scan.router, prefix="/api", tags=["书库扫描"])
app.include_router(ai.router, prefix="/api/admin/ai", tags=["AI管理"])
app.include_router(bookmarks.router, prefix="/api", tags=["书签管理"])
app.include_router(annotations.router, tags=["笔记批注"])
app.include_router(permissions.router, prefix="/api", tags=["权限管理"])
app.include_router(tags.router, prefix="/api", tags=["标签管理"])
app.include_router(user.router, prefix="/api/user", tags=["用户功能"])
app.include_router(dashboard.router, tags=["Dashboard"])
app.include_router(opds.router, prefix="/opds", tags=["OPDS"])
app.include_router(pages.router, tags=["页面"])
app.include_router(reader.router, prefix="/api", tags=["阅读器"])
app.include_router(fonts.router, tags=["字体管理"])
app.include_router(settings_routes.router, prefix="/api", tags=["系统设置"])


# 健康检查端点
@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "version": "1.0.0"}


# ===========================================
# React WebUI 静态资源
# ===========================================
REACT_DIR = Path("app/web/static/react")

# 检查 React 目录是否存在
if REACT_DIR.exists():
    log.info(f"React WebUI 目录存在: {REACT_DIR}")
    
    # 挂载 React 静态资源（JS、CSS、assets 等）
    if (REACT_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=REACT_DIR / "assets"), name="react_assets")


# SPA Catch-all 路由：所有未匹配的路径都返回 index.html
@app.get("/{full_path:path}")
async def spa_fallback(request: Request, full_path: str):
    """
    SPA 路由回退
    返回 React 的 index.html
    """
    # 如果是 API 请求，不要返回 index.html，而是返回 404
    if full_path.startswith("api/"):
        return {"detail": "Not Found"}, 404

    if REACT_DIR.exists():
        # 先尝试返回静态文件
        file_path = REACT_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # 返回 React index.html
        index_file = REACT_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
    
    # React 不存在时返回错误
    log.error("React WebUI not found")
    return {"error": "Frontend app not found"}


log.info("FastAPI应用初始化完成")
