"""
Telegram Bot 命令处理器
"""
import secrets
import math
from datetime import datetime, timedelta
from typing import Optional

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from sqlalchemy import select, desc, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models import User, Book, Library, Author, ReadingProgress, BookVersion, Favorite
from app.utils.logger import logger
from app.utils.permissions import (
    get_accessible_library_ids,
    filter_books_by_access,
    check_book_access,
)
from app.config import settings

# 临时存储绑定授权码（实际应用中应该使用 Redis 或数据库）
_bind_codes = {}

# 搜索结果缓存（用于分页）
_search_cache = {}

# 每页显示数量
PAGE_SIZE = 10


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

👤 账号管理
/bind <绑定码> - 绑定账号

📚 书籍浏览
/search <关键词> - 搜索书籍
/recent - 最新添加的书籍
/library - 我的书库列表
/info <书籍ID> - 查看书籍详情

⬇️ 下载
/download <书籍ID> - 下载书籍
/formats <书籍ID> - 查看可用格式
/favorite <书籍ID> - 收藏/取消收藏
/favorites - 我的收藏

📈 进度
/progress - 查看阅读进度
/continue - 继续阅读

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
    page = 1
    
    await _perform_search(update, telegram_id, keyword, page, is_callback=False)


async def _perform_search(update: Update, telegram_id: str, keyword: str, page: int, is_callback: bool = False):
    """执行搜索并显示结果"""
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                msg = "❌ 未绑定账号\n请使用 /bind 命令绑定账号"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return
            
            # 获取可访问的书库
            library_ids = await get_accessible_library_ids(user, db)
            
            if not library_ids:
                msg = "暂无可访问的书库"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return
            
            # 搜索书籍（同时搜索书名和作者）
            search_term = f"%{keyword}%"
            query = (
                select(Book)
                .options(joinedload(Book.author), joinedload(Book.versions))
                .outerjoin(Author, Book.author_id == Author.id)
                .where(Book.library_id.in_(library_ids))
                .where(or_(Book.title.like(search_term), Author.name.like(search_term)))
                .order_by(desc(Book.added_at))
            )
            
            result = await db.execute(query)
            all_books = result.unique().scalars().all()
            
            # 应用权限过滤
            accessible_books = []
            for book in all_books:
                if await check_book_access(user, book.id, db):
                    accessible_books.append(book)
            
            total = len(accessible_books)
            
            if total == 0:
                msg = f"未找到包含 '{keyword}' 的书籍"
                if is_callback:
                    await update.callback_query.edit_message_text(msg)
                else:
                    await update.message.reply_text(msg)
                return
            
            # 分页
            total_pages = math.ceil(total / PAGE_SIZE)
            start = (page - 1) * PAGE_SIZE
            end = start + PAGE_SIZE
            books = accessible_books[start:end]
            
            # 构建结果消息
            message = f"🔍 搜索: {keyword}\n"
            message += f"📚 共 {total} 本 | 第 {page}/{total_pages} 页\n\n"
            
            for i, book in enumerate(books, start=start+1):
                author_name = book.author.name if book.author else "未知"
                # 获取文件大小
                file_size = 0
                file_format = "unknown"
                if book.versions:
                    primary = next((v for v in book.versions if v.is_primary), book.versions[0] if book.versions else None)
                    if primary:
                        file_size = primary.file_size
                        file_format = primary.file_format
                
                size_str = f"{file_size / 1024:.1f}KB" if file_size < 1024*1024 else f"{file_size / 1024 / 1024:.1f}MB"
                
                message += f"{i:02d}. 📖 {book.title}\n"
                message += f"    👤 {author_name} | {file_format.upper()} | {size_str}\n"
                message += f"    🆔 /info {book.id}\n"
                message += f"    🆔 /download {book.id}\n"
            
            # 构建翻页按钮
            keyboard = []
            nav_row = []
            
            if page > 1:
                nav_row.append(InlineKeyboardButton("⬅️ 上一页", callback_data=f"search:{keyword}:{page-1}"))
            
            nav_row.append(InlineKeyboardButton(f"{page}/{total_pages}", callback_data="noop"))
            
            if page < total_pages:
                nav_row.append(InlineKeyboardButton("下一页 ➡️", callback_data=f"search:{keyword}:{page+1}"))
            
            if nav_row:
                keyboard.append(nav_row)
            
            reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
            
            if is_callback:
                await update.callback_query.edit_message_text(message, reply_markup=reply_markup)
            else:
                await update.message.reply_text(message, reply_markup=reply_markup)
            
        except Exception as e:
            logger.error(f"搜索失败: {e}")
            msg = "❌ 搜索失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
            else:
                await update.message.reply_text(msg)


