"""
Kindle 邮件推送设置
"""
import json
from pathlib import Path
from typing import Dict

from app.utils.logger import log

KINDLE_SETTINGS_FILE = Path("config/kindle_settings.json")

DEFAULT_KINDLE_SETTINGS: Dict[str, object] = {
    "enabled": False,
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_username": "",
    "smtp_password": "",
    "use_tls": True,
    "use_ssl": False,
    "from_email": "",
    "from_name": "Sooklib",
    "max_attachment_mb": 50,
}


def load_kindle_settings() -> dict:
    """加载 Kindle 邮件推送设置"""
    if KINDLE_SETTINGS_FILE.exists():
        try:
            with open(KINDLE_SETTINGS_FILE, "r", encoding="utf-8") as file:
                saved = json.load(file)
                return {**DEFAULT_KINDLE_SETTINGS, **saved}
        except Exception as exc:
            log.error(f"加载 Kindle 设置失败: {exc}")
    return DEFAULT_KINDLE_SETTINGS.copy()


def save_kindle_settings(settings: dict) -> bool:
    """保存 Kindle 邮件推送设置"""
    try:
        KINDLE_SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(KINDLE_SETTINGS_FILE, "w", encoding="utf-8") as file:
            json.dump(settings, file, ensure_ascii=False, indent=2)
        return True
    except Exception as exc:
        log.error(f"保存 Kindle 设置失败: {exc}")
        return False
