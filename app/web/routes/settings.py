"""
系统设置 API 路由
"""
import json
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import User
from app.web.routes.admin import admin_required
from app.web.routes.auth import get_current_user
from app.utils.logger import log
from app.config import settings as app_settings
from app.core.kindle_settings import (
    DEFAULT_KINDLE_SETTINGS,
    load_kindle_settings,
    save_kindle_settings,
)

router = APIRouter()

# 设置文件路径
SETTINGS_FILE = Path("config/system_settings.json")
TELEGRAM_SETTINGS_FILE = Path("config/telegram_settings.json")

# 默认设置
DEFAULT_SETTINGS = {
    "server_name": "小说书库",
    "server_description": "个人小说管理系统",
    "welcome_message": "欢迎使用小说书库",
    "registration_enabled": False,
    "ratings_enabled": True,
    "rankings_enabled": True,
    "default_theme": "system",
    "default_cover_size": "medium",
    "chapter_max_title_length": 50,
    "chapter_min_gap": 40,
    "chapter_patterns_strong": [
        r'^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^Chapter\s+\d+.*$',
        r'^卷[零一二三四五六七八九十百千万亿\d]+.*$',
        r'^(序章|楔子|引子|前言|后记|尾声|番外|终章|大结局).*$',
        r'^[【\[\(].+[】\]\)]$',
    ],
    "chapter_patterns_weak": [
        r'^\d{1,4}[\.、]\s*.*$',
        r'^\d{1,4}\s+.*$',
    ],
    "chapter_inline_pattern": r'(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回][^\n]{0,40}',
}

# Telegram 默认设置
DEFAULT_TELEGRAM_SETTINGS = {
    "enabled": False,
    "bot_token": "",
    "webhook_url": "",
    "max_file_size": 20,  # MB
}


class KindleSettingsUpdate(BaseModel):
    """Kindle 邮件推送设置更新请求"""
    enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    max_attachment_mb: Optional[int] = None


def load_settings() -> dict:
    """加载系统设置"""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                # 合并默认设置和保存的设置
                return {**DEFAULT_SETTINGS, **saved}
        except Exception as e:
            log.error(f"加载系统设置失败: {e}")
    return DEFAULT_SETTINGS.copy()


def save_settings(settings: dict) -> bool:
    """保存系统设置"""
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log.error(f"保存系统设置失败: {e}")
        return False


class SettingsUpdate(BaseModel):
    """更新设置请求"""
    server_name: Optional[str] = None
    server_description: Optional[str] = None
    welcome_message: Optional[str] = None
    registration_enabled: Optional[bool] = None
    ratings_enabled: Optional[bool] = None
    rankings_enabled: Optional[bool] = None
    default_theme: Optional[str] = None
    default_cover_size: Optional[str] = None
    chapter_max_title_length: Optional[int] = None
    chapter_min_gap: Optional[int] = None
    chapter_patterns_strong: Optional[List[str]] = None
    chapter_patterns_weak: Optional[List[str]] = None
    chapter_inline_pattern: Optional[str] = None


class TelegramSettingsUpdate(BaseModel):
    """Telegram 设置更新请求"""
    enabled: Optional[bool] = None
    bot_token: Optional[str] = None
    webhook_url: Optional[str] = None
    max_file_size: Optional[int] = None