async def recent_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /recent 命令"""
    telegram_id = str(update.effective_user.id)
    page = 1
    
    await _perform_recent(update, telegram_id, page, is_callback=False)


async def _perform_recent(update: Update, telegram_id: str, page: int, is_callback: bool = False):
    """获取最新书籍并显示"""
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                msg = "❌ 未绑定账号\n请使用 /bind 命令绑定账号"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return
            
            # 获取可访问的书库
            library_ids = await get_accessible_library_ids(user, db)
            
            if not library_ids:
                msg = "暂无可访问的书库"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return
            
            # 获取最新书籍（一次性获取更多用于分页）
            query = (
                select(Book)
                .options(joinedload(Book.author), joinedload(Book.versions))
                .where(Book.library_id.in_(library_ids))
                .order_by(desc(Book.added_at))
            )
            
            result = await db.execute(query)
            all_books = result.unique().scalars().all()
            
            # 应用权限过滤
            accessible_books = []
            for book in all_books:
                if await check_book_access(user, book.id, db):
                    accessible_books.append(book)
            
            total = len(accessible_books)
            
            if total == 0:
                msg = "暂无书籍"
                if is_callback:
                    await update.callback_query.edit_message_text(msg)
                else:
                    await update.message.reply_text(msg)
                return
            
            # 分页
            total_pages = math.ceil(total / PAGE_SIZE)
            start = (page - 1) * PAGE_SIZE
            end = start + PAGE_SIZE
            books = accessible_books[start:end]
            
            # 构建结果消息
            message = f"📚 最新添加\n"
            message += f"共 {total} 本 | 第 {page}/{total_pages} 页\n\n"
            
            for i, book in enumerate(books, start=start+1):
                author_name = book.author.name if book.author else "未知"
                # 获取文件大小
                file_size = 0
                file_format = "unknown"
                if book.versions:
                    primary = next((v for v in book.versions if v.is_primary), book.versions[0] if book.versions else None)
                    if primary:
                        file_size = primary.file_size
                        file_format = primary.file_format
                
                size_str = f"{file_size / 1024:.1f}KB" if file_size < 1024*1024 else f"{file_size / 1024 / 1024:.1f}MB"
                date_str = book.added_at.strftime('%m-%d') if book.added_at else ""
                
                message += f"{i:02d}. 📖 {book.title}\n"
                message += f"    👤 {author_name} | {file_format.upper()} | {size_str} | {date_str}\n"
                message += f"    🆔 /info {book.id}\n"
                message += f"    🆔 /download {book.id}\n"
            
            # 构建翻页按钮
            keyboard = []
            nav_row = []
            
            if page > 1:
                nav_row.append(InlineKeyboardButton("⬅️ 上一页", callback_data=f"recent:{page-1}"))
            
            nav_row.append(InlineKeyboardButton(f"{page}/{total_pages}", callback_data="noop"))
            
            if page < total_pages:
                nav_row.append(InlineKeyboardButton("下一页 ➡️", callback_data=f"recent:{page+1}"))
            
            if nav_row:
                keyboard.append(nav_row)
            
            reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
            
            if is_callback:
                await update.callback_query.edit_message_text(message, reply_markup=reply_markup)
            else:
                await update.message.reply_text(message, reply_markup=reply_markup)
            
        except Exception as e:
            logger.error(f"获取最新书籍失败: {e}")
            msg = "❌ 获取失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
            else:
                await update.message.reply_text(msg)


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理回调查询（按钮点击）"""
    query = update.callback_query
    await query.answer()  # 确认收到回调
    
    telegram_id = str(update.effective_user.id)
    data = query.data
    
    if data == "noop":
        return
    
    # 解析回调数据
    if data.startswith("search:"):
        # 搜索翻页: search:<keyword>:<page>
        parts = data.split(":", 2)
        if len(parts) == 3:
            keyword = parts[1]
            try:
                page = int(parts[2])
                await _perform_search(update, telegram_id, keyword, page, is_callback=True)
            except ValueError:
                await query.answer("无效的页码", show_alert=True)
    
    elif data.startswith("recent:"):
        # 最新书籍翻页: recent:<page>
        parts = data.split(":")
        if len(parts) == 2:
            try:
                page = int(parts[1])
                await _perform_recent(update, telegram_id, page, is_callback=True)
            except ValueError:
                await query.answer("无效的页码", show_alert=True)
    
    elif data.startswith("favorites:"):
        # 收藏列表翻页: favorites:<page>
        parts = data.split(":")
        if len(parts) == 2:
            try:
                page = int(parts[1])
                await _perform_favorites(update, telegram_id, page, is_callback=True)
            except ValueError:
                await query.answer("无效的页码", show_alert=True)

    elif data.startswith("continue:"):
        # 继续阅读翻页: continue:<page>
        parts = data.split(":")
        if len(parts) == 2:
            try:
                page = int(parts[1])
                await _perform_continue(update, telegram_id, page, is_callback=True)
            except ValueError:
                await query.answer("无效的页码", show_alert=True)

    elif data.startswith("info:"):
        # 书籍详情: info:<book_id>
        parts = data.split(":")
        if len(parts) == 2:
            try:
                book_id = int(parts[1])
                await _send_book_info(update, telegram_id, book_id, is_callback=True)
            except ValueError:
                await query.answer("无效的书籍ID", show_alert=True)

    elif data.startswith("fav:"):
        # 收藏/取消收藏: fav:<book_id>
        parts = data.split(":")
        if len(parts) == 2:
            try:
                book_id = int(parts[1])
                await _toggle_favorite(update, telegram_id, book_id, is_callback=True)
            except ValueError:
                await query.answer("无效的书籍ID", show_alert=True)

    elif data.startswith("download:"):
        # 下载书籍: download:<book_id>
        parts = data.split(":")
        if len(parts) == 2:
            try:
                book_id = int(parts[1])
                await _perform_download(update, telegram_id, book_id, is_callback=True)
            except ValueError:
                await query.answer("无效的书籍ID", show_alert=True)


