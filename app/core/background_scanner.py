"""
后台扫描任务系统
支持异步扫描、批量处理、进度跟踪
"""
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.config import settings
from app.models import Library, LibraryPath, ScanTask, Book, BookVersion, Author
from app.core.extractor import Extractor
from app.core.deduplicator import Deduplicator
from app.core.metadata.epub_parser import EpubParser
from app.core.metadata.mobi_parser import MobiParser
from app.core.metadata.txt_parser import TxtParser
from app.utils.file_hash import calculate_file_hash
from app.utils.logger import log
from app.core.websocket import manager


class BackgroundScanner:
    """后台扫描器"""
    
    # 最大错误日志条数（防止过多错误占用存储）
    MAX_ERROR_LOGS = 100
    
    def __init__(self):
        self.extractor = Extractor()
        self.txt_parser = None  # 将在 worker 中初始化
        self.epub_parser = EpubParser()
        self.mobi_parser = MobiParser()
        self.supported_formats = settings.scanner.supported_formats
        
        # 扫描过程中的错误日志（格式: [{"file": ..., "error": ...}, ...]）
        self._error_logs: List[dict] = []
        
        # 创建异步引擎（用于后台任务）
        self.engine = create_async_engine(
            settings.database.url,
            echo=False,
            pool_pre_ping=True,
        )
        self.async_session_maker = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
    
    @asynccontextmanager
    async def get_session(self):
        """获取数据库会话"""
        async with self.async_session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    
    async def start_scan(self, library_id: int) -> int:
        """
        启动后台扫描任务
        
        Args:
            library_id: 书库ID
            
        Returns:
            任务ID
        """
        async with self.get_session() as db:
            # 检查是否有正在运行的任务
            result = await db.execute(
                select(ScanTask)
                .where(ScanTask.library_id == library_id)
                .where(ScanTask.status == 'running')
            )
            existing_task = result.scalar_one_or_none()
            
            if existing_task:
                raise ValueError(f"书库 {library_id} 已有正在运行的扫描任务")
            
            # 创建扫描任务记录
            task = ScanTask(library_id=library_id, status='pending')
            db.add(task)
            await db.commit()
            await db.refresh(task)
            
            task_id = task.id
        
        # 启动异步任务（不等待完成）
        asyncio.create_task(self._scan_worker(task_id, library_id))
        
        log.info(f"后台扫描任务已启动: task_id={task_id}, library_id={library_id}")
        return task_id
    
    async def _scan_worker(self, task_id: int, library_id: int):
        """
        扫描工作线程
        
        Args:
            task_id: 任务ID
            library_id: 书库ID
        """
        import json
        
        # 重置错误日志
        self._error_logs = []
        
        async with self.get_session() as db:
            try:
                # 获取任务
                task = await db.get(ScanTask, task_id)
                if not task:
                    log.error(f"扫描任务不存在: {task_id}")
                    return
                
                # 更新状态
                task.status = 'running'
                task.started_at = datetime.utcnow()
                await db.commit()
                
                # 发送初始状态
                await self._broadcast_progress(task)
                
                log.info(f"开始执行扫描任务: {task_id}")
                
                # 初始化 TXT 解析器（需要数据库会话）
                self.txt_parser = TxtParser(db)
                await self.txt_parser.load_custom_patterns()
                
                # 执行扫描
                await self._scan_library_optimized(task, library_id, db)
                
                # 更新任务完成状态
                task.status = 'completed'
                task.completed_at = datetime.utcnow()
                task.progress = 100
                
                # 保存错误日志到 error_message（JSON 格式）
                if self._error_logs:
                    task.error_message = json.dumps(self._error_logs, ensure_ascii=False)[:10000]
                
                await db.commit()
                
                # 发送完成状态
                await self._broadcast_progress(task)
                
                log.info(f"扫描任务完成: {task_id}, 添加={task.added_books}, 跳过={task.skipped_books}, 错误={task.error_count}")
                
            except Exception as e:
                log.error(f"扫描任务失败: {task_id}, 错误: {e}", exc_info=True)
                
                # 更新任务失败状态
                try:
                    task = await db.get(ScanTask, task_id)
                    if task:
                        task.status = 'failed'
                        # 保存主错误信息，并附加已收集的错误日志
                        error_data = {
                            "main_error": str(e)[:1000],
                            "file_errors": self._error_logs
                        }
                        task.error_message = json.dumps(error_data, ensure_ascii=False)[:10000]
                        task.completed_at = datetime.utcnow()
                        await db.commit()
                        
                        # 发送失败状态
                        await self._broadcast_progress(task)
                except Exception as update_error:
                    log.error(f"更新任务状态失败: {update_error}")
    
    async def _scan_library_optimized(self, task: ScanTask, library_id: int, db: AsyncSession):
        """
        优化的扫描流程（支持百万级文件）
        
        Args:
            task: 扫描任务对象
            library_id: 书库ID
            db: 数据库会话
        """
        # 获取书库的所有路径
        result = await db.execute(
            select(Library).where(Library.id == library_id)
        )
        library = result.scalar_one_or_none()
        
        if not library:
            raise ValueError(f"书库不存在: {library_id}")
        
        # 加载路径
        await db.refresh(library, ['paths'])
        
        # 获取启用的路径
        enabled_paths = [lp.path for lp in library.paths if lp.enabled]
        
        if not enabled_paths:
            # 向后兼容：如果没有 paths，尝试使用旧的 path 字段
            if library.path:
                enabled_paths = [library.path]
            else:
                raise ValueError(f"书库 {library_id} 没有可用的扫描路径")
        
        log.info(f"扫描路径: {enabled_paths}")
        
        # 分批处理
        BATCH_SIZE = 100  # 减小批次大小，更频繁地提交
        PROGRESS_UPDATE_INTERVAL = 1000  # 每处理1000个文件更新一次进度
        
        file_batch = []
        total_discovered = 0
        
        # 遍历所有路径
        for path_str in enabled_paths:
            path = Path(path_str)
            if not path.exists():
                log.warning(f"路径不存在，跳过: {path}")
                continue
            
            log.info(f"开始扫描路径: {path}")
            
            # 使用生成器发现文件（节省内存）
            for file_path in self._discover_files_generator(path):
                file_batch.append(file_path)
                total_discovered += 1
                task.total_files += 1
                
                # 达到批次大小，处理一批
                if len(file_batch) >= BATCH_SIZE:
                    await self._process_file_batch(file_batch, library_id, task, db)
                    file_batch = []
                    
                    # 定期更新进度
                    if task.processed_files % PROGRESS_UPDATE_INTERVAL == 0:
                        if task.total_files > 0:
                            task.progress = min(95, int(task.processed_files / task.total_files * 100))
                        await db.commit()
                        await self._broadcast_progress(task)
                        log.info(f"扫描进度: {task.processed_files}/{task.total_files} ({task.progress}%)")
        
        # 处理剩余文件
        if file_batch:
            await self._process_file_batch(file_batch, library_id, task, db)
        
        # 更新规则统计
        if self.txt_parser:
            await self.txt_parser.update_pattern_stats()
        
        # 更新书库最后扫描时间
        library.last_scan = datetime.utcnow()
        await db.commit()
        
    async def _broadcast_progress(self, task: ScanTask):
        """广播进度"""
        await manager.broadcast({
            "type": "scan_progress",
            "task_id": task.id,
            "library_id": task.library_id,
            "status": task.status,
            "progress": task.progress,
            "total_files": task.total_files,
            "processed_files": task.processed_files,
            "added_books": task.added_books,
            "skipped_books": task.skipped_books,
            "error_count": task.error_count
        })
    
    def _discover_files_generator(self, directory: Path):
        """
        生成器方式发现文件（节省内存）
        
        Args:
            directory: 扫描目录
            
        Yields:
            文件路径
        """
        for ext in self.supported_formats:
            try:
                for file_path in directory.rglob(f'*{ext}'):
                    yield file_path
            except Exception as e:
                log.error(f"扫描目录失败: {directory}, 错误: {e}")
    
    async def _process_file_batch(self, files: List[Path], library_id: int, task: ScanTask, db: AsyncSession):
        """
        批量处理文件
        
        Args:
            files: 文件路径列表
            library_id: 书库ID
            task: 扫描任务
            db: 数据库会话
        """
        # 初始化去重器
        deduplicator = Deduplicator(db)
        
        for file_path in files:
            try:
                # 处理单个文件
                await self._process_single_file(file_path, library_id, task, db, deduplicator)
                task.processed_files += 1
                
            except Exception as e:
                task.error_count += 1
                error_msg = str(e)[:200]  # 限制错误消息长度
                log.error(f"处理文件失败: {file_path}, 错误: {error_msg}")
                
                # 收集错误日志（限制数量）
                if len(self._error_logs) < self.MAX_ERROR_LOGS:
                    self._error_logs.append({
                        "file": str(file_path),
                        "error": error_msg,
                        "type": type(e).__name__
                    })
        
        # 批量提交
        await db.commit()
    
    async def _process_single_file(
        self, 
        file_path: Path, 
        library_id: int, 
        task: ScanTask, 
        db: AsyncSession,
        deduplicator: Deduplicator
    ):
        """
        处理单个文件
        
        Args:
            file_path: 文件路径
            library_id: 书库ID
            task: 扫描任务
            db: 数据库会话
            deduplicator: 去重器
        """
        # 提取元数据
        metadata = self._extract_metadata(file_path)
        
        if not metadata:
            task.skipped_books += 1
            return
        
        # 去重检测
        action, book_id, reason = await deduplicator.check_duplicate(
            file_path,
            metadata["title"],
            metadata.get("author")
        )
        
        if action == 'skip':
            task.skipped_books += 1
            return
        elif action == 'add_version':
            await self._save_book_version(file_path, book_id, metadata, db)
            task.added_books += 1
        else:  # new_book
            await self._save_book(file_path, library_id, metadata, db)
            task.added_books += 1
    
    def _extract_metadata(self, file_path: Path) -> Optional[dict]:
        """提取元数据"""
        suffix = file_path.suffix.lower()
        
        try:
            if suffix == '.txt':
                return self.txt_parser.parse(file_path)
            elif suffix == '.epub':
                return self.epub_parser.parse(file_path)
            elif suffix in ['.mobi', '.azw3']:
                return self.mobi_parser.parse(file_path)
            else:
                return None
        except Exception as e:
            log.error(f"元数据提取失败: {file_path}, 错误: {e}")
            return None
    
    async def _save_book(self, file_path: Path, library_id: int, metadata: dict, db: AsyncSession):
        """保存新书籍"""
        # 获取或创建作者
        author_id = None
        if metadata.get("author"):
            author_id = await self._get_or_create_author(metadata["author"], db)
        
        # 创建书籍
        book = Book(
            library_id=library_id,
            title=metadata["title"],
            author_id=author_id,
            cover_path=metadata.get("cover"),
            description=metadata.get("description"),
            publisher=metadata.get("publisher"),
        )
        
        db.add(book)
        await db.flush()
        
        # 创建主版本
        file_hash = calculate_file_hash(file_path, settings.deduplicator.hash_algorithm)
        
        version = BookVersion(
            book_id=book.id,
            file_path=str(file_path.absolute().as_posix()),
            file_name=file_path.name,
            file_format=file_path.suffix.lower(),
            file_size=file_path.stat().st_size,
            file_hash=file_hash,
            quality=self._determine_quality(file_path),
            is_primary=True,
        )
        
        db.add(version)
    
    async def _save_book_version(self, file_path: Path, book_id: int, metadata: dict, db: AsyncSession):
        """为现有书籍添加新版本"""
        file_hash = calculate_file_hash(file_path, settings.deduplicator.hash_algorithm)
        
        # 检查是否已有主版本
        result = await db.execute(
            select(BookVersion)
            .where(BookVersion.book_id == book_id)
            .where(BookVersion.is_primary == True)
        )
        has_primary = result.scalar_one_or_none() is not None
        
        version = BookVersion(
            book_id=book_id,
            file_path=str(file_path.absolute().as_posix()),
            file_name=file_path.name,
            file_format=file_path.suffix.lower(),
            file_size=file_path.stat().st_size,
            file_hash=file_hash,
            quality=self._determine_quality(file_path),
            is_primary=not has_primary,
        )
        
        db.add(version)
    
    def _determine_quality(self, file_path: Path) -> str:
        """判断文件质量"""
        file_format = file_path.suffix.lower()
        file_size = file_path.stat().st_size
        
        format_quality = {
            '.epub': 'high',
            '.mobi': 'medium',
            '.azw3': 'high',
            '.txt': 'low',
        }
        
        base_quality = format_quality.get(file_format, 'medium')
        
        if file_format in ['.epub', '.mobi', '.azw3']:
            if file_size > 2 * 1024 * 1024:
                return 'high'
            elif file_size > 500 * 1024:
                return 'medium'
            else:
                return 'low'
        
        return base_quality
    
    async def _get_or_create_author(self, author_name: str, db: AsyncSession) -> int:
        """获取或创建作者"""
        result = await db.execute(
            select(Author).where(Author.name == author_name)
        )
        author = result.scalar_one_or_none()
        
        if author:
            author.book_count += 1
            return author.id
        
        author = Author(name=author_name, book_count=1)
        db.add(author)
        await db.flush()
        
        return author.id
    
    async def get_task_status(self, task_id: int) -> Optional[dict]:
        """
        获取任务状态
        
        Args:
            task_id: 任务ID
            
        Returns:
            任务状态字典
        """
        async with self.get_session() as db:
            task = await db.get(ScanTask, task_id)
            
            if not task:
                return None
            
            return {
                'id': task.id,
                'library_id': task.library_id,
                'status': task.status,
                'progress': task.progress,
                'total_files': task.total_files,
                'processed_files': task.processed_files,
                'added_books': task.added_books,
                'skipped_books': task.skipped_books,
                'error_count': task.error_count,
                'error_message': task.error_message,
                'started_at': task.started_at.isoformat() if task.started_at else None,
                'completed_at': task.completed_at.isoformat() if task.completed_at else None,
                'created_at': task.created_at.isoformat() if task.created_at else None,
            }
    
    async def cancel_task(self, task_id: int) -> bool:
        """
        取消扫描任务
        
        Args:
            task_id: 任务ID
            
        Returns:
            是否成功取消
        """
        async with self.get_session() as db:
            task = await db.get(ScanTask, task_id)
            
            if not task:
                return False
            
            if task.status == 'running':
                task.status = 'cancelled'
                task.completed_at = datetime.utcnow()
                await db.commit()
                return True
            
            return False


# 全局单例
_scanner = None

def get_background_scanner() -> BackgroundScanner:
    """获取后台扫描器单例"""
    global _scanner
    if _scanner is None:
        _scanner = BackgroundScanner()
    return _scanner
