"""
数据库模型定义
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.ext.associationproxy import association_proxy

from app.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Telegram 集成
    telegram_id = Column(String(20), unique=True, nullable=True, index=True)  # Telegram 用户 ID

    # Kindle 推送
    kindle_email = Column(String(255), nullable=True)

    # 个人资料
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    
    # 内容分级控制
    age_rating_limit = Column(String(20), default='all')  # 'all', 'teen', 'adult'
    blocked_tags = Column(Text, nullable=True)  # JSON 存储被屏蔽的标签 ID 列表

    # 关系
    reading_progress = relationship("ReadingProgress", back_populates="user", cascade="all, delete-orphan")
    library_permissions = relationship("LibraryPermission", back_populates="user", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    user_book_tags = relationship("UserBookTag", back_populates="user", cascade="all, delete-orphan")
    book_reviews = relationship("BookReview", back_populates="user", cascade="all, delete-orphan")


class Library(Base):
    """书库表"""
    __tablename__ = "libraries"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    path = Column(String(500), unique=True, nullable=True)  # 改为可空，向后兼容
    created_at = Column(DateTime, default=datetime.utcnow)
    last_scan = Column(DateTime, nullable=True)
    
    # 访问控制
    is_public = Column(Boolean, default=False)  # 是否为公共书库（所有用户可见）
    scraper_config = Column(Text, nullable=True)  # JSON 存储刮削器配置
    
    # 内容分级（扫描时自动应用到新书）
    content_rating = Column(String(20), default='general')  # 'general', 'teen', 'adult', 'r18'

    # 关系
    books = relationship("Book", back_populates="library", cascade="all, delete-orphan")
    permissions = relationship("LibraryPermission", back_populates="library", cascade="all, delete-orphan")
    paths = relationship("LibraryPath", back_populates="library", cascade="all, delete-orphan")
    scan_tasks = relationship("ScanTask", back_populates="library", cascade="all, delete-orphan")
    library_tags = relationship("LibraryTag", back_populates="library", cascade="all, delete-orphan")


class LibraryPath(Base):
    """书库路径表（支持多路径）"""
    __tablename__ = "library_paths"

    id = Column(Integer, primary_key=True, index=True)
    library_id = Column(Integer, ForeignKey("libraries.id", ondelete="CASCADE"), nullable=False)
    path = Column(String(500), nullable=False)
    enabled = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    library = relationship("Library", back_populates="paths")


class LibraryTag(Base):
    """书库标签关联（书库默认标签，扫描时自动应用到新书）"""
    __tablename__ = "library_tags"

    id = Column(Integer, primary_key=True, index=True)
    library_id = Column(Integer, ForeignKey("libraries.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    library = relationship("Library", back_populates="library_tags")
    tag = relationship("Tag", back_populates="library_tags")

    # 唯一约束
    __table_args__ = (
        UniqueConstraint('library_id', 'tag_id', name='uq_library_tag'),
    )


class ScanTask(Base):
    """扫描任务表"""
    __tablename__ = "scan_tasks"

    id = Column(Integer, primary_key=True, index=True)
    library_id = Column(Integer, ForeignKey("libraries.id"), nullable=False)
    status = Column(String(20), default='pending', index=True)  # pending, running, completed, failed, cancelled
    progress = Column(Integer, default=0)  # 0-100
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    added_books = Column(Integer, default=0)
    skipped_books = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # 关系
    library = relationship("Library", back_populates="scan_tasks")


class LibraryPermission(Base):
    """用户书库访问权限"""
    __tablename__ = "library_permissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    library_id = Column(Integer, ForeignKey("libraries.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="library_permissions")
    library = relationship("Library", back_populates="permissions")

    # 唯一约束
    __table_args__ = (
        UniqueConstraint('user_id', 'library_id', name='uq_user_library'),
    )


class Author(Base):
    """作者表"""
    __tablename__ = "authors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    book_count = Column(Integer, default=0)

    # 关系
    books = relationship("Book", back_populates="author")


class Book(Base):
    """书籍表（主记录，包含元数据）"""
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    library_id = Column(Integer, ForeignKey("libraries.id"), nullable=False)
    title = Column(String(200), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("authors.id"), nullable=True)
    
    # 元数据（来自主版本或手动设置）
    cover_path = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    publisher = Column(String(100), nullable=True)
    
    # 内容分级
    age_rating = Column(String(20), default='general')  # 'general', 'teen', 'adult'
    content_warning = Column(Text, nullable=True)  # 内容警告说明
    
    added_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # 书籍组（关联重复书籍）
    group_id = Column(Integer, ForeignKey("book_groups.id", ondelete="SET NULL"), nullable=True, index=True)

    # 关系
    library = relationship("Library", back_populates="books")
    author = relationship("Author", back_populates="books")
    group = relationship("BookGroup", back_populates="books", foreign_keys=[group_id])
    versions = relationship("BookVersion", back_populates="book", cascade="all, delete-orphan")
    reading_progress = relationship("ReadingProgress", back_populates="book", cascade="all, delete-orphan")
    book_tags = relationship("BookTag", back_populates="book", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="book", cascade="all, delete-orphan")
    user_book_tags = relationship("UserBookTag", back_populates="book", cascade="all, delete-orphan")
    reviews = relationship("BookReview", back_populates="book", cascade="all, delete-orphan")
    
    # 便捷属性：通过book_tags访问tags
    tags = association_proxy("book_tags", "tag")


class BookVersion(Base):
    """书籍版本表（具体文件）"""
    __tablename__ = "book_versions"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    
    # 文件信息
    file_path = Column(String(1000), unique=True, nullable=False)
    file_name = Column(String(255), nullable=False)
    file_format = Column(String(20), nullable=False, index=True)
    file_size = Column(Integer, nullable=False)
    file_hash = Column(String(64), unique=True, nullable=False, index=True)
    
    # 版本属性
    quality = Column(String(20), default='medium')  # 'low', 'medium', 'high'
    source = Column(String(100), nullable=True)  # 来源说明
    is_primary = Column(Boolean, default=False)  # 是否为主版本
    
    added_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    book = relationship("Book", back_populates="versions")


class Tag(Base):
    """内容标签（用于分级控制）"""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    type = Column(String(20), nullable=False)  # 'genre', 'age_rating', 'custom'
    description = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    book_tags = relationship("BookTag", back_populates="tag", cascade="all, delete-orphan")
    library_tags = relationship("LibraryTag", back_populates="tag", cascade="all, delete-orphan")


class BookTag(Base):
    """书籍标签关联"""
    __tablename__ = "book_tags"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    book = relationship("Book", back_populates="book_tags")
    tag = relationship("Tag", back_populates="book_tags")

    # 唯一约束
    __table_args__ = (
        UniqueConstraint('book_id', 'tag_id', name='uq_book_tag'),
    )


class Favorite(Base):
    """用户收藏夹"""
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="favorites")
    book = relationship("Book", back_populates="favorites")

    # 唯一约束
    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_favorite'),
    )


class BookReview(Base):
    """书籍评分与评论"""
    __tablename__ = "book_reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)  # 1-5 星
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="book_reviews")
    book = relationship("Book", back_populates="reviews")

    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_book_review'),
    )


class UserBookTag(Base):
    """用户个人书籍标签"""
    __tablename__ = "user_book_tags"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    tag_name = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="user_book_tags")
    book = relationship("Book", back_populates="user_book_tags")


class ReadingProgress(Base):
    """阅读进度表"""
    __tablename__ = "reading_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    
    progress = Column(Float, default=0.0)  # 进度百分比 0.0-1.0
    position = Column(Text, nullable=True)  # 具体位置 (cfi for epub, line for txt)
    last_read_at = Column(DateTime, default=datetime.utcnow)
    finished = Column(Boolean, default=False)

    # 关系
    user = relationship("User", back_populates="reading_progress")
    book = relationship("Book", back_populates="reading_progress")

    # 唯一约束：每个用户对每本书只有一条进度记录
    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_user_book_progress'),
    )


class BookGroup(Base):
    """书籍组（用于关联重复/相同的书籍，类似Emby的版本合并）"""
    __tablename__ = "book_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=True)  # 组名称（可选，默认使用主书籍标题）
    primary_book_id = Column(Integer, nullable=True)  # 主书籍ID（用于显示封面、标题等）
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    books = relationship("Book", back_populates="group", foreign_keys="Book.group_id")


class Bookmark(Base):
    """阅读书签"""
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    
    # 书签位置信息
    position = Column(Text, nullable=False)  # TXT: 滚动位置, EPUB: CFI
    chapter_title = Column(String(200), nullable=True)  # 章节标题（可选）
    note = Column(Text, nullable=True)  # 用户备注
    
    # 元数据
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    user = relationship("User", backref="bookmarks")
    book = relationship("Book", backref="bookmarks")


class Annotation(Base):
    """阅读笔记/批注/高亮"""
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    
    # 位置信息
    chapter_index = Column(Integer, nullable=False)  # 章节索引
    chapter_title = Column(String(200), nullable=True)  # 章节标题
    start_offset = Column(Integer, nullable=False)  # 章节内起始偏移（字符位置）
    end_offset = Column(Integer, nullable=False)  # 章节内结束偏移
    
    # 内容
    selected_text = Column(Text, nullable=False)  # 选中的原文文本
    note = Column(Text, nullable=True)  # 用户笔记内容（可选，纯高亮则为空）
    
    # 类型和样式
    annotation_type = Column(String(20), default='highlight')  # 'highlight', 'note', 'underline'
    color = Column(String(20), default='yellow')  # 'yellow', 'green', 'blue', 'red', 'purple'
    
    # 元数据
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    user = relationship("User", backref="annotations")
    book = relationship("Book", backref="annotations")

    # 唯一约束（同一用户同一书籍同一位置只能有一个标注）
    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', 'chapter_index', 'start_offset', 'end_offset', 
                         name='uq_user_book_annotation_position'),
    )


class ReadingSession(Base):
    """阅读会话（用于统计阅读时长）"""
    __tablename__ = "reading_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 会话时间
    start_time = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)  # 阅读时长（秒）
    
    # 阅读进度
    progress = Column(Float, nullable=True)  # 0.0 - 1.0
    
    # 客户端信息
    ip_address = Column(String(45), nullable=True)
    device_info = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    user = relationship("User", backref="reading_sessions")
    book = relationship("Book", backref="reading_sessions")


class FilenamePattern(Base):
    """文件名解析规则"""
    __tablename__ = "filename_patterns"

    id = Column(Integer, primary_key=True, index=True)
    
    # 规则基本信息
    name = Column(String(100), nullable=False)  # 规则名称
    description = Column(Text, nullable=True)  # 规则描述
    regex_pattern = Column(Text, nullable=False)  # 正则表达式模式
    
    # 捕获组定义（指定哪个组对应哪个字段）
    title_group = Column(Integer, default=1)  # 书名对应的捕获组（1-based）
    author_group = Column(Integer, default=2)  # 作者对应的捕获组（0表示无此字段）
    extra_group = Column(Integer, default=0)  # 额外信息对应的捕获组（如系列名、卷数等）
    
    # 规则属性
    priority = Column(Integer, default=0, index=True)  # 优先级（数字越大优先级越高）
    is_active = Column(Boolean, default=True, index=True)  # 是否启用
    library_id = Column(Integer, ForeignKey("libraries.id"), nullable=True)  # 关联书库（null表示全局规则）
    
    # 统计信息
    match_count = Column(Integer, default=0)  # 匹配次数
    success_count = Column(Integer, default=0)  # 成功提取次数
    accuracy_rate = Column(Float, default=0.0)  # 准确率（成功次数/匹配次数）
    
    # 创建方式
    created_by = Column(String(20), default='manual')  # manual, auto, ai
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 示例
    example_filename = Column(String(500), nullable=True)  # 示例文件名
    example_result = Column(Text, nullable=True)  # 示例解析结果（JSON）