def load_telegram_settings() -> dict:
    """加载 Telegram 设置"""
    if TELEGRAM_SETTINGS_FILE.exists():
        try:
            with open(TELEGRAM_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                return {**DEFAULT_TELEGRAM_SETTINGS, **saved}
        except Exception as e:
            log.error(f"加载 Telegram 设置失败: {e}")
    return DEFAULT_TELEGRAM_SETTINGS.copy()


def save_telegram_settings(settings: dict) -> bool:
    """保存 Telegram 设置"""
    try:
        TELEGRAM_SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(TELEGRAM_SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log.error(f"保存 Telegram 设置失败: {e}")
        return False


@router.get("/settings/public")
async def get_public_settings():
    """
    获取公开系统设置（无需登录）
    只返回需要公开的设置如服务器名称
    """
    settings = load_settings()
    return {
        "server_name": settings.get("server_name", DEFAULT_SETTINGS["server_name"]),
        "server_description": settings.get("server_description", DEFAULT_SETTINGS["server_description"]),
        "welcome_message": settings.get("welcome_message", DEFAULT_SETTINGS["welcome_message"]),
        "registration_enabled": settings.get("registration_enabled", DEFAULT_SETTINGS["registration_enabled"]),
        "ratings_enabled": settings.get("ratings_enabled", DEFAULT_SETTINGS["ratings_enabled"]),
        "rankings_enabled": settings.get("rankings_enabled", DEFAULT_SETTINGS["rankings_enabled"]),
    }


@router.get("/settings")
async def get_settings(
    current_user: User = Depends(get_current_user)
):
    """
    获取系统设置（需要登录）
    普通用户只能获取部分设置
    """
    settings = load_settings()
    
    # 普通用户返回有限的设置
    return {
        "server_name": settings.get("server_name"),
        "server_description": settings.get("server_description"),
        "welcome_message": settings.get("welcome_message"),
        "default_theme": settings.get("default_theme"),
        "default_cover_size": settings.get("default_cover_size"),
        "ratings_enabled": settings.get("ratings_enabled", DEFAULT_SETTINGS["ratings_enabled"]),
        "rankings_enabled": settings.get("rankings_enabled", DEFAULT_SETTINGS["rankings_enabled"]),
    }


@router.get("/admin/settings")
async def get_admin_settings(
    admin: User = Depends(admin_required)
):
    """
    获取所有系统设置（管理员）
    """
    settings = load_settings()
    return settings


@router.put("/admin/settings")
async def update_settings(
    data: SettingsUpdate,
    admin: User = Depends(admin_required)
):
    """
    更新系统设置（管理员）
    """
    settings = load_settings()
    
    # 更新非空字段
    update_count = 0
    for key, value in data.dict().items():
        if value is not None:
            settings[key] = value
            update_count += 1
    
    if update_count == 0:
        raise HTTPException(status_code=400, detail="没有要更新的设置")
    
    if not save_settings(settings):
        raise HTTPException(status_code=500, detail="保存设置失败")
    
    log.info(f"管理员 {admin.username} 更新了系统设置: {list(data.dict(exclude_none=True).keys())}")
    
    return {
        "message": f"已更新 {update_count} 项设置",
        "settings": settings
    }


# ===== Telegram 设置 API =====

@router.get("/admin/telegram")
async def get_telegram_settings(
    admin: User = Depends(admin_required)
):
    """
    获取 Telegram Bot 设置（管理员）
    """
    settings = load_telegram_settings()
    # 不返回完整的 bot_token，只返回是否已配置
    return {
        "enabled": settings.get("enabled", False),
        "bot_token_configured": bool(settings.get("bot_token", "")),
        "bot_token_preview": settings.get("bot_token", "")[:10] + "..." if settings.get("bot_token") else "",
        "webhook_url": settings.get("webhook_url", ""),
        "max_file_size": settings.get("max_file_size", 20),
    }


@router.put("/admin/telegram")
async def update_telegram_settings(
    data: TelegramSettingsUpdate,
    admin: User = Depends(admin_required)
):
    """
    更新 Telegram Bot 设置（管理员）
    """
    settings = load_telegram_settings()
    
    # 更新非空字段
    update_count = 0
    for key, value in data.dict().items():
        if value is not None:
            settings[key] = value
            update_count += 1
    
    if update_count == 0:
        raise HTTPException(status_code=400, detail="没有要更新的设置")
    
    if not save_telegram_settings(settings):
        raise HTTPException(status_code=500, detail="保存设置失败")
    
    log.info(f"管理员 {admin.username} 更新了 Telegram 设置")
    
    return {
        "message": "Telegram 设置已更新",
        "enabled": settings.get("enabled", False),
        "bot_token_configured": bool(settings.get("bot_token", "")),
    }


@router.post("/admin/telegram/test")
async def test_telegram_connection(
    admin: User = Depends(admin_required)
):
    """
    测试 Telegram Bot 连接
    """
    settings = load_telegram_settings()
    bot_token = settings.get("bot_token", "")
    
    if not bot_token:
        raise HTTPException(status_code=400, detail="未配置 Bot Token")
    
    try:
        import httpx
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.telegram.org/bot{bot_token}/getMe",
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    bot_info = data.get("result", {})
                    return {
                        "success": True,
                        "bot_username": bot_info.get("username"),
                        "bot_name": bot_info.get("first_name"),
                    }
            
            return {
                "success": False,
                "error": "无效的 Bot Token"
            }
    except Exception as e:
        log.error(f"测试 Telegram 连接失败: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def _normalize_version(value: str) -> tuple[int, int, int, str]:
    if not value:
        return 0, 0, 0, ""
    version = value.strip().lstrip("v")
    base, _, suffix = version.partition("-")
    parts = base.split(".")
    try:
        major = int(parts[0]) if len(parts) > 0 else 0
    except ValueError:
        major = 0
    try:
        minor = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        minor = 0
    try:
        patch = int(parts[2]) if len(parts) > 2 else 0
    except ValueError:
        patch = 0
    return major, minor, patch, suffix


def _is_newer_version(current: str, latest: str) -> bool:
    current_tuple = _normalize_version(current)
    latest_tuple = _normalize_version(latest)
    if current_tuple[:3] != latest_tuple[:3]:
        return latest_tuple[:3] > current_tuple[:3]
    current_suffix = current_tuple[3]
    latest_suffix = latest_tuple[3]
    if current_suffix == latest_suffix:
        return False
    if not latest_suffix:
        return True
    if not current_suffix:
        return False
    return latest_suffix > current_suffix


def _beta_versions_equal(current: str, latest: str) -> bool:
    if not current or not latest:
        return False
    if current == latest:
        return True
    current_value = current
    latest_value = latest
    if current_value.startswith("beta-"):
        current_value = current_value[5:]
    if latest_value.startswith("beta-"):
        latest_value = latest_value[5:]
    return current_value.startswith(latest_value) or latest_value.startswith(current_value)


# ===== Kindle 设置 API =====

@router.get("/admin/kindle")
async def get_kindle_settings(
    admin: User = Depends(admin_required)
):
    """
    获取 Kindle 邮件推送设置（管理员）
    """
    settings = load_kindle_settings()
    return {
        "enabled": settings.get("enabled", False),
        "smtp_host": settings.get("smtp_host", ""),
        "smtp_port": settings.get("smtp_port", 587),
        "smtp_username": settings.get("smtp_username", ""),
        "smtp_password_configured": bool(settings.get("smtp_password")),
        "use_tls": settings.get("use_tls", True),
        "use_ssl": settings.get("use_ssl", False),
        "from_email": settings.get("from_email", ""),
        "from_name": settings.get("from_name", DEFAULT_KINDLE_SETTINGS.get("from_name", "")),
        "max_attachment_mb": settings.get("max_attachment_mb", 50),
    }


@router.put("/admin/kindle")
async def update_kindle_settings(
    data: KindleSettingsUpdate,
    admin: User = Depends(admin_required)
):
    """
    更新 Kindle 邮件推送设置（管理员）
    """
    settings = load_kindle_settings()
    update_count = 0
    for key, value in data.dict().items():
        if value is not None:
            settings[key] = value
            update_count += 1

    if update_count == 0:
        raise HTTPException(status_code=400, detail="没有要更新的设置")

    if not save_kindle_settings(settings):
        raise HTTPException(status_code=500, detail="保存设置失败")

    log.info(f"管理员 {admin.username} 更新了 Kindle 设置")

    return {
        "message": "Kindle 设置已更新",
        "enabled": settings.get("enabled", False),
        "smtp_password_configured": bool(settings.get("smtp_password")),
    }


@router.get("/version")
async def get_version_info():
    """获取当前版本信息"""
    return {
        "name": app_settings.release.name,
        "version": app_settings.release.version,
        "channel": app_settings.release.channel,
        "update_url": app_settings.release.update_url,
    }


@router.get("/update/check")
async def check_update():
    """检查是否有新版本"""
    update_url = app_settings.release.update_url
    current_version = app_settings.release.version
    channel = app_settings.release.channel

    if not update_url:
        return {
            "success": False,
            "error": "未配置更新地址",
            "current_version": current_version,
            "channel": channel,
        }

    try:
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.get(update_url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        log.error(f"更新检查失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "current_version": current_version,
            "channel": channel,
            "source": update_url,
        }

    channel_key = "beta" if channel == "beta" else "stable"
    latest_info = data.get(channel_key) or {}
    latest_version = str(latest_info.get("version", "") or "")

    update_available = False
    if latest_version:
        if channel_key == "stable":
            update_available = _is_newer_version(current_version, latest_version)
        else:
            update_available = not _beta_versions_equal(current_version, latest_version)

    return {
        "success": True,
        "current_version": current_version,
        "channel": channel,
        "latest_version": latest_version,
        "update_available": update_available,
        "url": latest_info.get("url") or latest_info.get("download_url"),
        "notes": latest_info.get("notes"),
        "published_at": latest_info.get("published_at"),
        "source": update_url,
    }
