"""
Telegram Bot 主类
"""
import asyncio
from typing import Optional

from telegram import Update
from telegram import BotCommand
from telegram.ext import Application, CommandHandler, ContextTypes

from app.config import settings
from app.database import get_db
from app.utils.logger import logger
from app.bot.handlers import (
    start_handler,
    help_handler,
    bind_handler,
    search_handler,
    recent_handler,
    library_handler,
    download_handler,
    formats_handler,
    progress_handler,
)


class TelegramBot:
    """Telegram Bot 管理类"""
    
    def __init__(self):
        self.application: Optional[Application] = None
        self._running = False
    
    async def start(self):
        """启动 Bot"""
        if not settings.telegram.enabled:
            logger.info("Telegram Bot 未启用")
            return
        
        if not settings.telegram.bot_token:
            logger.warning("Telegram Bot Token 未配置")
            return
        
        try:
            # 创建 Application
            self.application = (
                Application.builder()
                .token(settings.telegram.bot_token)
                .build()
            )
            
            # 注册命令处理器
            self.application.add_handler(CommandHandler("start", start_handler))
            self.application.add_handler(CommandHandler("help", help_handler))
            self.application.add_handler(CommandHandler("bind", bind_handler))
            self.application.add_handler(CommandHandler("search", search_handler))
            self.application.add_handler(CommandHandler("recent", recent_handler))
            self.application.add_handler(CommandHandler("library", library_handler))
            self.application.add_handler(CommandHandler("download", download_handler))
            self.application.add_handler(CommandHandler("formats", formats_handler))
            self.application.add_handler(CommandHandler("progress", progress_handler))
            
            # 初始化应用
            await self.application.initialize()

            # 设置 Bot 命令菜单
            commands = [
                BotCommand("start", "开始使用"),
                BotCommand("help", "显示帮助信息"),
                BotCommand("bind", "绑定账号"),
                BotCommand("search", "搜索书籍"),
                BotCommand("recent", "查看最新书籍"),
                BotCommand("library", "浏览书库"),
                BotCommand("download", "下载书籍"),
                BotCommand("formats", "查看支持格式"),
                BotCommand("progress", "查看阅读进度"),
            ]
            await self.application.bot.set_my_commands(commands)
            
            # 启动 Bot
            if settings.telegram.webhook_url:
                # Webhook 模式
                logger.info(f"Telegram Bot 启动 (Webhook 模式): {settings.telegram.webhook_url}")
                await self.application.start()
                await self.application.bot.set_webhook(
                    url=f"{settings.telegram.webhook_url}{settings.telegram.webhook_path}"
                )
            else:
                # 轮询模式
                logger.info("Telegram Bot 启动 (轮询模式)")
                await self.application.start()
                await self.application.updater.start_polling(drop_pending_updates=True)
            
            self._running = True
            logger.info("Telegram Bot 启动成功")
            
        except Exception as e:
            logger.error(f"Telegram Bot 启动失败: {e}")
            raise
    
    async def stop(self):
        """停止 Bot"""
        if not self._running or not self.application:
            return
        
        try:
            logger.info("正在停止 Telegram Bot...")
            
            # 停止 Webhook/轮询
            if settings.telegram.webhook_url:
                await self.application.bot.delete_webhook()
            else:
                await self.application.updater.stop()
            
            # 停止应用
            await self.application.stop()
            await self.application.shutdown()
            
            self._running = False
            logger.info("Telegram Bot 已停止")
            
        except Exception as e:
            logger.error(f"Telegram Bot 停止失败: {e}")
    
    async def process_update(self, update_data: dict):
        """
        处理 Webhook 更新（用于 Webhook 模式）
        
        Args:
            update_data: Telegram 更新数据
        """
        if not self.application:
            return
        
        try:
            update = Update.de_json(update_data, self.application.bot)
            await self.application.process_update(update)
        except Exception as e:
            logger.error(f"处理 Telegram 更新失败: {e}")
    
    @property
    def is_running(self) -> bool:
        """Bot 是否正在运行"""
        return self._running


# 全局 Bot 实例
telegram_bot = TelegramBot()