async def _perform_download(update: Update, telegram_id: str, book_id: int, is_callback: bool = False):
    """执行下载"""
    async for db in get_db():
        try:
            # 获取用户
            user = await get_user_by_telegram_id(db, telegram_id)
            if not user:
                msg = "❌ 未绑定账号"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                return
            
            # 获取书籍
            result = await db.execute(select(Book).where(Book.id == book_id))
            book = result.scalar_one_or_none()
            
            if not book:
                msg = "❌ 书籍不存在"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                return
            
            # 检查权限
            if not await check_book_access(user, book.id, db):
                msg = "❌ 无权访问此书籍"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                return
            
            # 获取书籍版本
            versions_result = await db.execute(
                select(BookVersion)
                .where(BookVersion.book_id == book_id)
                .order_by(desc(BookVersion.is_primary))
            )
            versions = versions_result.scalars().all()
            
            if not versions:
                msg = "❌ 此书籍没有可用文件"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                return
            
            version = versions[0]
            
            # 检查文件大小
            if version.file_size > settings.telegram.max_file_size:
                msg = f"❌ 文件太大 ({version.file_size / 1024 / 1024:.1f}MB)"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                return
            
            # 发送文件
            if is_callback:
                await update.callback_query.answer("📤 正在发送文件...")
            
            message = update.callback_query.message if is_callback else update.message
            
            with open(version.file_path, 'rb') as f:
                await message.reply_document(
                    document=f,
                    filename=version.file_name,
                    caption=f"📖 {book.title}\n格式: {version.file_format.upper()}"
                )
            
        except FileNotFoundError:
            msg = "❌ 文件不存在"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
        except Exception as e:
            logger.error(f"下载失败: {e}")
            msg = "❌ 下载失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)


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


