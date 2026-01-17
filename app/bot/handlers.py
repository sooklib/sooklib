"""
Telegram Bot 命令处理器
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Book, Library, Author, ReadingProgress, BookVersion
from app.utils.logger import logger
from app.utils.permissions import (
    get_accessible_library_ids,
    filter_books_by_access,
    check_book_access,
)
from app.config import settings

# 临时存储绑定授权码（实际应用中应该使用 Redis 或数据库）
_bind_codes = {}


async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /start 命令"""
    user = update.effective_user
    
    welcome_message = f"""
👋 欢迎使用小说书库 Bot！

我可以帮你：
📚 搜索和浏览书籍
📖 查看阅读进度
⬇️ 下载书籍
📊 查看书库统计

🔗 如果还没绑定账号，请先：
1. 在网页端获取绑定码
2. 使用 /bind <绑定码> 绑定账号

💡 使用 /help 查看所有命令
"""
    
    await update.message.reply_text(welcome_message)


async def help_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /help 命令"""
    help_message = """
📖 可用命令：

🔐 账号管理
/bind <绑定码> - 绑定账号

📚 书籍浏览
/search <关键词> - 搜索书籍
/recent - 最新添加的书籍
/library - 我的书库列表

⬇️ 下载
/download <书籍ID> - 下载书籍
/formats <书籍ID> - 查看可用格式

📊 进度
/progress - 查看阅读进度

❓ 帮助
/help - 显示此帮助信息
"""
    
    await update.message.reply_text(help_message)


async def bind_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /bind 命令"""
    telegram_id = str(update.effective_user.id)
    
    # 检查参数
    if not context.args:
        await update.message.reply_text(
            "❌ 请提供绑定码\n"
            "用法: /bind <绑定码>\n\n"
            "请先在网页端生成绑定码"
        )
        return
    
    bind_code = context.args[0]
    
    # 验证绑定码
    if bind_code not in _bind_codes:
        await update.message.reply_text("❌ 绑定码无效或已过期")
        return
    
    code_data = _bind_codes[bind_code]
    
    # 检查是否过期
    if datetime.now() > code_data['expires_at']:
        del _bind_codes[bind_code]
        await update.message.reply_text("❌ 绑定码已过期")
        return
    
    # 绑定账号
    user_id = code_data['user_id']
    
    async for db in get_db():
        try:
            # 获取用户
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            
            if not user:
                await update.message.reply_text("❌ 用户不存在")
                return
            
            # 检查是否已被其他 Telegram 账号绑定
            if user.telegram_id and user.telegram_id != telegram_id:
                await update.message.reply_text("❌ 此账号已绑定其他 Telegram 账号")
                return
            
            # 检查此 Telegram ID 是否已绑定其他账号
            result = await db.execute(
                select(User).where(User.telegram_id == telegram_id)
            )
            existing_user = result.scalar_one_or_none()
            
            if existing_user and existing_user.id != user_id:
                await update.message.reply_text(
                    f"❌ 此 Telegram 账号已绑定到用户 {existing_user.username}"
                )
                return
            
            # 更新绑定
            user.telegram_id = telegram_id
            await db.commit()
            
            # 删除已使用的绑定码
            del _bind_codes[bind_code]
            
            await update.message.reply_text(
                f"✅ 绑定成功！\n"
                f"用户名: {user.username}\n\n"
                f"现在可以使用 /search 搜索书籍了"
            )
            
        except Exception as e:
            logger.error(f"绑定失败: {e}")
            await update.message.reply_text("❌ 绑定失败，请稍后重试")


async def get_user_by_telegram_id(db: AsyncSession, telegram_id: str) -> Optional[User]:
    """通过 Telegram ID 获取用户"""
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    return result.scalar_one_or_none()


