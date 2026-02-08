"""
简易 i18n 工具（后端错误消息本地化）
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

DEFAULT_LOCALE = "zh-CN"
SUPPORTED_LOCALES = ("zh-CN", "zh-TW", "en", "ja", "ru", "ko")


MESSAGE_CATALOG: Dict[str, Dict[str, str]] = {
    "not_authenticated": {
        "zh-CN": "未认证",
        "zh-TW": "未認證",
        "en": "Not authenticated",
        "ja": "認証されていません",
        "ru": "Не авторизован",
        "ko": "인증되지 않았습니다",
    },
    "forbidden": {
        "zh-CN": "权限不足",
        "zh-TW": "權限不足",
        "en": "Forbidden",
        "ja": "権限がありません",
        "ru": "Недостаточно прав",
        "ko": "권한이 없습니다",
    },
    "not_found": {
        "zh-CN": "资源不存在",
        "zh-TW": "資源不存在",
        "en": "Not found",
        "ja": "見つかりません",
        "ru": "Не найдено",
        "ko": "찾을 수 없습니다",
    },
    "validation_error": {
        "zh-CN": "参数错误",
        "zh-TW": "參數錯誤",
        "en": "Validation error",
        "ja": "入力エラー",
        "ru": "Ошибка валидации",
        "ko": "검증 오류",
    },
    "rankings_disabled": {
        "zh-CN": "排行榜功能已关闭",
        "zh-TW": "排行榜功能已關閉",
        "en": "Rankings are disabled",
        "ja": "ランキング機能は無効です",
        "ru": "Рейтинг отключён",
        "ko": "랭킹 기능이 비활성화되었습니다",
    },
    "ratings_disabled": {
        "zh-CN": "评分功能已关闭",
        "zh-TW": "評分功能已關閉",
        "en": "Ratings are disabled",
        "ja": "評価機能は無効です",
        "ru": "Оценки отключены",
        "ko": "평점 기능이 비활성화되었습니다",
    },
    "internal_error": {
        "zh-CN": "服务器内部错误",
        "zh-TW": "伺服器內部錯誤",
        "en": "Internal server error",
        "ja": "サーバー内部エラー",
        "ru": "Внутренняя ошибка сервера",
        "ko": "서버 내부 오류",
    },
}


DETAIL_TO_KEY = {
    "Not authenticated": "not_authenticated",
    "Not Found": "not_found",
    "Forbidden": "forbidden",
    "排行榜功能已关闭": "rankings_disabled",
    "评分功能已关闭": "ratings_disabled",
}


def normalize_locale(lang: str) -> Optional[str]:
    if not lang:
        return None
    value = lang.replace("_", "-").lower()
    if value in ("*", ""):
        return None
    if value.startswith(("zh-hant", "zh-tw", "zh-hk", "zh-mo")):
        return "zh-TW"
    if value.startswith("zh"):
        return "zh-CN"
    if value.startswith("en"):
        return "en"
    if value.startswith("ja"):
        return "ja"
    if value.startswith("ru"):
        return "ru"
    if value.startswith("ko"):
        return "ko"
    return None


def parse_accept_language(header_value: Optional[str]) -> str:
    if not header_value:
        return DEFAULT_LOCALE
    candidates = []
    for part in header_value.split(","):
        item = part.strip()
        if not item:
            continue
        lang, *params = item.split(";")
        q = 1.0
        for param in params:
            param = param.strip()
            if param.startswith("q="):
                try:
                    q = float(param[2:])
                except ValueError:
                    q = 0.0
        candidates.append((q, lang.strip()))
    for _, lang in sorted(candidates, key=lambda x: x[0], reverse=True):
        normalized = normalize_locale(lang)
        if normalized:
            return normalized
    return DEFAULT_LOCALE


def translate_message(message_key: str, locale: str, params: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if not message_key:
        return None
    translations = MESSAGE_CATALOG.get(message_key, {})
    template = translations.get(locale) or translations.get("en")
    if not template:
        return None
    if params:
        try:
            return template.format(**params)
        except Exception:
            return template
    return template


def resolve_message_key(detail: Any) -> Tuple[Optional[str], Dict[str, Any], Optional[str]]:
    if isinstance(detail, dict):
        key = detail.get("message_key")
        params = detail.get("params") or {}
        fallback = detail.get("message") or detail.get("detail")
        return key, params, fallback if isinstance(fallback, str) else None
    if isinstance(detail, str):
        return DETAIL_TO_KEY.get(detail), {}, detail
    return None, {}, None