def _truncate_text(text: Optional[str], max_length: int = 400) -> str:
    """截断文本，避免消息过长"""
    if not text:
        return ""
    text = text.strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


async def _get_bound_user(update: Update, telegram_id: str, db: AsyncSession, is_callback: bool) -> Optional[User]:
    """获取已绑定用户，未绑定则提示"""
    user = await get_user_by_telegram_id(db, telegram_id)
    if user:
        return user
    msg = "❌ 未绑定账号\n请使用 /bind 命令绑定账号"
    if is_callback:
        await update.callback_query.answer(msg, show_alert=True)
    else:
        await update.message.reply_text(msg)
    return None


async def _send_book_info(update: Update, telegram_id: str, book_id: int, is_callback: bool = False):
    """发送书籍详情"""
    async for db in get_db():
        try:
            user = await _get_bound_user(update, telegram_id, db, is_callback)
            if not user:
                return
            result = await db.execute(
                select(Book)
                .options(joinedload(Book.author), joinedload(Book.versions))
                .where(Book.id == book_id)
            )
            book = result.scalar_one_or_none()
            if not book:
                msg = "❌ 书籍不存在"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return
            if not await check_book_access(user, book.id, db):
                msg = "❌ 无权访问此书籍"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return

            author_name = book.author.name if book.author else "未知"
            description = _truncate_text(book.description, 400)
            formats = []
            for version in book.versions:
                formats.append(version.file_format.upper())
            format_str = ", ".join(sorted(set(formats))) if formats else "未知"

            message = "📘 书籍详情\n\n"
            message += f"📖 书名: {book.title}\n"
            message += f"✍️ 作者: {author_name}\n"
            message += f"📂 格式: {format_str}\n"
            if book.added_at:
                message += f"🗓️ 添加时间: {book.added_at.strftime('%Y-%m-%d')}\n"
            if description:
                message += f"\n📝 简介:\n{description}\n"
            message += f"\n🆔 下载: /download {book.id}\n"
            message += f"🆔 格式列表: /formats {book.id}\n"

            fav_result = await db.execute(
                select(Favorite)
                .where(Favorite.user_id == user.id)
                .where(Favorite.book_id == book.id)
            )
            is_favorite = fav_result.scalar_one_or_none() is not None
            fav_label = "⭐ 取消收藏" if is_favorite else "⭐ 收藏"
            keyboard = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton("⬇️ 下载", callback_data=f"download:{book.id}"),
                    InlineKeyboardButton(fav_label, callback_data=f"fav:{book.id}")
                ]
            ])

            if is_callback:
                await update.callback_query.edit_message_text(message, reply_markup=keyboard)
            else:
                await update.message.reply_text(message, reply_markup=keyboard)
        except Exception as e:
            logger.error(f"获取书籍详情失败: {e}")
            msg = "❌ 获取书籍详情失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
            else:
                await update.message.reply_text(msg)


