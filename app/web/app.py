"""
FastAPI Web应用
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
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
app.include_router(reader.router, tags=["阅读器"])

# 挂载Flutter Web UI到根路径（注意：必须最后挂载，否则会拦截其他路由）
# html=True 会让 SPA 路由正常工作
app.mount("/", StaticFiles(directory="app/web/static/flutter", html=True), name="flutter")

log.info("FastAPI应用初始化完成")
