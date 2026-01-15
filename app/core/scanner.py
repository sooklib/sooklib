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
from app.models import Author, Book, Library
from app.utils.file_hash import calculate_file_hash
from app.utils.logger import log


class Scanner:
    """书库扫描器"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.extractor = Extractor()
        self.deduplicator = Deduplicator(db)
        
        # 初始化解析器
        self.txt_parser = TxtParser()
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
        处理电子书文件
        
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
        
        # 去重检测
        is_dup, reason = await self.deduplicator.is_duplicate(
            file_path,
            metadata["title"],
            metadata.get("author")
        )
        
        if is_dup:
            log.info(f"跳过重复文件: {file_path} ({reason})")
            stats["skipped"] += 1
            return
        
        # 保存到数据库
        await self._save_book(file_path, library_id, metadata)
        stats["added"] += 1
        log.info(f"添加书籍: {metadata['title']} by {metadata.get('author', 'Unknown')}")
    
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
    
    async def _save_book(self, file_path: Path, library_id: int, metadata: dict):
        """
        保存书籍到数据库
        
        Args:
            file_path: 文件路径
            library_id: 书库ID
            metadata: 元数据
        """
        # 获取或创建作者
        author_id = None
        if metadata.get("author"):
            author_id = await self._get_or_create_author(metadata["author"])
        
        # 计算文件Hash
        file_hash = calculate_file_hash(file_path, settings.deduplicator.hash_algorithm)
        
        # 创建书籍记录
        book = Book(
            library_id=library_id,
            title=metadata["title"],
            author_id=author_id,
            file_path=str(file_path.absolute()),
            file_name=file_path.name,
            file_format=file_path.suffix.lower(),
            file_size=file_path.stat().st_size,
            file_hash=file_hash,
            cover_path=metadata.get("cover"),
            description=metadata.get("description"),
            publisher=metadata.get("publisher"),
        )
        
        self.db.add(book)
        await self.db.commit()
    
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
