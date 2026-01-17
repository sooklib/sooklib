"""
书库扫描模块
扫描书库目录，提取元数据并保存到数据库
"""
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deduplicator import Deduplicator
from app.core.extractor import Extractor
from app.core.metadata.epub_parser import EpubParser
from app.core.metadata.mobi_parser import MobiParser
from app.core.metadata.txt_parser import TxtParser
from app.core.tag_keywords import get_tags_from_filename, get_tags_from_content
from app.models import Author, Book, BookVersion, Library, LibraryTag, Tag
from app.utils.file_hash import calculate_file_hash
from app.utils.logger import log


class Scanner:
    """书库扫描器"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.extractor = Extractor()
        self.deduplicator = Deduplicator(db)
        
        # 初始化解析器（传入数据库会话以支持动态规则）
        self.txt_parser = TxtParser(db)
        self.epub_parser = EpubParser()
        self.mobi_parser = MobiParser()
        
        self.supported_formats = settings.scanner.supported_formats
        self.recursive = settings.scanner.recursive
    
    async def scan_library(self, library_id: int) -> dict:
        """
        扫描指定的书库
        
        Args:
            library_id: 书库ID
            
        Returns:
            扫描统计信息
        """
        # 获取书库信息
        result = await self.db.execute(
            select(Library).where(Library.id == library_id)
        )
        library = result.scalar_one_or_none()
        
        if not library:
            raise ValueError(f"书库不存在: {library_id}")
        
        library_path = Path(library.path)
        if not library_path.exists():
            raise ValueError(f"书库路径不存在: {library.path}")
        
        log.info(f"开始扫描书库: {library.name} ({library.path})")
        
        # 加载自定义文件名解析规则
        await self.txt_parser.load_custom_patterns()
        
        # 加载书库默认标签
        library_tag_ids = await self._get_library_tags(library_id)
        if library_tag_ids:
            log.info(f"书库默认标签: {len(library_tag_ids)} 个")
        
        stats = {
            "scanned": 0,
            "added": 0,
            "skipped": 0,
            "errors": 0,
        }
        
        # 扫描所有文件
        files = self._discover_files(library_path)
        log.info(f"发现 {len(files)} 个文件")
        
        for file_path in files:
            try:
                stats["scanned"] += 1
                
                # 检查是否为压缩包
                if self._is_archive(file_path):
                    await self._process_archive(file_path, library_id, stats)
                else:
                    await self._process_ebook(file_path, library_id, stats)
                    
            except Exception as e:
                log.error(f"处理文件失败: {file_path}, 错误: {e}")
                stats["errors"] += 1
        
        # 更新文件名规则统计信息
        await self.txt_parser.update_pattern_stats()
        
        # 更新书库最后扫描时间
        library.last_scan = datetime.utcnow()
        await self.db.commit()
        
        log.info(f"扫描完成: {stats}")
        return stats
    
    def _discover_files(self, directory: Path) -> List[Path]:
        """
        发现目录中的所有支持的文件
        
        Args:
            directory: 扫描目录
            
        Returns:
            文件路径列表
        """
        files = []
        
        for ext in self.supported_formats:
            if self.recursive:
                files.extend(directory.rglob(f'*{ext}'))
            else:
                files.extend(directory.glob(f'*{ext}'))
        
        return files
    
    def _discover_files_generator(self, directory: Path):
        """
        发现目录中的所有支持的文件（生成器版本，节省内存）
        
        Args:
            directory: 扫描目录
            
        Yields:
            文件路径
        """
        for ext in self.supported_formats:
            if self.recursive:
                yield from directory.rglob(f'*{ext}')
            else:
                yield from directory.glob(f'*{ext}')
    
    def _is_archive(self, file_path: Path) -> bool:
        """判断文件是否为压缩包"""
        archive_formats = ['.zip', '.rar', '.7z', '.iso', '.tar.gz', '.tar.bz2']
        return any(str(file_path).lower().endswith(fmt) for fmt in archive_formats)
    
    async def _process_archive(self, archive_path: Path, library_id: int, stats: dict):
        """
        处理压缩包文件
        
        Args:
            archive_path: 压缩包路径
            library_id: 书库ID
            stats: 统计信息字典
        """
        log.info(f"处理压缩包: {archive_path}")
        
        # 创建临时目录
        temp_dir = Path(settings.directories.temp) / str(uuid.uuid4())
        
        try:
            # 解压
            ebook_files = self.extractor.extract(archive_path, temp_dir)
            
            # 处理解压后的每个电子书
            for ebook_file in ebook_files:
                try:
                    await self._process_ebook(ebook_file, library_id, stats)
                except Exception as e:
                    log.error(f"处理解压文件失败: {ebook_file}, 错误: {e}")
                    stats["errors"] += 1
        
        finally:
            # 清理临时目录
            self.extractor.cleanup(temp_dir)
    
    async def _process_ebook(self, file_path: Path, library_id: int, stats: dict):
        """
        处理电子书文件（支持版本管理）
        
        Args:
            file_path: 电子书路径
            library_id: 书库ID
            stats: 统计信息字典
        """
        # 提取元数据
        metadata = self._extract_metadata(file_path)
        
        if not metadata:
            log.warning(f"无法提取元数据: {file_path}")
            stats["skipped"] += 1
            return
        
        # TXT 文件：一次性读取内容用于简介和标签提取（内存优化）
        txt_content = None
        if file_path.suffix.lower() == '.txt':
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    txt_content = f.read(5000)  # 只读前5000字，足够提取简介和标签
            except Exception as e:
                log.error(f"读取TXT内容失败: {file_path}, 错误: {e}")
        
        # 智能提取简介（仅TXT，且没有简介时）
        if txt_content and not metadata.get('description'):
            try:
                description = self.txt_parser.extract_description(txt_content)
                if description:
                    metadata['description'] = description
                    log.debug(f"提取到简介: {len(description)}字")
            except Exception as e:
                log.error(f"提取简介失败: {file_path}, 错误: {e}")
        
        # 自动提取标签
        auto_tags = []
        try:
            # 从文件名提取
            auto_tags.extend(get_tags_from_filename(file_path.name))
            
            # 从内容提取（仅TXT，复用已读内容）
            if txt_content:
                try:
                    # 只用前1000字提取标签
                    auto_tags.extend(get_tags_from_content(txt_content[:1000]))
                except Exception as e:
                    log.error(f"从内容提取标签失败: {e}")
            
            auto_tags = list(set(auto_tags))  # 去重
            if auto_tags:
                metadata['auto_tags'] = auto_tags
                log.debug(f"自动提取标签: {auto_tags}")
        except Exception as e:
            log.error(f"提取标签失败: {file_path}, 错误: {e}")
        
        # 释放内容引用，帮助 GC
        txt_content = None
        
        # 去重检测（支持版本管理）
        action, book_id, reason = await self.deduplicator.check_duplicate(
            file_path,
            metadata["title"],
            metadata.get("author")
        )
        
        if action == 'skip':
            log.info(f"跳过重复文件: {file_path} ({reason})")
            stats["skipped"] += 1
            return
        elif action == 'add_version':
            log.info(f"添加新版本: {file_path} ({reason})")
            await self._save_book_version(file_path, book_id, metadata)
            stats["added"] += 1
        else:  # new_book
            log.info(f"添加新书籍: {metadata['title']} by {metadata.get('author', 'Unknown')}")
            await self._save_book(file_path, library_id, metadata, library_tag_ids)
            stats["added"] += 1
    
    def _extract_metadata(self, file_path: Path) -> Optional[dict]:
        """
        根据文件类型提取元数据
        
        Args:
            file_path: 文件路径
            
        Returns:
            元数据字典
        """
        suffix = file_path.suffix.lower()
        
        try:
            if suffix == '.txt':
                return self.txt_parser.parse(file_path)
            elif suffix == '.epub':
                return self.epub_parser.parse(file_path)
            elif suffix in ['.mobi', '.azw3']:
                return self.mobi_parser.parse(file_path)
            else:
                log.warning(f"不支持的文件格式: {suffix}")
                return None
        except Exception as e:
            log.error(f"元数据提取失败: {file_path}, 错误: {e}")
            return None
    
    async def _get_library_tags(self, library_id: int) -> list:
        """
        获取书库的默认标签ID列表
        
        Args:
            library_id: 书库ID
            
        Returns:
            标签ID列表
        """
        result = await self.db.execute(
            select(LibraryTag.tag_id).where(LibraryTag.library_id == library_id)
        )
        return [row[0] for row in result.fetchall()]
    
    async def _save_book(self, file_path: Path, library_id: int, metadata: dict, library_tag_ids: list = None):
        """
        保存新书籍到数据库（包含主版本）
        
        Args:
            file_path: 文件路径
            library_id: 书库ID
            metadata: 元数据
        """
        # 获取或创建作者
        author_id = None
        if metadata.get("author"):
            author_id = await self._get_or_create_author(metadata["author"])
        
        # 创建书籍主记录
        book = Book(
            library_id=library_id,
            title=metadata["title"],
            author_id=author_id,
            cover_path=metadata.get("cover"),
            description=metadata.get("description"),
            publisher=metadata.get("publisher"),
        )
        
        self.db.add(book)
        await self.db.flush()  # 获取book.id但不提交
        
        # 自动添加标签
        if metadata.get('auto_tags'):
            for tag_name in metadata['auto_tags']:
                tag = await self._get_or_create_tag(tag_name)
                if tag not in book.tags:
                    book.tags.append(tag)
            log.debug(f"为书籍添加标签: {metadata['auto_tags']}")
        
        # 添加书库默认标签
        if library_tag_ids:
            for tag_id in library_tag_ids:
                tag_result = await self.db.execute(
                    select(Tag).where(Tag.id == tag_id)
                )
                tag = tag_result.scalar_one_or_none()
                if tag and tag not in book.tags:
                    book.tags.append(tag)
            log.debug(f"为书籍添加书库默认标签: {len(library_tag_ids)} 个")
        
        # 创建主版本 - 使用 as_posix() 确保路径格式一致
        file_hash = calculate_file_hash(file_path, settings.deduplicator.hash_algorithm)
        quality = self._determine_quality(file_path)
        
        version = BookVersion(
            book_id=book.id,
            file_path=str(file_path.absolute().as_posix()),
            file_name=file_path.name,
            file_format=file_path.suffix.lower(),
            file_size=file_path.stat().st_size,
            file_hash=file_hash,
            quality=quality,
            is_primary=True,  # 第一个版本默认为主版本
        )
        
        self.db.add(version)
        await self.db.commit()
    
    async def _save_book_version(self, file_path: Path, book_id: int, metadata: dict):
        """
        为现有书籍添加新版本
        
        Args:
            file_path: 文件路径
            book_id: 书籍ID
            metadata: 元数据
        """
        # 计算文件Hash
        file_hash = calculate_file_hash(file_path, settings.deduplicator.hash_algorithm)
        quality = self._determine_quality(file_path)
        
        # 检查是否已有主版本，如果没有则设为主版本
        result = await self.db.execute(
            select(BookVersion)
            .where(BookVersion.book_id == book_id)
            .where(BookVersion.is_primary == True)
        )
        has_primary = result.scalar_one_or_none() is not None
        
        # 创建新版本 - 使用 as_posix() 确保路径格式一致
        version = BookVersion(
            book_id=book_id,
            file_path=str(file_path.absolute().as_posix()),
            file_name=file_path.name,
            file_format=file_path.suffix.lower(),
            file_size=file_path.stat().st_size,
            file_hash=file_hash,
            quality=quality,
            is_primary=not has_primary,  # 如果没有主版本，设为主版本
        )
        
        self.db.add(version)
        await self.db.commit()
    
    def _determine_quality(self, file_path: Path) -> str:
        """
        根据文件属性判断质量
        
        Args:
            file_path: 文件路径
            
        Returns:
            质量等级：'low', 'medium', 'high'
        """
        file_format = file_path.suffix.lower()
        file_size = file_path.stat().st_size
        
        # 基于格式的初步判断
        format_quality = {
            '.epub': 'high',
            '.mobi': 'medium',
            '.azw3': 'high',
            '.txt': 'low',
        }
        
        base_quality = format_quality.get(file_format, 'medium')
        
        # 基于文件大小调整（简单规则）
        # EPUB/MOBI: >2MB = high, 500KB-2MB = medium, <500KB = low
        if file_format in ['.epub', '.mobi', '.azw3']:
            if file_size > 2 * 1024 * 1024:
                return 'high'
            elif file_size > 500 * 1024:
                return 'medium'
            else:
                return 'low'
        
        return base_quality
    
    async def _get_or_create_author(self, author_name: str) -> int:
        """
        获取或创建作者
        
        Args:
            author_name: 作者名
            
        Returns:
            作者ID
        """
        # 查找作者
        result = await self.db.execute(
            select(Author).where(Author.name == author_name)
        )
        author = result.scalar_one_or_none()
        
        if author:
            # 更新书籍数量
            author.book_count += 1
            await self.db.commit()
            return author.id
        
        # 创建新作者
        author = Author(name=author_name, book_count=1)
        self.db.add(author)
        await self.db.commit()
        await self.db.refresh(author)
        
        return author.id
    
    async def _get_or_create_tag(self, tag_name: str) -> Tag:
        """
        获取或创建标签
        
        Args:
            tag_name: 标签名
            
        Returns:
            Tag对象
        """
        # 查找标签
        result = await self.db.execute(
            select(Tag).where(Tag.name == tag_name)
        )
        tag = result.scalar_one_or_none()
        
        if tag:
            return tag
        
        # 创建新标签（自动扫描添加的标签类型为auto）
        tag = Tag(name=tag_name, type="auto")
        self.db.add(tag)
        await self.db.flush()  # 获取ID但不提交
        
        return tag