async def info_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /info 命令"""
    telegram_id = str(update.effective_user.id)
    if not context.args:
        await update.message.reply_text(
            "❌ 请提供书籍ID\n"
            "用法: /info <书籍ID>"
        )
        return
    try:
        book_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ 无效的书籍ID")
        return
    await _send_book_info(update, telegram_id, book_id, is_callback=False)


async def _toggle_favorite(update: Update, telegram_id: str, book_id: int, is_callback: bool = False):
    """收藏/取消收藏切换"""
    async for db in get_db():
        try:
            user = await _get_bound_user(update, telegram_id, db, is_callback)
            if not user:
                return
            book = await db.get(Book, book_id)
            if not book:
                msg = "❌ 书籍不存在"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return
            if not await check_book_access(user, book.id, db):
                msg = "❌ 无权访问此书籍"
                if is_callback:
                    await update.callback_query.answer(msg, show_alert=True)
                else:
                    await update.message.reply_text(msg)
                return

            result = await db.execute(
                select(Favorite)
                .where(Favorite.user_id == user.id)
                .where(Favorite.book_id == book_id)
            )
            favorite = result.scalar_one_or_none()
            if favorite:
                await db.delete(favorite)
                await db.commit()
                msg = "已取消收藏"
            else:
                db.add(Favorite(user_id=user.id, book_id=book_id))
                await db.commit()
                msg = "已加入收藏"

            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
                await _send_book_info(update, telegram_id, book_id, is_callback=True)
            else:
                await update.message.reply_text(f"✅ {msg}: {book.title}")
        except Exception as e:
            logger.error(f"收藏切换失败: {e}")
            msg = "❌ 操作失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
            else:
                await update.message.reply_text(msg)


async def favorite_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /favorite 命令"""
    telegram_id = str(update.effective_user.id)
    if not context.args:
        await update.message.reply_text(
            "❌ 请提供书籍ID\n"
            "用法: /favorite <书籍ID>"
        )
        return
    try:
        book_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ 无效的书籍ID")
        return
    await _toggle_favorite(update, telegram_id, book_id, is_callback=False)


async def favorites_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /favorites 命令"""
    telegram_id = str(update.effective_user.id)
    page = 1
    await _perform_favorites(update, telegram_id, page, is_callback=False)


async def _perform_favorites(update: Update, telegram_id: str, page: int, is_callback: bool = False):
    """获取收藏列表并分页展示"""
    async for db in get_db():
        try:
            user = await _get_bound_user(update, telegram_id, db, is_callback)
            if not user:
                return
            result = await db.execute(
                select(Favorite, Book)
                .join(Book, Favorite.book_id == Book.id)
                .options(joinedload(Book.author), joinedload(Book.versions))
                .where(Favorite.user_id == user.id)
                .order_by(Favorite.created_at.desc())
            )
            favorites = result.all()
            filtered = []
            for favorite, book in favorites:
                if await check_book_access(user, book.id, db):
                    filtered.append((favorite, book))

            total = len(filtered)
            if total == 0:
                msg = "暂无收藏"
                if is_callback:
                    await update.callback_query.edit_message_text(msg)
                else:
                    await update.message.reply_text(msg)
                return

            total_pages = math.ceil(total / PAGE_SIZE)
            start = (page - 1) * PAGE_SIZE
            end = start + PAGE_SIZE
            page_items = filtered[start:end]

            message = "⭐ 我的收藏\n"
            message += f"共 {total} 本 | 第 {page}/{total_pages} 页\n\n"
            for i, (favorite, book) in enumerate(page_items, start=start+1):
                author_name = book.author.name if book.author else "未知"
                file_format = "unknown"
                file_size = 0
                if book.versions:
                    primary = next((v for v in book.versions if v.is_primary), book.versions[0])
                    file_format = primary.file_format
                    file_size = primary.file_size
                size_str = f"{file_size / 1024:.1f}KB" if file_size < 1024*1024 else f"{file_size / 1024 / 1024:.1f}MB"
                message += f"{i:02d}. 📖 {book.title}\n"
                message += f"    ✍️ {author_name} | {file_format.upper()} | {size_str}\n"
                message += f"    🆔 /info {book.id}\n"
                message += f"    🆔 /favorite {book.id} (取消/收藏)\n"

            keyboard = []
            nav_row = []
            if page > 1:
                nav_row.append(InlineKeyboardButton("⬅️ 上一页", callback_data=f"favorites:{page-1}"))
            nav_row.append(InlineKeyboardButton(f"{page}/{total_pages}", callback_data="noop"))
            if page < total_pages:
                nav_row.append(InlineKeyboardButton("下一页 ➡️", callback_data=f"favorites:{page+1}"))
            if nav_row:
                keyboard.append(nav_row)
            reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None

            if is_callback:
                await update.callback_query.edit_message_text(message, reply_markup=reply_markup)
            else:
                await update.message.reply_text(message, reply_markup=reply_markup)
        except Exception as e:
            logger.error(f"获取收藏列表失败: {e}")
            msg = "❌ 获取收藏失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
            else:
                await update.message.reply_text(msg)


async def continue_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理 /continue 命令"""
    telegram_id = str(update.effective_user.id)
    page = 1
    await _perform_continue(update, telegram_id, page, is_callback=False)


