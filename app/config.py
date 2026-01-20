"""
配置管理模块
加载 YAML 配置文件和环境变量
"""
import os
from pathlib import Path
from typing import Any, Dict, List

import yaml
from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    """服务器配置"""
    host: str = "0.0.0.0"
    port: int = 8080
    reload: bool = False


class DatabaseConfig(BaseModel):
    """数据库配置"""
    url: str = "sqlite+aiosqlite:///data/library.db"


class DirectoriesConfig(BaseModel):
    """目录配置"""
    data: str = "/app/data"
    covers: str = "/app/covers"
    temp: str = "/tmp/sooklib"


class ScannerConfig(BaseModel):
    """扫描器配置"""
    interval: int = 3600
    recursive: bool = True
    supported_formats: List[str] = Field(default_factory=lambda: [
        ".txt", ".epub", ".mobi", ".azw3",
        ".zip", ".rar", ".7z", ".iso", ".tar.gz", ".tar.bz2"
    ])


class ExtractorConfig(BaseModel):
    """解压器配置"""
    max_file_size: int = 524288000  # 500MB
    encoding: str = "utf-8"
    nested_depth: int = 3


class DeduplicatorConfig(BaseModel):
    """去重器配置"""
    enable: bool = True
    hash_algorithm: str = "md5"
    similarity_threshold: float = 0.85


class SecurityConfig(BaseModel):
    """安全配置"""
    secret_key: str = "CHANGE_THIS_TO_A_RANDOM_SECRET_KEY"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7天


class LoggingConfig(BaseModel):
    """日志配置"""
    level: str = "INFO"
    format: str = "json"
    max_size: int = 10485760  # 10MB
    backup_count: int = 5
    file: str = "/app/data/logs/app.log"


class OPDSConfig(BaseModel):
    """OPDS配置"""
    title: str = "我的小说书库"
    author: str = "Sooklib"
    description: str = "个人小说收藏"
    page_size: int = 50


class ReleaseConfig(BaseModel):
    """发布与更新配置"""
    name: str = "Sooklib"
    version: str = "1.0.0"
    channel: str = "beta"
    update_url: str = "https://raw.githubusercontent.com/Haruka041/sooklib-docs/main/update.json"


class RBACConfig(BaseModel):
    """权限控制配置"""
    default_age_rating: str = "all"  # 新用户默认年龄分级限制
    require_library_assignment: bool = True  # 新用户是否需要手动分配书库
    public_libraries_enabled: bool = True  # 是否允许公共书库


class CoverConfig(BaseModel):
    """封面配置"""
    quality: int = 85  # JPG 压缩质量 (1-100)
    max_width: int = 800  # 最大宽度（像素）
    max_height: int = 1200  # 最大高度（像素）
    thumbnail_width: int = 300  # 缩略图宽度（像素）
    thumbnail_height: int = 450  # 缩略图高度（像素）
    default_style: str = "gradient"  # 默认封面风格 (gradient/letter/book/minimal)
    cache_enabled: bool = True  # 是否启用缓存


class BackupConfig(BaseModel):
    """备份配置"""
    backup_path: str = "/app/data/backups"  # 备份文件保存路径
    retention_count: int = 7  # 保留备份数量
    auto_backup_enabled: bool = False  # 是否启用自动备份
    auto_backup_schedule: str = "0 2 * * *"  # Cron 表达式（默认每天凌晨2点）
    default_includes: List[str] = Field(default_factory=lambda: ["database", "covers", "config"])  # 默认备份内容
    compression_level: int = 6  # ZIP 压缩级别 (0-9)


class TelegramConfig(BaseModel):
    """Telegram Bot 配置"""
    enabled: bool = False  # 是否启用 Telegram Bot
    bot_token: str = ""  # Bot Token（从 @BotFather 获取）
    webhook_url: str = ""  # Webhook URL（可选，留空则使用轮询模式）
    webhook_path: str = "/webhook/telegram"  # Webhook 路径
    max_file_size: int = 20 * 1024 * 1024  # 最大文件大小（20MB，Telegram限制）
    bind_code_expiry: int = 300  # 绑定授权码过期时间（秒，默认5分钟）


class Config(BaseModel):
    """主配置类"""
    server: ServerConfig = Field(default_factory=ServerConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    directories: DirectoriesConfig = Field(default_factory=DirectoriesConfig)
    scanner: ScannerConfig = Field(default_factory=ScannerConfig)
    extractor: ExtractorConfig = Field(default_factory=ExtractorConfig)
    deduplicator: DeduplicatorConfig = Field(default_factory=DeduplicatorConfig)
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    opds: OPDSConfig = Field(default_factory=OPDSConfig)
    release: ReleaseConfig = Field(default_factory=ReleaseConfig)
    rbac: RBACConfig = Field(default_factory=RBACConfig)
    cover: CoverConfig = Field(default_factory=CoverConfig)
    backup: BackupConfig = Field(default_factory=BackupConfig)
    telegram: TelegramConfig = Field(default_factory=TelegramConfig)

    @classmethod
    def load(cls, config_path: str = "config/config.yaml") -> "Config":
        """
        加载配置文件
        
        Args:
            config_path: 配置文件路径
            
        Returns:
            Config实例
        """
        # 尝试加载YAML配置
        config_data: Dict[str, Any] = {}
        
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = yaml.safe_load(f) or {}
        
        # 环境变量覆盖
        if server_host := os.getenv("SERVER_HOST"):
            config_data.setdefault("server", {})["host"] = server_host
        if server_port := os.getenv("SERVER_PORT"):
            config_data.setdefault("server", {})["port"] = int(server_port)
        if db_url := os.getenv("DATABASE_URL"):
            config_data.setdefault("database", {})["url"] = db_url
        if secret_key := os.getenv("SECRET_KEY"):
            config_data.setdefault("security", {})["secret_key"] = secret_key
        if log_level := os.getenv("LOG_LEVEL"):
            config_data.setdefault("logging", {})["level"] = log_level
        if scan_interval := os.getenv("SCAN_INTERVAL"):
            config_data.setdefault("scanner", {})["interval"] = int(scan_interval)
        if app_name := os.getenv("APP_NAME"):
            config_data.setdefault("release", {})["name"] = app_name
        if app_version := os.getenv("APP_VERSION"):
            config_data.setdefault("release", {})["version"] = app_version
        if app_channel := os.getenv("APP_CHANNEL"):
            config_data.setdefault("release", {})["channel"] = app_channel
        if update_url := os.getenv("UPDATE_URL"):
            config_data.setdefault("release", {})["update_url"] = update_url
        
        return cls(**config_data)

    def ensure_directories(self):
        """确保所有必要的目录存在"""
        for dir_path in [self.directories.data, self.directories.covers, self.directories.temp]:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
        
        # 确保日志目录存在
        log_dir = Path(self.logging.file).parent
        log_dir.mkdir(parents=True, exist_ok=True)


# 全局配置实例
settings = Config.load()