async def search_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /search 命令"""
    telegram_id = str(update.effective_user.id)
    
    # 检查参数
    if not context.args:
        await update.message.reply_text(
            "❌ 请提供搜索关键词\n"
            "用法: /search <关键词>"
        )
        return
    
    keyword = " ".join(context.args)
    
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                await update.message.reply_text(
                    "❌ 未绑定账号\n"
                    "请使用 /bind 命令绑定账号"
                )
                return
            
            # 获取可访问的书库
            library_ids = await get_accessible_library_ids(user, db)
            
            # 搜索书籍
            query = select(Book).where(
                Book.library_id.in_(library_ids),
                (Book.title.contains(keyword))
            ).limit(10)
            
            result = await db.execute(query)
            books = result.scalars().all()
            
            # 应用权限过滤
            accessible_books = []
            for book in books:
                if await check_book_access(user, book.id, db):
                    accessible_books.append(book)
            books = accessible_books
            
            if not books:
                await update.message.reply_text(f"未找到包含 '{keyword}' 的书籍")
                return
            
            # 构建结果消息
            message = f"📚 搜索结果 (共 {len(books)} 本):\n\n"
            
            for book in books:
                # 获取作者
                if book.author_id:
                    author_result = await db.execute(
                        select(Author).where(Author.id == book.author_id)
                    )
                    author = author_result.scalar_one_or_none()
                    author_name = author.name if author else "未知"
                else:
                    author_name = "未知"
                
                message += f"📖 {book.title}\n"
                message += f"👤 作者: {author_name}\n"
                message += f"🆔 ID: {book.id}\n"
                message += f"───────────────\n"
            
            message += f"\n💡 使用 /download <ID> 下载书籍"
            
            await update.message.reply_text(message)
            
        except Exception as e:
            logger.error(f"搜索失败: {e}")
            await update.message.reply_text("❌ 搜索失败，请稍后重试")


async def recent_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /recent 命令"""
    telegram_id = str(update.effective_user.id)
    
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                await update.message.reply_text(
                    "❌ 未绑定账号\n"
                    "请使用 /bind 命令绑定账号"
                )
                return
            
            # 获取可访问的书库
            library_ids = await get_accessible_library_ids(user, db)
            
            # 获取最新书籍
            query = (
                select(Book)
                .where(Book.library_id.in_(library_ids))
                .order_by(desc(Book.added_at))
                .limit(10)
            )
            
            result = await db.execute(query)
            books = result.scalars().all()
            
            # 应用权限过滤
            accessible_books = []
            for book in books:
                if await check_book_access(user, book.id, db):
                    accessible_books.append(book)
            books = accessible_books
            
            if not books:
                await update.message.reply_text("暂无书籍")
                return
            
            # 构建结果消息
            message = f"📚 最新添加 (共 {len(books)} 本):\n\n"
            
            for book in books:
                # 获取作者
                if book.author_id:
                    author_result = await db.execute(
                        select(Author).where(Author.id == book.author_id)
                    )
                    author = author_result.scalar_one_or_none()
                    author_name = author.name if author else "未知"
                else:
                    author_name = "未知"
                
                message += f"📖 {book.title}\n"
                message += f"👤 作者: {author_name}\n"
                message += f"🆔 ID: {book.id}\n"
                message += f"📅 {book.added_at.strftime('%Y-%m-%d')}\n"
                message += f"───────────────\n"
            
            message += f"\n💡 使用 /download <ID> 下载书籍"
            
            await update.message.reply_text(message)
            
        except Exception as e:
            logger.error(f"获取最新书籍失败: {e}")
            await update.message.reply_text("❌ 获取失败，请稍后重试")


async def library_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /library 命令"""
    telegram_id = str(update.effective_user.id)
    
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                await update.message.reply_text(
                    "❌ 未绑定账号\n"
                    "请使用 /bind 命令绑定账号"
                )
                return
            
            # 获取可访问的书库
            library_ids = await get_accessible_library_ids(user, db)
            
            if not library_ids:
                await update.message.reply_text("暂无可访问的书库")
                return
            
            # 获取书库信息
            result = await db.execute(
                select(Library).where(Library.id.in_(library_ids))
            )
            libraries = result.scalars().all()
            
            # 构建消息
            message = f"📚 我的书库 (共 {len(libraries)} 个):\n\n"
            
            for library in libraries:
                # 统计书库中的书籍数量
                count_result = await db.execute(
                    select(Book).where(Book.library_id == library.id)
                )
                book_count = len(count_result.scalars().all())
                
                message += f"📁 {library.name}\n"
                message += f"📚 书籍数: {book_count}\n"
                message += f"🆔 ID: {library.id}\n"
                message += f"───────────────\n"
            
            await update.message.reply_text(message)
            
        except Exception as e:
            logger.error(f"获取书库列表失败: {e}")
            await update.message.reply_text("❌ 获取失败，请稍后重试")


async def download_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /download 命令"""
    telegram_id = str(update.effective_user.id)
    
    # 检查参数
    if not context.args:
        await update.message.reply_text(
            "❌ 请提供书籍ID\n"
            "用法: /download <书籍ID>"
        )
        return
    
    try:
        book_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ 无效的书籍ID")
        return
    
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                await update.message.reply_text(
                    "❌ 未绑定账号\n"
                    "请使用 /bind 命令绑定账号"
                )
                return
            
            # 获取书籍
            result = await db.execute(select(Book).where(Book.id == book_id))
            book = result.scalar_one_or_none()
            
            if not book:
                await update.message.reply_text("❌ 书籍不存在")
                return
            
            # 检查权限
            if not await check_book_access(user, book.id, db):
                await update.message.reply_text("❌ 无权访问此书籍")
                return
            
            # 获取书籍版本（选择主版本或第一个版本）
            versions_result = await db.execute(
                select(BookVersion)
                .where(BookVersion.book_id == book_id)
                .order_by(desc(BookVersion.is_primary))
            )
            versions = versions_result.scalars().all()
            
            if not versions:
                await update.message.reply_text("❌ 此书籍没有可用文件")
                return
            
            version = versions[0]
            
            # 检查文件大小
            if version.file_size > settings.telegram.max_file_size:
                await update.message.reply_text(
                    f"❌ 文件太大 ({version.file_size / 1024 / 1024:.1f}MB)\n"
                    f"Telegram 限制: {settings.telegram.max_file_size / 1024 / 1024:.0f}MB\n\n"
                    f"请使用网页端下载"
                )
                return
            
            # 发送文件
            await update.message.reply_text("📤 正在发送文件...")
            
            with open(version.file_path, 'rb') as f:
                await update.message.reply_document(
                    document=f,
                    filename=version.file_name,
                    caption=f"📖 {book.title}\n格式: {version.file_format.upper()}"
                )
            
        except FileNotFoundError:
            await update.message.reply_text("❌ 文件不存在")
        except Exception as e:
            logger.error(f"下载失败: {e}")
            await update.message.reply_text("❌ 下载失败，请稍后重试")