async def _perform_continue(update: Update, telegram_id: str, page: int, is_callback: bool = False):
    """获取继续阅读列表并分页展示"""
    async for db in get_db():
        try:
            user = await _get_bound_user(update, telegram_id, db, is_callback)
            if not user:
                return
            result = await db.execute(
                select(ReadingProgress)
                .options(joinedload(ReadingProgress.book).joinedload(Book.author))
                .where(
                    ReadingProgress.user_id == user.id,
                    ReadingProgress.finished == False,
                    ReadingProgress.progress > 0
                )
                .order_by(desc(ReadingProgress.last_read_at))
            )
            progress_list = result.scalars().all()
            filtered = []
            for progress in progress_list:
                if progress.book and await check_book_access(user, progress.book.id, db):
                    filtered.append(progress)

            total = len(filtered)
            if total == 0:
                msg = "暂无继续阅读记录"
                if is_callback:
                    await update.callback_query.edit_message_text(msg)
                else:
                    await update.message.reply_text(msg)
                return

            total_pages = math.ceil(total / PAGE_SIZE)
            start = (page - 1) * PAGE_SIZE
            end = start + PAGE_SIZE
            page_items = filtered[start:end]

            message = "▶️ 继续阅读\n"
            message += f"共 {total} 本 | 第 {page}/{total_pages} 页\n\n"
            for i, progress in enumerate(page_items, start=start+1):
                book = progress.book
                author_name = book.author.name if book.author else "未知"
                percent = int(progress.progress * 100)
                message += f"{i:02d}. 📖 {book.title}\n"
                message += f"    ✍️ {author_name} | 进度: {percent}%\n"
                message += f"    🆔 /info {book.id}\n"
                message += f"    🆔 /download {book.id}\n"

            keyboard = []
            nav_row = []
            if page > 1:
                nav_row.append(InlineKeyboardButton("⬅️ 上一页", callback_data=f"continue:{page-1}"))
            nav_row.append(InlineKeyboardButton(f"{page}/{total_pages}", callback_data="noop"))
            if page < total_pages:
                nav_row.append(InlineKeyboardButton("下一页 ➡️", callback_data=f"continue:{page+1}"))
            if nav_row:
                keyboard.append(nav_row)
            reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None

            if is_callback:
                await update.callback_query.edit_message_text(message, reply_markup=reply_markup)
            else:
                await update.message.reply_text(message, reply_markup=reply_markup)
        except Exception as e:
            logger.error(f"获取继续阅读失败: {e}")
            msg = "❌ 获取继续阅读失败，请稍后重试"
            if is_callback:
                await update.callback_query.answer(msg, show_alert=True)
            else:
                await update.message.reply_text(msg)


async def download_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
(update: Update, context: ContextTypes.DEFAULT_TYPE):
(update: Update, context: ContextTypes.DEFAULT_TYPE):
(update: Update, context: ContextTypes.DEFAULT_TYPE):
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
