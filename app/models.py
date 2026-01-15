"""
数据库模型定义
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    reading_progress = relationship("ReadingProgress", back_populates="user", cascade="all, delete-orphan")


class Library(Base):
    """书库表"""
    __tablename__ = "libraries"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    path = Column(String(500), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_scan = Column(DateTime, nullable=True)

    # 关系
    books = relationship("Book", back_populates="library", cascade="all, delete-orphan")


class Author(Base):
    """作者表"""
    __tablename__ = "authors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    book_count = Column(Integer, default=0)

    # 关系
    books = relationship("Book", back_populates="author")


class Book(Base):
    """书籍表"""
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    library_id = Column(Integer, ForeignKey("libraries.id"), nullable=False)
    title = Column(String(200), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("authors.id"), nullable=True)
    
    # 文件信息
    file_path = Column(String(1000), unique=True, nullable=False)
    file_name = Column(String(255), nullable=False)
    file_format = Column(String(20), nullable=False, index=True)
    file_size = Column(Integer, nullable=False)
    file_hash = Column(String(64), nullable=False, index=True)
    
    # 元数据
    cover_path = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    publisher = Column(String(100), nullable=True)
    
    added_at = Column(DateTime, default=datetime.utcnow, index=True)

    # 关系
    library = relationship("Library", back_populates="books")
    author = relationship("Author", back_populates="books")
    reading_progress = relationship("ReadingProgress", back_populates="book", cascade="all, delete-orphan")


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

    # 唯一约束
    __table_args__ = (
        # 每个用户对每本书只有一条进度记录
        # 注意：SQLAlchemy 2.0+ 使用 UniqueConstraint
    )
