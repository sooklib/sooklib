"""
备份与恢复管理模块
支持数据库、封面、配置文件的备份和恢复
"""
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import hashlib
from urllib.parse import quote

import aiosqlite
import httpx

from app.config import settings
from app.utils.logger import log


class BackupMetadata:
    """备份元数据"""
    def __init__(
        self,
        backup_id: str,
        created_at: datetime,
        description: str = "",
        includes: List[str] = None,
        file_size: int = 0,
        checksum: str = "",
        version: str = "1.0"
    ):
        self.backup_id = backup_id
        self.created_at = created_at
        self.description = description
        self.includes = includes or []
        self.file_size = file_size
        self.checksum = checksum
        self.version = version
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "backup_id": self.backup_id,
            "created_at": self.created_at.isoformat(),
            "description": self.description,
            "includes": self.includes,
            "file_size": self.file_size,
            "checksum": self.checksum,
            "version": self.version
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BackupMetadata":
        """从字典创建"""
        return cls(
            backup_id=data["backup_id"],
            created_at=datetime.fromisoformat(data["created_at"]),
            description=data.get("description", ""),
            includes=data.get("includes", []),
            file_size=data.get("file_size", 0),
            checksum=data.get("checksum", ""),
            version=data.get("version", "1.0")
        )


class BackupManager:
    """备份管理器"""
    
    def __init__(self):
        self.backup_dir = Path(settings.backup.backup_path)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        self.db_path = Path(settings.database.url.replace("sqlite+aiosqlite:///", ""))
        self.covers_dir = Path(settings.directories.covers)
        self.config_dir = Path("config")
    
    def _generate_backup_id(self) -> str:
        """生成备份ID"""
        return datetime.now().strftime("backup_%Y%m%d_%H%M%S")
    
    def _calculate_checksum(self, file_path: Path) -> str:
        """计算文件MD5校验和"""
        md5_hash = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                md5_hash.update(chunk)
        return md5_hash.hexdigest()

    def _webdav_join(self, base_url: str, path: str) -> str:
        base = base_url.rstrip("/")
        if not path:
            return base
        return f"{base}/{path.lstrip('/')}"

    def _webdav_encode_path(self, path: str) -> str:
        return "/".join(quote(part) for part in path.split("/") if part)

    async def _webdav_ensure_path(self, client: httpx.AsyncClient, base_url: str, remote_path: str):
        """确保 WebDAV 远端目录存在（逐级 MKCOL）"""
        if not remote_path:
            return
        parts = [p for p in remote_path.split("/") if p]
        current = base_url.rstrip("/")
        for part in parts:
            current = f"{current}/{quote(part)}"
            resp = await client.request("MKCOL", current)
            if resp.status_code in (200, 201, 204, 405):
                continue
            if resp.status_code == 409:
                raise RuntimeError(f"WebDAV 目录创建失败（父目录不存在）: {current}")
            raise RuntimeError(f"WebDAV 目录创建失败: {current}, status={resp.status_code}")

    async def _upload_to_webdav(self, backup_file: Path) -> Dict[str, Any]:
        """上传备份到 WebDAV"""
        if not settings.backup.webdav_enabled:
            return {"enabled": False}

        webdav_url = (settings.backup.webdav_url or "").strip()
        webdav_user = settings.backup.webdav_username
        webdav_pass = settings.backup.webdav_password
        if not webdav_url or not webdav_user or not webdav_pass:
            msg = "WebDAV 未配置完整（url/username/password）"
            log.error(msg)
            return {"enabled": True, "success": False, "error": msg}

        remote_base = (settings.backup.webdav_base_path or "").strip()
        remote_base = remote_base.lstrip("/")
        remote_rel = f"{remote_base}/{backup_file.name}" if remote_base else backup_file.name
        remote_rel = self._webdav_encode_path(remote_rel)
        target_url = self._webdav_join(webdav_url, remote_rel)

        timeout = settings.backup.webdav_timeout
        verify_ssl = settings.backup.webdav_verify_ssl

        try:
            async with httpx.AsyncClient(
                auth=(webdav_user, webdav_pass),
                timeout=timeout,
                verify=verify_ssl,
            ) as client:
                await self._webdav_ensure_path(client, webdav_url, remote_base)
                with open(backup_file, "rb") as f:
                    resp = await client.put(target_url, content=f)
                if resp.status_code not in (200, 201, 204):
                    raise RuntimeError(f"WebDAV 上传失败: status={resp.status_code}, body={resp.text[:200]}")

            log.info(f"WebDAV 上传完成: {target_url}")
            return {"enabled": True, "success": True, "url": target_url}
        except Exception as e:
            log.error(f"WebDAV 上传失败: {e}")
            return {"enabled": True, "success": False, "error": str(e)}
    
    async def create_backup(
        self,
        includes: List[str] = None,
        description: str = ""
    ) -> Dict[str, Any]:
        """
        创建备份
        
        Args:
            includes: 包含的内容列表 ["database", "covers", "config"]
            description: 备份描述
            
        Returns:
            备份信息字典
        """
        if includes is None:
            includes = settings.backup.default_includes
        
        backup_id = self._generate_backup_id()
        backup_file = self.backup_dir / f"{backup_id}.zip"
        
        log.info(f"开始创建备份: {backup_id}, 包含: {includes}")
        
        try:
            # 创建ZIP文件
            with zipfile.ZipFile(
                backup_file,
                'w',
                zipfile.ZIP_DEFLATED,
                compresslevel=settings.backup.compression_level
            ) as zipf:
                
                # 备份数据库
                if "database" in includes:
                    await self._backup_database(zipf)
                
                # 备份封面
                if "covers" in includes:
                    self._backup_covers(zipf)
                
                # 备份配置
                if "config" in includes:
                    self._backup_config(zipf)
                
                # 写入元数据
                metadata = BackupMetadata(
                    backup_id=backup_id,
                    created_at=datetime.now(),
                    description=description,
                    includes=includes
                )
                
                zipf.writestr(
                    "metadata.json",
                    json.dumps(metadata.to_dict(), indent=2, ensure_ascii=False)
                )
            
            # 计算校验和
            checksum = self._calculate_checksum(backup_file)
            file_size = backup_file.stat().st_size
            
            # 更新元数据
            metadata.checksum = checksum
            metadata.file_size = file_size
            
            log.info(
                f"备份创建成功: {backup_id}, "
                f"大小: {file_size / 1024 / 1024:.2f} MB, "
                f"校验和: {checksum}"
            )
            
            # 清理旧备份
            await self._cleanup_old_backups()
            
            webdav_result = await self._upload_to_webdav(backup_file)

            return {
                "success": True,
                "backup_id": backup_id,
                "file_path": str(backup_file),
                "file_size": file_size,
                "checksum": checksum,
                "includes": includes,
                "description": description,
                "webdav": webdav_result,
            }
            
        except Exception as e:
            log.error(f"创建备份失败: {e}")
            # 清理失败的备份文件
            if backup_file.exists():
                backup_file.unlink()
            raise
    
    async def _backup_database(self, zipf: zipfile.ZipFile):
        """备份数据库到ZIP"""
        if not self.db_path.exists():
            log.warning(f"数据库文件不存在: {self.db_path}")
            return
        
        # 使用 SQLite 备份 API（安全的在线备份）
        backup_db_path = self.backup_dir / "temp_backup.db"
        
        try:
            # 连接源数据库和备份数据库
            async with aiosqlite.connect(str(self.db_path)) as source:
                async with aiosqlite.connect(str(backup_db_path)) as backup:
                    # 执行备份
                    await source.backup(backup)
            
            # 添加到ZIP
            zipf.write(backup_db_path, "database/library.db")
            log.info("数据库备份完成")
            
        finally:
            # 清理临时文件
            if backup_db_path.exists():
                backup_db_path.unlink()
        
        # 备份 Alembic 版本信息
        alembic_dir = Path("alembic")
        if alembic_dir.exists():
            versions_dir = alembic_dir / "versions"
            if versions_dir.exists():
                for version_file in versions_dir.glob("*.py"):
                    zipf.write(
                        version_file,
                        f"database/alembic/versions/{version_file.name}"
                    )
    
    def _backup_covers(self, zipf: zipfile.ZipFile):
        """备份封面到ZIP"""
        if not self.covers_dir.exists():
            log.warning(f"封面目录不存在: {self.covers_dir}")
            return
        
        cover_count = 0
        for cover_file in self.covers_dir.rglob("*"):
            if cover_file.is_file():
                arcname = f"covers/{cover_file.relative_to(self.covers_dir)}"
                zipf.write(cover_file, arcname)
                cover_count += 1
        
        log.info(f"封面备份完成: {cover_count} 个文件")
    
    def _backup_config(self, zipf: zipfile.ZipFile):
        """备份配置到ZIP"""
        config_files = [
            "config/config.yaml",
            ".env.example"
        ]
        
        for config_file in config_files:
            config_path = Path(config_file)
            if config_path.exists():
                zipf.write(config_path, f"config/{config_path.name}")
                log.info(f"配置文件备份: {config_file}")
    
    async def list_backups(self) -> List[Dict[str, Any]]:
        """
        列出所有备份
        
        Returns:
            备份列表
        """
        backups = []
        
        for backup_file in sorted(self.backup_dir.glob("backup_*.zip"), reverse=True):
            try:
                with zipfile.ZipFile(backup_file, 'r') as zipf:
                    # 读取元数据
                    metadata_json = zipf.read("metadata.json").decode('utf-8')
                    metadata_dict = json.loads(metadata_json)
                    metadata = BackupMetadata.from_dict(metadata_dict)
                    
                    # 添加文件信息
                    file_size = backup_file.stat().st_size
                    
                    backups.append({
                        "backup_id": metadata.backup_id,
                        "file_name": backup_file.name,
                        "file_path": str(backup_file),
                        "file_size": file_size,
                        "file_size_mb": round(file_size / 1024 / 1024, 2),
                        "created_at": metadata.created_at.isoformat(),
                        "description": metadata.description,
                        "includes": metadata.includes,
                        "checksum": metadata.checksum
                    })
            except Exception as e:
                log.error(f"读取备份元数据失败: {backup_file}, 错误: {e}")
                continue
        
        return backups
    
    async def validate_backup(self, backup_id: str) -> Dict[str, Any]:
        """
        验证备份文件完整性
        
        Args:
            backup_id: 备份ID
            
        Returns:
            验证结果
        """
        backup_file = self.backup_dir / f"{backup_id}.zip"
        
        if not backup_file.exists():
            return {
                "valid": False,
                "error": "备份文件不存在"
            }
        
        try:
            # 检查ZIP文件完整性
            with zipfile.ZipFile(backup_file, 'r') as zipf:
                # 测试所有文件
                bad_file = zipf.testzip()
                if bad_file:
                    return {
                        "valid": False,
                        "error": f"ZIP文件损坏: {bad_file}"
                    }
                
                # 读取元数据
                metadata_json = zipf.read("metadata.json").decode('utf-8')
                metadata_dict = json.loads(metadata_json)
                metadata = BackupMetadata.from_dict(metadata_dict)
            
            # 验证校验和
            current_checksum = self._calculate_checksum(backup_file)
            if metadata.checksum and current_checksum != metadata.checksum:
                return {
                    "valid": False,
                    "error": "校验和不匹配",
                    "expected": metadata.checksum,
                    "actual": current_checksum
                }
            
            return {
                "valid": True,
                "backup_id": backup_id,
                "includes": metadata.includes,
                "file_size": backup_file.stat().st_size,
                "checksum": current_checksum
            }
            
        except Exception as e:
            return {
                "valid": False,
                "error": f"验证失败: {str(e)}"
            }
    
    async def restore_backup(
        self,
        backup_id: str,
        includes: List[str] = None,
        create_snapshot: bool = True
    ) -> Dict[str, Any]:
        """
        恢复备份
        
        Args:
            backup_id: 备份ID
            includes: 要恢复的内容，None表示全部
            create_snapshot: 是否在恢复前创建快照
            
        Returns:
            恢复结果
        """
        backup_file = self.backup_dir / f"{backup_id}.zip"
        
        if not backup_file.exists():
            raise FileNotFoundError(f"备份文件不存在: {backup_id}")
        
        # 验证备份
        validation = await self.validate_backup(backup_id)
        if not validation["valid"]:
            raise ValueError(f"备份验证失败: {validation.get('error')}")
        
        log.info(f"开始恢复备份: {backup_id}")
        
        snapshot_id = None
        try:
            # 创建当前状态快照
            if create_snapshot:
                snapshot = await self.create_backup(
                    description=f"恢复前快照 (before restore {backup_id})"
                )
                snapshot_id = snapshot["backup_id"]
                log.info(f"已创建快照: {snapshot_id}")
            
            # 解压备份文件
            with zipfile.ZipFile(backup_file, 'r') as zipf:
                # 读取元数据
                metadata_json = zipf.read("metadata.json").decode('utf-8')
                metadata_dict = json.loads(metadata_json)
                backup_includes = metadata_dict.get("includes", [])
                
                # 确定要恢复的内容
                if includes is None:
                    includes = backup_includes
                else:
                    # 只恢复备份中存在的内容
                    includes = [inc for inc in includes if inc in backup_includes]
                
                # 恢复数据库
                if "database" in includes:
                    await self._restore_database(zipf)
                
                # 恢复封面
                if "covers" in includes:
                    self._restore_covers(zipf)
                
                # 恢复配置
                if "config" in includes:
                    self._restore_config(zipf)
            
            log.info(f"备份恢复成功: {backup_id}")
            
            return {
                "success": True,
                "backup_id": backup_id,
                "restored": includes,
                "snapshot_id": snapshot_id
            }
            
        except Exception as e:
            log.error(f"恢复备份失败: {e}")
            
            # 如果创建了快照，提示可以回滚
            if snapshot_id:
                log.warning(f"可以使用快照回滚: {snapshot_id}")
            
            raise
    
    async def _restore_database(self, zipf: zipfile.ZipFile):
        """从ZIP恢复数据库"""
        try:
            # 提取数据库文件
            temp_db = self.backup_dir / "temp_restore.db"
            with zipf.open("database/library.db") as source:
                with open(temp_db, 'wb') as target:
                    shutil.copyfileobj(source, target)
            
            # 验证数据库文件
            try:
                async with aiosqlite.connect(str(temp_db)) as conn:
                    await conn.execute("SELECT 1")
            except Exception as e:
                raise ValueError(f"恢复的数据库文件无效: {e}")
            
            # 替换当前数据库（需要确保应用已停止或使用文件锁）
            if self.db_path.exists():
                backup_current = self.db_path.with_suffix('.db.old')
                shutil.copy2(self.db_path, backup_current)
                log.info(f"已备份当前数据库到: {backup_current}")
            
            shutil.move(str(temp_db), str(self.db_path))
            log.info("数据库恢复完成")
            
        except Exception as e:
            log.error(f"恢复数据库失败: {e}")
            raise
    
    def _restore_covers(self, zipf: zipfile.ZipFile):
        """从ZIP恢复封面"""
        # 清空现有封面（可选）
        # 这里选择覆盖模式，不删除现有文件
        
        cover_count = 0
        for file_info in zipf.filelist:
            if file_info.filename.startswith("covers/"):
                # 提取路径
                rel_path = file_info.filename[7:]  # 移除 "covers/" 前缀
                if not rel_path:
                    continue
                
                target_path = self.covers_dir / rel_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                
                with zipf.open(file_info) as source:
                    with open(target_path, 'wb') as target:
                        shutil.copyfileobj(source, target)
                
                cover_count += 1
        
        log.info(f"封面恢复完成: {cover_count} 个文件")
    
    def _restore_config(self, zipf: zipfile.ZipFile):
        """从ZIP恢复配置"""
        for file_info in zipf.filelist:
            if file_info.filename.startswith("config/"):
                file_name = file_info.filename.split("/")[-1]
                target_path = Path("config") / file_name
                target_path.parent.mkdir(parents=True, exist_ok=True)
                
                with zipf.open(file_info) as source:
                    with open(target_path, 'wb') as target:
                        shutil.copyfileobj(source, target)
                
                log.info(f"配置文件恢复: {file_name}")
    
    async def delete_backup(self, backup_id: str) -> bool:
        """
        删除备份文件
        
        Args:
            backup_id: 备份ID
            
        Returns:
            是否成功删除
        """
        backup_file = self.backup_dir / f"{backup_id}.zip"
        
        if not backup_file.exists():
            return False
        
        backup_file.unlink()
        log.info(f"已删除备份: {backup_id}")
        
        return True
    
    async def _cleanup_old_backups(self):
        """清理旧备份，保留指定数量"""
        retention_count = settings.backup.retention_count
        
        # 获取所有备份（按时间降序）
        backups = sorted(
            self.backup_dir.glob("backup_*.zip"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        
        # 删除超出保留数量的备份
        deleted_count = 0
        for old_backup in backups[retention_count:]:
            # 跳过快照备份（包含 "snapshot" 或 "before restore"）
            try:
                with zipfile.ZipFile(old_backup, 'r') as zipf:
                    metadata_json = zipf.read("metadata.json").decode('utf-8')
                    metadata = json.loads(metadata_json)
                    description = metadata.get("description", "").lower()
                    
                    if "snapshot" in description or "before restore" in description:
                        continue
            except:
                pass
            
            old_backup.unlink()
            deleted_count += 1
            log.info(f"清理旧备份: {old_backup.name}")
        
        if deleted_count > 0:
            log.info(f"已清理 {deleted_count} 个旧备份")
    
    async def get_backup_stats(self) -> Dict[str, Any]:
        """
        获取备份统计信息
        
        Returns:
            统计信息字典
        """
        backups = await self.list_backups()
        
        total_size = sum(b["file_size"] for b in backups)
        
        return {
            "total_backups": len(backups),
            "total_size": total_size,
            "total_size_mb": round(total_size / 1024 / 1024, 2),
            "backup_dir": str(self.backup_dir),
            "retention_count": settings.backup.retention_count,
            "auto_backup_enabled": settings.backup.auto_backup_enabled,
            "latest_backup": backups[0] if backups else None,
            "webdav": {
                "enabled": settings.backup.webdav_enabled,
                "url": settings.backup.webdav_url,
                "base_path": settings.backup.webdav_base_path,
                "verify_ssl": settings.backup.webdav_verify_ssl,
            },
        }


# 全局实例
backup_manager = BackupManager()