async def formats_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /formats 命令"""
    telegram_id = str(update.effective_user.id)
    
    # 检查参数
    if not context.args:
        await update.message.reply_text(
            "❌ 请提供书籍ID\n"
            "用法: /formats <书籍ID>"
        )
        return
    
    try:
        book_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ 无效的书籍ID")
        return
    
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                await update.message.reply_text(
                    "❌ 未绑定账号\n"
                    "请使用 /bind 命令绑定账号"
                )
                return
            
            # 获取书籍
            result = await db.execute(select(Book).where(Book.id == book_id))
            book = result.scalar_one_or_none()
            
            if not book:
                await update.message.reply_text("❌ 书籍不存在")
                return
            
            # 检查权限
            if not await check_book_access(user, book.id, db):
                await update.message.reply_text("❌ 无权访问此书籍")
                return
            
            # 获取所有版本
            versions_result = await db.execute(
                select(BookVersion).where(BookVersion.book_id == book_id)
            )
            versions = versions_result.scalars().all()
            
            if not versions:
                await update.message.reply_text("❌ 此书籍没有可用文件")
                return
            
            # 构建消息
            message = f"📖 {book.title}\n\n"
            message += f"可用格式 (共 {len(versions)} 个):\n\n"
            
            for version in versions:
                size_mb = version.file_size / 1024 / 1024
                primary = "⭐" if version.is_primary else ""
                
                message += f"{primary} {version.file_format.upper()}\n"
                message += f"📦 大小: {size_mb:.1f}MB\n"
                message += f"📁 文件名: {version.file_name}\n"
                message += f"───────────────\n"
            
            message += f"\n💡 使用 /download {book_id} 下载主版本"
            
            await update.message.reply_text(message)
            
        except Exception as e:
            logger.error(f"获取格式列表失败: {e}")
            await update.message.reply_text("❌ 获取失败，请稍后重试")


async def progress_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /progress 命令"""
    telegram_id = str(update.effective_user.id)
    
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                await update.message.reply_text(
                    "❌ 未绑定账号\n"
                    "请使用 /bind 命令绑定账号"
                )
                return
            
            # 获取阅读进度
            result = await db.execute(
                select(ReadingProgress)
                .where(ReadingProgress.user_id == user.id)
                .order_by(desc(ReadingProgress.last_read_at))
                .limit(10)
            )
            progress_list = result.scalars().all()
            
            if not progress_list:
                await update.message.reply_text("暂无阅读记录")
                return
            
            # 构建消息
            message = f"📊 阅读进度 (最近 {len(progress_list)} 本):\n\n"
            
            for progress in progress_list:
                # 获取书籍信息
                book_result = await db.execute(
                    select(Book).where(Book.id == progress.book_id)
                )
                book = book_result.scalar_one_or_none()
                
                if not book:
                    continue
                
                # 检查权限
                if not await check_book_access(user, book.id, db):
                    continue
                
                status = "✅" if progress.finished else "📖"
                percent = int(progress.progress * 100)
                
                message += f"{status} {book.title}\n"
                message += f"📊 进度: {percent}%\n"
                message += f"📅 {progress.last_read_at.strftime('%Y-%m-%d %H:%M')}\n"
                message += f"───────────────\n"
            
            await update.message.reply_text(message)
            
        except Exception as e:
            logger.error(f"获取阅读进度失败: {e}")
            await update.message.reply_text("❌ 获取失败，请稍后重试")


def generate_bind_code(user_id: int) -> str:
    """
    生成绑定授权码
    
    Args:
        user_id: 用户ID
        
    Returns:
        绑定码
    """
    code = secrets.token_urlsafe(16)[:12].upper()
    
    _bind_codes[code] = {
        'user_id': user_id,
        'expires_at': datetime.now() + timedelta(seconds=settings.telegram.bind_code_expiry)
    }
    
    return code


def cleanup_expired_codes():
    """清理过期的绑定码"""
    now = datetime.now()
    expired_codes = [
        code for code, data in _bind_codes.items()
        if now > data['expires_at']
    ]
    
    for code in expired_codes:
        del _bind_codes[code]
