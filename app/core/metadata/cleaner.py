import os
import re
from typing import Optional, Tuple


EXTENSIONS = (
    ".txt",
    ".epub",
    ".mobi",
    ".azw",
    ".azw3",
    ".pdf",
    ".cbz",
    ".cbr",
    ".zip",
    ".rar",
)

EXTRA_KEYWORDS = (
    "完结",
    "全本",
    "全集",
    "精校",
    "校对",
    "未删节",
    "无删减",
    "修订",
    "最终版",
    "典藏",
    "出版",
    "txt",
    "epub",
    "mobi",
    "azw",
    "azw3",
    "pdf",
    "kindle",
)

BRACKET_RE = re.compile(r"[\[【(（](.*?)[\]】)）]")
SIZE_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(kb|mb|gb|k|m|g|万字|千字|字)\b", re.IGNORECASE)
AUTHOR_PREFIX_RE = re.compile(r"^\s*(作者|author)\s*[:：]\s*", re.IGNORECASE)


def get_filename_stem(filename: Optional[str]) -> str:
    if not filename:
        return ""
    base = os.path.basename(filename).strip()
    if "." in base:
        base = base.rsplit(".", 1)[0]
    return base.strip()


def _strip_extensions(text: str) -> str:
    lowered = text.lower().strip()
    for ext in EXTENSIONS:
        if lowered.endswith(ext):
            text = text[: -len(ext)]
            break
    return text


def _strip_bracketed_extras(text: str) -> str:
    def _repl(match: re.Match) -> str:
        content = match.group(1).lower()
        if any(keyword in content for keyword in EXTRA_KEYWORDS):
            return " "
        return match.group(0)

    return BRACKET_RE.sub(_repl, text)


def _normalize_spaces(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -_·")


def clean_title(title: Optional[str]) -> Optional[str]:
    if not title:
        return None
    text = title.strip()
    text = _strip_bracketed_extras(text)
    text = SIZE_RE.sub(" ", text)
    text = _strip_extensions(text)
    text = _normalize_spaces(text)
    return text or None


def clean_author(author: Optional[str]) -> Optional[str]:
    if not author:
        return None
    text = author.strip()
    text = AUTHOR_PREFIX_RE.sub("", text)
    text = _strip_bracketed_extras(text)
    text = _strip_extensions(text)
    text = _normalize_spaces(text)
    return text or None


def split_title_author(filename_stem: str) -> Tuple[Optional[str], Optional[str]]:
    if not filename_stem:
        return None, None

    text = filename_stem.strip()
    match = re.search(r"(作者|author)\s*[:：]\s*([^\\/_-]+)", text, re.IGNORECASE)
    if match:
        title_part = text[: match.start()].strip(" -_·")
        return clean_title(title_part), clean_author(match.group(2))

    for sep in (" - ", " — ", " – ", "_", "-"):
        if sep in text:
            left, right = text.split(sep, 1)
            left = left.strip()
            right = right.strip()
            if left and right and len(right) <= 12 and not re.search(r"\d", right):
                return clean_title(left), clean_author(right)

    return clean_title(text), None
