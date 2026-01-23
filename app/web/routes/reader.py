"""
阅读器路由
提供在线阅读功能
"""
import os
import json
import codecs
import re
import math
from pathlib import Path
from typing import Optional
import multiprocessing

from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, User, BookVersion
from app.web.routes.auth import get_current_user
from app.web.routes.dependencies import get_accessible_book
from app.security import decode_access_token
from app.utils.permissions import check_book_access
from app.utils.logger import log
from app.config import settings
from app.core.metadata.comic_parser import ComicParser
from app.core.metadata.txt_parser import TxtParser
from app.core.metadata.mobi_parser import MobiParser, extract_text_in_subprocess
from app.core.conversion.ebook_convert import (
    request_conversion,
    get_conversion_status,
    get_cached_conversion_path,
    is_conversion_supported
)
from io import BytesIO
import hashlib

router = APIRouter()

# 实例化全局解析器
txt_parser = TxtParser()
mobi_parser = MobiParser()

# 大文件阈值：500KB
LARGE_FILE_THRESHOLD = 500 * 1024
# 每页字符数
CHARS_PER_PAGE = 50000
TXT_STREAM_CHUNK_SIZE = 512 * 1024
TXT_MAX_CHAPTER_BYTES = 2 * 1024 * 1024
TXT_FALLBACK_CHUNK_BYTES = 512 * 1024
TXT_MAX_LINE_BUFFER_CHARS = 2 * 1024 * 1024
TXT_LONG_LINE_FLUSH_CHARS = 256 * 1024
TXT_BINARY_STRICT_MAX_BYTES = 5 * 1024 * 1024

# MOBI 提取上限，防止异常文件导致崩溃/内存暴涨
MOBI_MAX_TEXT_CHARS = 5_000_000
MOBI_MAX_FILE_BYTES = 200 * 1024 * 1024
MOBI_MAX_HTML_BYTES = 2 * 1024 * 1024
MOBI_EXTRACT_TIMEOUT_SECONDS = 30
MOBI_EXTRACT_MEMORY_LIMIT_MB = 512
MOBI_TEXT_LENGTH_LIMIT = 5_000_000

# TXT 缓存目录
TXT_CACHE_DIR = Path(settings.directories.data) / "cache" / "txt"


class ConvertRequest(BaseModel):
    target_format: str = "epub"
    force: bool = False


@router.get("/books/{book_id}/toc")
async def get_book_toc(
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍目录（完整目录，不返回内容）
    对于大TXT文件，解析全书章节后返回目录信息
    """
    from sqlalchemy.orm import selectinload
    import re
    
    await db.refresh(book, ['versions'])
    
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    file_format = version.file_format.lower()
    
    if file_format not in ['txt', '.txt']:
        raise HTTPException(status_code=400, detail="仅支持TXT在线阅读，请下载原文件")

    cache = await _ensure_txt_cache(file_path)
    if not cache:
        raise HTTPException(status_code=500, detail="无法读取文件内容")
    index = cache["index"]
    total_length = index.get("total_length", 0)
    chapters = index.get("chapters", [])

    return {
        "format": "txt",
        "totalLength": total_length,
        "chapters": chapters,
        "charsPerPage": CHARS_PER_PAGE,
        "totalPages": (total_length + CHARS_PER_PAGE - 1) // CHARS_PER_PAGE
    }




@router.get("/books/{book_id}/chapter/{chapter_index}")
async def get_chapter_content(
    chapter_index: int,
    buffer: int = Query(1, ge=0, le=3, description="前后缓冲章节数"),
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取指定章节及前后缓冲章节的内容
    
    参数:
    - chapter_index: 章节索引（从0开始）
    - buffer: 前后各加载多少章作为缓冲（默认1，即加载前后各1章）
    
    返回:
    - chapters: 章节内容列表（包含当前章节及缓冲章节）
    - currentIndex: 当前章节在返回列表中的索引
    - totalChapters: 全书总章节数
    """
    from sqlalchemy.orm import selectinload
    
    await db.refresh(book, ['versions'])
    
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    file_format = version.file_format.lower()
    
    if file_format not in ['txt', '.txt']:
        raise HTTPException(status_code=400, detail="仅支持TXT在线阅读，请下载原文件")

    cache = await _ensure_txt_cache(file_path)
    if not cache:
        log.error(f"无法读取文件内容: {file_path}")
        raise HTTPException(status_code=500, detail="无法读取文件内容")
    index = cache["index"]
    all_chapters = index.get("chapters", [])
    total_length = index.get("total_length", 0)

    total_chapters = len(all_chapters)
    
    log.info(f"解析到 {total_chapters} 个章节，请求索引: {chapter_index}")

    if chapter_index < 0 or chapter_index >= total_chapters:
        log.error(f"章节索引超出范围: {chapter_index}, 总章节数: {total_chapters}")
        raise HTTPException(status_code=400, detail=f"章节索引超出范围，有效范围: 0-{total_chapters-1}")
    
    # 计算加载范围（当前章节 ± buffer）
    start_index = max(0, chapter_index - buffer)
    end_index = min(total_chapters, chapter_index + buffer + 1)
    
    # 提取章节内容
    result_chapters = []
    for i in range(start_index, end_index):
        ch = all_chapters[i]
        chapter_content = _read_txt_range(
            cache["text_path"],
            ch.get("startByte", 0),
            ch.get("endByte", 0)
        )
        # 移除章节标题（因为会单独显示）
        chapter_content = chapter_content.replace(ch["title"], "", 1).strip()
        result_chapters.append({
            "index": i,
            "title": ch["title"],
            "content": chapter_content,
            "startOffset": ch["startOffset"],
            "endOffset": ch["endOffset"]
        })
    
    # 当前章节在返回列表中的位置
    current_index_in_result = chapter_index - start_index
    
    return {
        "format": "txt",
        "chapters": result_chapters,
        "currentIndex": current_index_in_result,
        "requestedChapterIndex": chapter_index,
        "totalChapters": total_chapters,
        "totalLength": total_length,
        "loadedRange": {
            "start": start_index,
            "end": end_index - 1
        }
    }


async def _get_mobi_text(file_path: Path) -> Optional[str]:
    """获取MOBI/AZW3文件的文本内容（带缓存）"""
    try:
        # 确保缓存目录存在
        cache_dir = Path(settings.directories.data) / "cache" / "mobi_txt"
        cache_dir.mkdir(parents=True, exist_ok=True)
        
        # 计算文件哈希作为缓存文件名
        file_stat = file_path.stat()
        file_hash_str = f"{file_path.name}_{file_stat.st_size}_{file_stat.st_mtime}"
        cache_filename = hashlib.md5(file_hash_str.encode()).hexdigest() + ".txt"
        cache_path = cache_dir / cache_filename
        
        # 检查失败标记，避免反复触发崩溃
        fail_marker = cache_dir / f"{cache_filename}.fail"
        if fail_marker.exists():
            log.warning(f"MOBI提取已标记失败，跳过: {file_path.name}")
            return None

        # 预估文本长度，疑似超大则直接拒绝（防止 zip bomb）
        estimated_length = _estimate_mobi_text_length(file_path)
        if estimated_length and estimated_length > MOBI_TEXT_LENGTH_LIMIT:
            log.warning(
                f"MOBI文本长度过大，拒绝提取: {file_path.name}, "
                f"estimate={estimated_length}"
            )
            try:
                fail_marker.touch(exist_ok=True)
            except Exception:
                pass
            return None

        # 检查缓存
        if cache_path.exists():
            log.debug(f"使用MOBI文本缓存: {file_path.name}")
            cached_content = await _read_txt_file(cache_path)
            if cached_content and cached_content.strip():
                return cached_content
            else:
                # 缓存文件为空，删除并重新提取
                log.warning(f"缓存文件为空，重新提取: {file_path.name}")
                cache_path.unlink()
            
        # 提取文本
        log.info(f"提取MOBI文本: {file_path.name}")
        # 在独立子进程中运行提取，避免异常文件导致主进程崩溃
        import asyncio
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(None, _extract_mobi_with_limits, file_path)
        
        if content and content.strip():
            # 清理内容
            content = _clean_txt_content(content)
            # 写入缓存
            with open(cache_path, 'w', encoding='utf-8') as f:
                f.write(content)
            if fail_marker.exists():
                try:
                    fail_marker.unlink()
                except Exception:
                    pass
            log.info(f"MOBI文本提取成功并缓存: {file_path.name}, {len(content)} 字符")
            return content
        else:
            log.error(f"MOBI文本提取结果为空: {file_path.name}")
            try:
                fail_marker.touch(exist_ok=True)
            except Exception:
                pass
            return None
            
    except Exception as e:
        log.error(f"获取MOBI文本失败: {file_path}, 错误: {e}", exc_info=True)
        try:
            cache_dir = Path(settings.directories.data) / "cache" / "mobi_txt"
            cache_dir.mkdir(parents=True, exist_ok=True)
            file_stat = file_path.stat()
            file_hash_str = f"{file_path.name}_{file_stat.st_size}_{file_stat.st_mtime}"
            cache_filename = hashlib.md5(file_hash_str.encode()).hexdigest() + ".txt"
            fail_marker = cache_dir / f"{cache_filename}.fail"
            fail_marker.touch(exist_ok=True)
        except Exception:
            pass
        return None


def _estimate_mobi_text_length(file_path: Path) -> Optional[int]:
    """快速估算 MOBI 文本长度，避免异常压缩导致资源耗尽"""
    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)
        if len(header) < 12:
            return None
        text_length = int.from_bytes(header[4:8], 'big')
        record_count = int.from_bytes(header[8:10], 'big')
        record_size = int.from_bytes(header[10:12], 'big')
        estimated = max(text_length, record_count * record_size)
        return estimated if estimated > 0 else None
    except Exception as e:
        log.debug(f"估算MOBI文本长度失败: {file_path}, 错误: {e}")
        return None


def _mobi_extract_worker(path: str, queue: "multiprocessing.Queue"):
    try:
        import resource
        if MOBI_EXTRACT_MEMORY_LIMIT_MB:
            limit = MOBI_EXTRACT_MEMORY_LIMIT_MB * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        resource.setrlimit(resource.RLIMIT_CPU, (MOBI_EXTRACT_TIMEOUT_SECONDS, MOBI_EXTRACT_TIMEOUT_SECONDS))
    except Exception:
        pass

    try:
        content = extract_text_in_subprocess(
            path,
            MOBI_MAX_TEXT_CHARS,
            MOBI_MAX_FILE_BYTES,
            MOBI_MAX_HTML_BYTES
        )
        queue.put({"ok": True, "content": content})
    except Exception as e:
        queue.put({"ok": False, "error": str(e)})


def _extract_mobi_with_limits(file_path: Path) -> Optional[str]:
    """带超时/内存限制的 MOBI 提取（同步）"""
    ctx = multiprocessing.get_context("spawn")
    result_queue: multiprocessing.Queue = ctx.Queue(maxsize=1)

    process = ctx.Process(
        target=_mobi_extract_worker,
        args=(str(file_path), result_queue),
        daemon=True
    )
    process.start()
    process.join(MOBI_EXTRACT_TIMEOUT_SECONDS)

    if process.is_alive():
        process.terminate()
        process.join(2)
        log.warning(f"MOBI提取超时已终止: {file_path.name}")
        return None

    if result_queue.empty():
        log.warning(f"MOBI提取无结果: {file_path.name}")
        return None

    result = result_queue.get()
    if result.get("ok"):
        return result.get("content")
    log.warning(f"MOBI提取失败: {file_path.name}, 错误: {result.get('error')}")
    return None


def _detect_txt_encoding(file_path: Path) -> Optional[str]:
    """检测 TXT 编码，仅返回编码名"""
    import chardet

    try:
        with open(file_path, 'rb') as f:
            raw_data = f.read(200000)
    except Exception as e:
        log.error(f"读取编码检测样本失败: {e}")
        return None

    if not raw_data:
        return None

    if raw_data.startswith(codecs.BOM_UTF8):
        return "utf-8-sig"
    if raw_data.startswith(b'\xff\xfe'):
        return "utf-16-le"
    if raw_data.startswith(b'\xfe\xff'):
        return "utf-16-be"

    candidates = [
        'utf-8', 'utf-8-sig',
        'gb18030', 'gbk', 'gb2312',
        'big5',
        'utf-16-le', 'utf-16-be',
    ]
    metrics = []
    for encoding in candidates:
        try:
            quality, cjk_ratio, ascii_ratio = _sample_text_metrics(raw_data, encoding)
        except Exception:
            continue
        readable_ratio = cjk_ratio + ascii_ratio
        metrics.append((encoding, quality, readable_ratio))

    if metrics:
        preferred = [m for m in metrics if m[2] >= 0.05]
        pool = preferred or metrics
        pool.sort(key=lambda m: (m[1], -m[2]))
        return pool[0][0]

    detected = chardet.detect(raw_data).get('encoding')
    if not detected:
        return None

    detected_lower = detected.lower()
    if detected_lower in ('utf-16', 'utf_16'):
        even_nulls = sum(1 for i in range(0, len(raw_data), 2) if raw_data[i] == 0)
        odd_nulls = sum(1 for i in range(1, len(raw_data), 2) if raw_data[i] == 0)
        if odd_nulls > even_nulls:
            return "utf-16-le"
        if even_nulls > odd_nulls:
            return "utf-16-be"
        return None
    if detected_lower in ('utf-16le', 'utf_16le'):
        return "utf-16-le"
    if detected_lower in ('utf-16be', 'utf_16be'):
        return "utf-16-be"

    return detected


def _sample_text_metrics(raw_data: bytes, encoding: str) -> tuple[float, float, float]:
    decoded = raw_data.decode(encoding, errors='replace')
    if not decoded:
        return 1.0, 0.0, 0.0
    total = len(decoded)
    replacement = decoded.count('\ufffd')
    control = sum(1 for ch in decoded if ord(ch) < 32 and ch not in '\t\n\r')
    quality = (replacement + control) / total
    cjk = sum(1 for ch in decoded if '\u4e00' <= ch <= '\u9fff') / total
    ascii_letters = sum(1 for ch in decoded if ch.isascii() and ch.isalpha()) / total
    return quality, cjk, ascii_letters


def _is_text_sample_valid(file_path: Path, encoding: str) -> bool:
    try:
        with open(file_path, 'rb') as f:
            raw_data = f.read(200000)
    except Exception:
        return False
    quality, cjk_ratio, ascii_ratio = _sample_text_metrics(raw_data, encoding)
    readable_ratio = cjk_ratio + ascii_ratio
    return (quality <= 0.25 and readable_ratio >= 0.03) or readable_ratio >= 0.15


async def _read_txt_file_with_encoding(file_path: Path) -> tuple[Optional[str], Optional[str]]:
    """读取TXT文件内容（支持多种编码和自动检测），返回(内容, 编码)"""
    log.debug(f"开始读取TXT文件: {file_path}")

    if not file_path.exists():
        log.error(f"文件不存在: {file_path}")
        return None, None

    if _is_probably_binary_file(file_path):
        file_size = file_path.stat().st_size
        if file_size > TXT_BINARY_STRICT_MAX_BYTES and file_path.suffix.lower() == ".txt":
            log.warning(f"疑似二进制特征但文件较大，继续尝试按TXT读取: {file_path.name}")
        else:
            log.error(f"疑似二进制文件，拒绝按TXT读取: {file_path}")
            raise HTTPException(status_code=415, detail="疑似非文本文件，可能扩展名错误或文件损坏")

    encoding = _detect_txt_encoding(file_path)
    if not encoding:
        log.error(f"无法识别编码: {file_path}")
        return None, None

    def decode_quality(text: str) -> float:
        if not text:
            return 1.0
        total = len(text)
        replacement = text.count('\ufffd')
        control = sum(1 for ch in text if ord(ch) < 32 and ch not in '\t\n\r')
        return (replacement + control) / total

    try:
        with open(file_path, 'r', encoding=encoding, errors='replace') as f:
            content = f.read()
        if decode_quality(content[:10000]) > 0.2:
            log.warning(f"编码 {encoding} 读取质量较差: {file_path.name}")
        log.debug(f"使用编码 {encoding} 读取文件: {file_path.name}")
        return _clean_txt_content(content), encoding
    except Exception as e:
        log.error(f"使用编码 {encoding} 读取失败: {e}")
        return None, None


async def _read_txt_file(file_path: Path) -> Optional[str]:
    """读取TXT文件内容（支持多种编码和自动检测）"""
    content, _encoding = await _read_txt_file_with_encoding(file_path)
    return content


def _get_txt_cache_paths(file_path: Path) -> tuple[Path, Path, Path, str]:
    TXT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stat = file_path.stat()
    key = f"{file_path.name}_{stat.st_size}_{stat.st_mtime}"
    cache_key = hashlib.md5(key.encode()).hexdigest()
    text_path = TXT_CACHE_DIR / f"{cache_key}.utf8.txt"
    index_path = TXT_CACHE_DIR / f"{cache_key}.index.json"
    fail_marker = TXT_CACHE_DIR / f"{cache_key}.fail"
    return text_path, index_path, fail_marker, cache_key


def _load_txt_index(index_path: Path) -> Optional[dict]:
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"读取TXT索引失败: {index_path.name}, 错误: {e}")
        return None


def _write_txt_index(index_path: Path, data: dict) -> None:
    tmp_path = index_path.with_suffix('.tmp')
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=True)
        tmp_path.replace(index_path)
    except Exception as e:
        log.warning(f"写入TXT索引失败: {index_path.name}, 错误: {e}")
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass


def _read_txt_range(text_path: Path, start_byte: int, end_byte: int) -> str:
    with open(text_path, 'rb') as f:
        f.seek(max(0, start_byte))
        chunk = f.read(max(0, end_byte - start_byte))
    return chunk.decode('utf-8', errors='replace')


def _clean_txt_line(line: str) -> str:
    """按行清理 TXT 内容，减少零宽字符干扰"""
    line = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', line)
    return line.rstrip()


def _detect_chapter_candidates(
    raw_line: str,
    start_offset: int,
    start_byte: int,
    prev_blank: bool,
    next_blank: bool,
) -> list:
    """基于单行判断是否为章节标题"""
    import re

    max_title_len = 50
    strong_patterns = [
        r'^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^Chapter\s+\d+.*$',
        r'^卷[零一二三四五六七八九十百千万亿\d]+.*$',
        r'^(序章|楔子|引子|前言|后记|尾声|番外|终章|大结局).*$',
        r'^[【\[\(].+[】\]\)]$',
    ]
    weak_patterns = [
        r'^\d{1,4}[\.、]\s*.*$',
        r'^\d{1,4}\s+.*$',
    ]
    inline_strong = re.compile(
        r'(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回][^\n]{0,40}',
        re.IGNORECASE
    )

    line = raw_line.strip()
    if not line:
        return []

    has_blank_neighbor = prev_blank or next_blank
    is_body_only = line in ('正文', '正文：', '正文:')
    candidates = []
    strong_regexes = [re.compile(p, re.IGNORECASE) for p in strong_patterns]
    weak_regexes = [re.compile(p, re.IGNORECASE) for p in weak_patterns]

    if len(line) <= max_title_len:
        for pattern in strong_regexes:
            if pattern.match(line):
                candidates.append({
                    "title": line,
                    "startOffset": start_offset,
                    "startByte": start_byte,
                    "strength": 3,
                    "is_body_only": is_body_only
                })
                return candidates

    if len(line) <= max_title_len and has_blank_neighbor:
        for pattern in weak_regexes:
            if pattern.match(line):
                candidates.append({
                    "title": line,
                    "startOffset": start_offset,
                    "startByte": start_byte,
                    "strength": 1,
                    "is_body_only": is_body_only
                })
                return candidates

    match = inline_strong.search(raw_line)
    if match:
        title = match.group().strip()
        if len(title) <= max_title_len:
            byte_offset = start_byte + len(raw_line[:match.start()].encode('utf-8'))
            candidates.append({
                "title": title,
                "startOffset": start_offset + match.start(),
                "startByte": byte_offset,
                "strength": 2,
                "is_body_only": False
            })

    return candidates


def _finalize_chapters(
    candidates: list,
    total_length: int,
    total_bytes: int
) -> list:
    """整理候选章节并补齐 endOffset/endByte"""
    min_gap = 40
    if not candidates:
        chapters = []
        if total_bytes <= 0:
            return [{
                "title": "全文",
                "startOffset": 0,
                "endOffset": total_length,
                "startByte": 0,
                "endByte": total_bytes
            }]
        avg_bytes = total_bytes / max(1, total_length)
        chunk_count = math.ceil(total_bytes / TXT_FALLBACK_CHUNK_BYTES)
        for idx in range(chunk_count):
            start_byte = idx * TXT_FALLBACK_CHUNK_BYTES
            end_byte = min(total_bytes, start_byte + TXT_FALLBACK_CHUNK_BYTES)
            start_offset = int(start_byte / avg_bytes)
            end_offset = int(end_byte / avg_bytes)
            chapters.append({
                "title": f"正文 {idx + 1}/{chunk_count}",
                "startOffset": start_offset,
                "endOffset": end_offset,
                "startByte": start_byte,
                "endByte": end_byte
            })
        return chapters

    candidates.sort(key=lambda x: x["startOffset"])
    filtered = []
    for cand in candidates:
        if filtered and cand["startOffset"] - filtered[-1]["startOffset"] <= min_gap:
            if cand["strength"] > filtered[-1]["strength"]:
                filtered[-1] = cand
            continue
        filtered.append(cand)

    if any(not c.get("is_body_only") for c in filtered):
        filtered = [c for c in filtered if not c.get("is_body_only")]

    chapters = []
    for i, match in enumerate(filtered):
        next_match = filtered[i + 1] if i < len(filtered) - 1 else None
        end_offset = next_match["startOffset"] if next_match else total_length
        end_byte = next_match["startByte"] if next_match else total_bytes
        chapters.append({
            "title": match["title"],
            "startOffset": match["startOffset"],
            "endOffset": end_offset,
            "startByte": match["startByte"],
            "endByte": end_byte
        })

    if filtered and filtered[0]["startOffset"] > 100:
        chapters.insert(0, {
            "title": "序",
            "startOffset": 0,
            "endOffset": filtered[0]["startOffset"],
            "startByte": 0,
            "endByte": filtered[0]["startByte"]
        })

    if not chapters:
        return chapters

    avg_bytes = total_bytes / max(1, total_length)
    expanded = []
    for chapter in chapters:
        start_byte = chapter["startByte"]
        end_byte = chapter["endByte"]
        size = end_byte - start_byte
        if size <= TXT_MAX_CHAPTER_BYTES:
            expanded.append(chapter)
            continue
        parts = max(1, math.ceil(size / TXT_MAX_CHAPTER_BYTES))
        for idx in range(parts):
            part_start = start_byte + idx * TXT_MAX_CHAPTER_BYTES
            part_end = min(end_byte, part_start + TXT_MAX_CHAPTER_BYTES)
            part_start_offset = int(part_start / avg_bytes)
            part_end_offset = int(part_end / avg_bytes)
            expanded.append({
                "title": f"{chapter['title']} ({idx + 1}/{parts})",
                "startOffset": part_start_offset,
                "endOffset": part_end_offset,
                "startByte": part_start,
                "endByte": part_end
            })

    return expanded


def _build_txt_cache_streaming(
    file_path: Path,
    text_path: Path,
    index_path: Path,
    encoding: str,
) -> Optional[dict]:
    """流式构建 TXT UTF-8 缓存与章节索引"""
    tmp_text_path = text_path.with_suffix('.tmp')
    decoder = codecs.getincrementaldecoder(encoding)(errors='replace')
    buffer = ""
    pending_cr = False
    total_length = 0
    total_bytes = 0
    candidates = []
    prev_line = None
    prev_start_offset = 0
    prev_start_byte = 0
    prev_blank = True

    try:
        with open(file_path, 'rb') as src, open(tmp_text_path, 'wb') as dst:
            def flush_long_segment(segment: str) -> None:
                nonlocal total_length, total_bytes, prev_line, prev_blank, prev_start_offset, prev_start_byte
                if not segment:
                    return
                line = _clean_txt_line(segment)
                if not line:
                    return
                line_start_offset = total_length
                line_start_byte = total_bytes
                line_bytes = line.encode('utf-8')
                dst.write(line_bytes)
                total_length += len(line)
                total_bytes += len(line_bytes)
                prev_line = None
                prev_blank = False
                prev_start_offset = line_start_offset
                prev_start_byte = line_start_byte

            while True:
                chunk = src.read(TXT_STREAM_CHUNK_SIZE)
                if not chunk:
                    break
                decoded = decoder.decode(chunk)
                if not decoded:
                    continue
                if pending_cr:
                    if decoded.startswith('\n'):
                        decoded = decoded[1:]
                    decoded = '\n' + decoded
                    pending_cr = False
                decoded = decoded.replace('\r\n', '\n')
                if decoded.endswith('\r'):
                    pending_cr = True
                    decoded = decoded[:-1]
                decoded = decoded.replace('\r', '\n')
                buffer += decoded

                while '\n' not in buffer and len(buffer) > TXT_MAX_LINE_BUFFER_CHARS:
                    flush_part = buffer[:TXT_LONG_LINE_FLUSH_CHARS]
                    buffer = buffer[TXT_LONG_LINE_FLUSH_CHARS:]
                    flush_long_segment(flush_part)

                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    line = _clean_txt_line(line)
                    line_blank = not line.strip()
                    if prev_line is not None:
                        candidates.extend(
                            _detect_chapter_candidates(
                                prev_line,
                                prev_start_offset,
                                prev_start_byte,
                                prev_blank,
                                line_blank
                            )
                        )
                        prev_blank = not prev_line.strip()

                    line_start_offset = total_length
                    line_start_byte = total_bytes
                    line_bytes = (line + '\n').encode('utf-8')
                    dst.write(line_bytes)
                    total_length += len(line) + 1
                    total_bytes += len(line_bytes)

                    prev_line = line
                    prev_start_offset = line_start_offset
                    prev_start_byte = line_start_byte

            decoded = decoder.decode(b'', final=True)
            if pending_cr:
                if decoded.startswith('\n'):
                    decoded = decoded[1:]
                decoded = '\n' + decoded
                pending_cr = False
            decoded = decoded.replace('\r\n', '\n')
            if decoded.endswith('\r'):
                decoded = decoded[:-1]
            decoded = decoded.replace('\r', '\n')
            buffer += decoded

            final_line = _clean_txt_line(buffer)
            final_blank = not final_line.strip()
            if prev_line is not None:
                candidates.extend(
                    _detect_chapter_candidates(
                        prev_line,
                        prev_start_offset,
                        prev_start_byte,
                        prev_blank,
                        final_blank
                    )
                )
                prev_blank = not prev_line.strip()

            if final_line:
                final_start_offset = total_length
                final_start_byte = total_bytes
                final_bytes = final_line.encode('utf-8')
                dst.write(final_bytes)
                total_length += len(final_line)
                total_bytes += len(final_bytes)
                candidates.extend(
                    _detect_chapter_candidates(
                        final_line,
                        final_start_offset,
                        final_start_byte,
                        prev_blank,
                        True
                    )
                )

        tmp_text_path.replace(text_path)
    except Exception as e:
        log.warning(f"构建TXT缓存失败: {file_path.name}, 错误: {e}")
        try:
            if tmp_text_path.exists():
                tmp_text_path.unlink()
        except Exception:
            pass
        return None

    chapters = _finalize_chapters(candidates, total_length, total_bytes)
    index_data = {
        "encoding": encoding,
        "total_length": total_length,
        "total_bytes": total_bytes,
        "chapters": chapters,
    }
    _write_txt_index(index_path, index_data)
    return {
        "text_path": text_path,
        "index": index_data
    }


async def _ensure_txt_cache(file_path: Path) -> Optional[dict]:
    text_path, index_path, fail_marker, _cache_key = _get_txt_cache_paths(file_path)

    if text_path.exists() and index_path.exists():
        index = _load_txt_index(index_path)
        if index:
            encoding = index.get("encoding")
            if encoding and _is_text_sample_valid(file_path, encoding):
                return {
                    "text_path": text_path,
                    "index": index
                }
            log.warning(f"TXT缓存编码疑似错误，触发重建: {file_path.name} ({encoding})")
            try:
                text_path.unlink(missing_ok=True)
                index_path.unlink(missing_ok=True)
            except Exception:
                pass

    if fail_marker.exists():
        encoding = _detect_txt_encoding(file_path)
        if encoding and _is_text_sample_valid(file_path, encoding):
            try:
                fail_marker.unlink()
            except Exception:
                pass
        else:
            return None

    binary_hint = _is_probably_binary_file(file_path)
    encoding = _detect_txt_encoding(file_path)
    if not encoding:
        try:
            fail_marker.touch(exist_ok=True)
        except Exception:
            pass
        return None
    if binary_hint and not _is_text_sample_valid(file_path, encoding):
        file_size = file_path.stat().st_size
        if file_size > TXT_BINARY_STRICT_MAX_BYTES and file_path.suffix.lower() == ".txt":
            log.warning(f"疑似二进制特征但文件较大，继续尝试按TXT读取: {file_path.name}")
            binary_hint = False
        else:
            log.error(f"疑似二进制文件，拒绝按TXT读取: {file_path}")
            try:
                fail_marker.touch(exist_ok=True)
            except Exception:
                pass
            raise HTTPException(status_code=415, detail="疑似非文本文件，可能扩展名错误或文件损坏")

    cache_result = _build_txt_cache_streaming(file_path, text_path, index_path, encoding)
    if not cache_result:
        try:
            fail_marker.touch(exist_ok=True)
        except Exception:
            pass
        return None
    return cache_result


@router.get("/books/{book_id}/content")
async def get_book_content(
    page: int = Query(0, ge=0, description="页码，从0开始（兼容旧API）"),
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取书籍内容（用于在线阅读）
    需要有书籍访问权限
    
    对于大文件（>500KB）支持分页加载：
    - page: 页码，从0开始
    - 每页约50000字符
    """
    from sqlalchemy.orm import selectinload
    
    # 加载书籍版本
    await db.refresh(book, ['versions'])
    
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    
    # 根据文件格式返回内容
    file_format = version.file_format.lower()
    
    if file_format not in ['txt', '.txt']:
        raise HTTPException(status_code=400, detail="仅支持TXT在线阅读，请下载原文件")

    return await _read_txt_content(file_path, page)


@router.post("/books/{book_id}/convert")
async def convert_book_format(
    payload: ConvertRequest,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    触发电子书格式转换（异步任务）
    """
    await db.refresh(book, ['versions'])
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)

    input_format = version.file_format.lower().lstrip(".")
    target_format = payload.target_format.lower().lstrip(".")

    if not is_conversion_supported(input_format, target_format):
        raise HTTPException(status_code=400, detail="不支持的转换格式")

    if input_format == target_format:
        return {
            "status": "ready",
            "target_format": target_format,
            "output_url": f"/api/books/{book.id}/content",
            "cached": True
        }

    result = request_conversion(file_path, target_format, force=payload.force)
    output_url = f"/api/books/{book.id}/converted?format={target_format}"
    return {
        "status": result.get("status"),
        "job_id": result.get("job_id"),
        "progress": result.get("progress", 0),
        "message": result.get("message"),
        "target_format": target_format,
        "output_url": output_url
    }


@router.get("/books/{book_id}/convert/status")
async def get_convert_status(
    job_id: str = Query(..., description="转换任务ID"),
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    查询格式转换任务状态
    """
    status = get_conversion_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="转换任务不存在")

    target_format = status.get("target_format") or "epub"
    output_url = f"/api/books/{book.id}/converted?format={target_format}"
    return {
        "status": status.get("status"),
        "progress": status.get("progress", 0),
        "message": status.get("message"),
        "target_format": target_format,
        "output_url": output_url
    }


@router.get("/books/{book_id}/converted")
async def get_converted_book(
    book_id: int,
    target_format: str = Query("epub", description="目标格式"),
    token: Optional[str] = Query(None, description="JWT Token（可选）"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取转换后的文件
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="需要认证，请提供 token")

    current_user = await _get_user_from_token(token, db)
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")

    if not await check_book_access(current_user, book_id, db):
        raise HTTPException(status_code=403, detail="无权访问此书籍")

    await db.refresh(book, ['versions'])
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    target_format = target_format.lower().lstrip(".")

    converted_path = get_cached_conversion_path(file_path, target_format)
    if not converted_path:
        raise HTTPException(status_code=404, detail="转换文件不存在")

    media_type_map = {
        "epub": "application/epub+zip",
        "mobi": "application/x-mobipocket-ebook",
        "azw3": "application/vnd.amazon.ebook"
    }
    media_type = media_type_map.get(target_format, "application/octet-stream")

    return FileResponse(
        converted_path,
        media_type=media_type,
        filename=f"{file_path.stem}.{target_format}"
    )


@router.get("/books/{book_id}/comic/page/{index}")
async def get_comic_page(
    book_id: int,
    index: int,
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取漫画页面图片
    
    Args:
        index: 图片索引（从0开始，对应 TOC 返回的 images 列表索引）
    """
    from sqlalchemy.orm import selectinload
    
    await db.refresh(book, ['versions'])
    
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    file_format = version.file_format.lower()
    if file_format not in ['zip', '.zip', 'cbz', '.cbz']:
        raise HTTPException(status_code=400, detail="不是漫画文件")

    # 获取图片列表
    images = ComicParser.get_image_list(file_path)
    
    if index < 0 or index >= len(images):
        raise HTTPException(status_code=404, detail="页面索引超出范围")
        
    image_info = images[index]
    filename = image_info['filename']
    
    # 获取图片数据
    image_data = ComicParser.get_image_data(file_path, filename)
    
    if image_data is None:
        raise HTTPException(status_code=500, detail="读取图片失败")
        
    # 确定 MIME type
    ext = Path(filename).suffix.lower()
    mime_type = "image/jpeg"
    if ext == '.png':
        mime_type = "image/png"
    elif ext == '.webp':
        mime_type = "image/webp"
    elif ext == '.gif':
        mime_type = "image/gif"
        
    return Response(content=image_data, media_type=mime_type)


async def _read_txt_content(file_path: Path, page: int = 0) -> dict:
    """
    读取TXT文件内容（支持分页）
    
    Args:
        file_path: 文件路径
        page: 页码（从0开始）
    """
    import re
    
    try:
        file_size = file_path.stat().st_size
        is_large_file = file_size > LARGE_FILE_THRESHOLD

        if is_large_file:
            cache = await _ensure_txt_cache(file_path)
            if not cache:
                raise HTTPException(status_code=500, detail="无法读取文件内容")
            index = cache["index"]
            total_length = index.get("total_length", 0)
            total_bytes = index.get("total_bytes", 0)
            if total_length <= 0:
                raise HTTPException(status_code=500, detail="无法读取文件内容")

            total_pages = (total_length + CHARS_PER_PAGE - 1) // CHARS_PER_PAGE
            start = page * CHARS_PER_PAGE
            end = min(start + CHARS_PER_PAGE, total_length)
            if start >= total_length:
                raise HTTPException(
                    status_code=400,
                    detail=f"页码超出范围，最大页码为 {total_pages - 1}"
                )

            avg_bytes = total_bytes / max(1, total_length)
            start_byte = int(start * avg_bytes)
            end_byte = int(min(total_bytes, end * avg_bytes))
            page_content = _read_txt_range(cache["text_path"], start_byte, end_byte)

            return {
                "format": "txt",
                "content": page_content,
                "length": total_length,
                "page": page,
                "totalPages": total_pages,
                "hasMore": end < total_length,
                "startOffset": start,
                "endOffset": end,
                "startByte": start_byte,
                "endByte": end_byte
            }

        content = await _read_txt_file(file_path)
        if content is None:
            raise HTTPException(
                status_code=500,
                detail="无法解码文件内容"
            )

        total_length = len(content)
        total_pages = (total_length + CHARS_PER_PAGE - 1) // CHARS_PER_PAGE

        if total_pages <= 1:
            return {
                "format": "txt",
                "content": content,
                "length": total_length,
                "page": 0,
                "totalPages": 1,
                "hasMore": False
            }

        start = page * CHARS_PER_PAGE
        end = min(start + CHARS_PER_PAGE, total_length)
        if start >= total_length:
            raise HTTPException(
                status_code=400,
                detail=f"页码超出范围，最大页码为 {total_pages - 1}"
            )
        page_content = content[start:end]

        return {
            "format": "txt",
            "content": page_content,
            "length": total_length,
            "page": page,
            "totalPages": total_pages,
            "hasMore": end < total_length,
            "startOffset": start,
            "endOffset": end
        }
    
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"读取TXT文件失败: {file_path}, 错误: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"读取文件失败: {str(e)}"
        )


@router.get("/books/{book_id}/download")
async def download_book(
    book_id: int,
    token: str = Query(None, description="JWT Token（可选，用于不支持 Header 的场景）"),
    db: AsyncSession = Depends(get_db)
):
    """
    下载书籍原始文件
    支持两种认证方式:
    1. Authorization Header (优先)
    2. URL 参数 ?token=xxx (用于浏览器直接下载)
    """
    from sqlalchemy.orm import selectinload
    from app.security import decode_access_token
    from app.utils.permissions import check_book_access
    from app.models import BookVersion
    
    # 获取 token - 优先从 URL 参数获取
    if not token:
        raise HTTPException(status_code=401, detail="需要认证，请在 URL 中添加 ?token=xxx")
    
    # 验证 token
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="无效的 token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token 验证失败: {str(e)}")
    
    # 获取用户
    result = await db.execute(
        select(User).where(User.username == username)
    )
    current_user = result.scalar_one_or_none()
    
    if not current_user:
        raise HTTPException(status_code=401, detail="用户不存在")
    
    # 获取书籍（带版本）
    result = await db.execute(
        select(Book).options(selectinload(Book.versions)).where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    # 检查权限
    if not await check_book_access(current_user, book_id, db):
        raise HTTPException(status_code=403, detail="无权访问此书籍")
    
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    
    # 返回文件
    return FileResponse(
        file_path,
        filename=version.file_name,
        media_type="application/octet-stream"
    )


@router.get("/books/{book_id}/search")
async def search_in_book(
    keyword: str = Query(..., min_length=1, max_length=100, description="搜索关键词"),
    page: int = Query(0, ge=0, description="结果页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页结果数"),
    book: Book = Depends(get_accessible_book),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    在书籍内容中搜索关键词
    
    返回:
    - matches: 匹配结果列表，包含上下文、章节信息和位置
    - total: 总匹配数
    - page: 当前页
    - totalPages: 总页数
    """
    import re
    
    await db.refresh(book, ['versions'])
    
    version = await _get_valid_version(book)
    file_path = Path(version.file_path)
    file_format = version.file_format.lower()
    
    if file_format not in ['txt', '.txt']:
        raise HTTPException(status_code=400, detail="书内搜索仅支持TXT格式")

    # 读取文件内容
    content = await _read_txt_file(file_path)
        
    if content is None:
        raise HTTPException(status_code=500, detail="无法读取文件内容")
    
    # 解析章节
    all_chapters = _parse_chapters(content)
    
    # 搜索关键词（不区分大小写）
    matches = []
    keyword_lower = keyword.lower()
    context_chars = 50  # 上下文字符数
    
    # 使用正则搜索，支持中文
    pattern = re.compile(re.escape(keyword), re.IGNORECASE)
    
    for match in pattern.finditer(content):
        start_pos = match.start()
        end_pos = match.end()
        
        # 找出该位置所属的章节
        chapter_index = 0
        chapter_title = "未知章节"
        chapter_start_offset = 0
        
        for i, ch in enumerate(all_chapters):
            if ch["startOffset"] <= start_pos < ch["endOffset"]:
                chapter_index = i
                chapter_title = ch["title"]
                chapter_start_offset = ch["startOffset"]
                break
        
        # 提取上下文
        context_start = max(0, start_pos - context_chars)
        context_end = min(len(content), end_pos + context_chars)
        context_text = content[context_start:context_end]
        
        # 计算关键词在上下文中的位置
        highlight_start = start_pos - context_start
        highlight_end = end_pos - context_start
        
        matches.append({
            "chapterIndex": chapter_index,
            "chapterTitle": chapter_title,
            "position": start_pos,
            "positionInChapter": start_pos - chapter_start_offset,
            "context": context_text,
            "highlightStart": highlight_start,
            "highlightEnd": highlight_end,
        })
    
    # 分页
    total = len(matches)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    start_idx = page * page_size
    end_idx = min(start_idx + page_size, total)
    
    return {
        "keyword": keyword,
        "matches": matches[start_idx:end_idx],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages
    }


@router.get("/books/{book_id}/cover")
async def get_book_cover(
    book_id: int,
    size: str = Query("original", pattern="^(original|thumbnail)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取书籍封面
    公开访问（封面不是敏感数据）
    
    参数:
    - size: original(原图) 或 thumbnail(缩略图)
    
    注意：如果书籍没有封面，返回404，由前端处理fallback显示
    """
    from app.utils.cover_manager import cover_manager
    from sqlalchemy.orm import selectinload
    
    # 获取书籍
    result = await db.execute(
        select(Book).options(selectinload(Book.author)).where(Book.id == book_id)
    )
    book = result.scalar_one_or_none()
    
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    
    # 如果有封面路径，返回封面
    if book.cover_path:
        cover_path = await cover_manager.get_cover_path(book.id, db, size)
        if cover_path and Path(cover_path).exists():
            return FileResponse(
                cover_path,
                media_type="image/jpeg"
            )
    
    # 没有封面时返回404，让前端显示fallback UI
    raise HTTPException(status_code=404, detail="该书籍没有封面")


def _parse_chapters(content: str) -> list:
    """
    解析TXT内容中的章节
    
    返回章节列表，每个章节包含:
    - title: 章节标题
    - startOffset: 起始位置
    - endOffset: 结束位置
    """
    import re
    
    max_title_len = 50
    min_gap = 40
    strong_patterns = [
        r'^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^Chapter\s+\d+.*$',
        r'^卷[零一二三四五六七八九十百千万亿\d]+.*$',
        r'^(序章|楔子|引子|前言|后记|尾声|番外|终章|大结局).*$',
        r'^[【\[\(].+[】\]\)]$',
    ]
    weak_patterns = [
        r'^\d{1,4}[\.、]\s*.*$',
        r'^\d{1,4}\s+.*$',
    ]
    inline_strong = re.compile(
        r'(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回][^\n]{0,40}',
        re.IGNORECASE
    )

    lines = content.split('\n')
    offsets = []
    pos = 0
    for line in lines:
        offsets.append(pos)
        pos += len(line) + 1

    candidates = []
    strong_regexes = [re.compile(p, re.IGNORECASE) for p in strong_patterns]
    weak_regexes = [re.compile(p, re.IGNORECASE) for p in weak_patterns]

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i == len(lines) - 1 or not lines[i + 1].strip()
        has_blank_neighbor = prev_blank or next_blank

        found = False
        is_body_only = line in ('正文', '正文：', '正文:')

        if len(line) <= max_title_len:
            for pattern in strong_regexes:
                if pattern.match(line):
                    candidates.append({
                        "title": line,
                        "startOffset": offsets[i],
                        "strength": 3,
                        "is_body_only": is_body_only
                    })
                    found = True
                    break

        if not found and len(line) <= max_title_len and has_blank_neighbor:
            for pattern in weak_regexes:
                if pattern.match(line):
                    candidates.append({
                        "title": line,
                        "startOffset": offsets[i],
                        "strength": 1,
                        "is_body_only": is_body_only
                    })
                    found = True
                    break

        if not found:
            match = inline_strong.search(line)
            if match:
                title = match.group().strip()
                if len(title) <= max_title_len:
                    candidates.append({
                        "title": title,
                        "startOffset": offsets[i] + match.start(),
                        "strength": 2,
                        "is_body_only": False
                    })

    candidates.sort(key=lambda x: x["startOffset"])
    filtered = []
    for cand in candidates:
        if filtered and cand["startOffset"] - filtered[-1]["startOffset"] <= min_gap:
            if cand["strength"] > filtered[-1]["strength"]:
                filtered[-1] = cand
            continue
        filtered.append(cand)

    if any(not c.get("is_body_only") for c in filtered):
        filtered = [c for c in filtered if not c.get("is_body_only")]

    chapters = []
    total_len = len(content)
    if not filtered:
        return [{
            "title": "全文",
            "startOffset": 0,
            "endOffset": total_len
        }]

    for i, match in enumerate(filtered):
        end_offset = filtered[i + 1]["startOffset"] if i < len(filtered) - 1 else total_len
        chapters.append({
            "title": match["title"],
            "startOffset": match["startOffset"],
            "endOffset": end_offset
        })

    if filtered and filtered[0]["startOffset"] > 100:
        chapters.insert(0, {
            "title": "序",
            "startOffset": 0,
            "endOffset": filtered[0]["startOffset"]
        })

    return chapters


def _parse_chapters_with_bytes(content: str) -> tuple[list, int]:
    """
    解析TXT内容中的章节（包含字节偏移）
    返回 (章节列表, 总字节数)
    """
    import re

    max_title_len = 50
    min_gap = 40
    strong_patterns = [
        r'^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
        r'^Chapter\s+\d+.*$',
        r'^卷[零一二三四五六七八九十百千万亿\d]+.*$',
        r'^(序章|楔子|引子|前言|后记|尾声|番外|终章|大结局).*$',
        r'^[【\[\(].+[】\]\)]$',
    ]
    weak_patterns = [
        r'^\d{1,4}[\.、]\s*.*$',
        r'^\d{1,4}\s+.*$',
    ]
    inline_strong = re.compile(
        r'(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回][^\n]{0,40}',
        re.IGNORECASE
    )

    lines = content.split('\n')
    offsets = []
    byte_offsets = []
    pos = 0
    byte_pos = 0
    for line in lines:
        offsets.append(pos)
        byte_offsets.append(byte_pos)
        pos += len(line) + 1
        byte_pos += len(line.encode('utf-8')) + 1

    candidates = []
    strong_regexes = [re.compile(p, re.IGNORECASE) for p in strong_patterns]
    weak_regexes = [re.compile(p, re.IGNORECASE) for p in weak_patterns]

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i == len(lines) - 1 or not lines[i + 1].strip()
        has_blank_neighbor = prev_blank or next_blank

        found = False
        is_body_only = line in ('正文', '正文：', '正文:')

        if len(line) <= max_title_len:
            for pattern in strong_regexes:
                if pattern.match(line):
                    candidates.append({
                        "title": line,
                        "startOffset": offsets[i],
                        "startByte": byte_offsets[i],
                        "strength": 3,
                        "is_body_only": is_body_only
                    })
                    found = True
                    break

        if not found and len(line) <= max_title_len and has_blank_neighbor:
            for pattern in weak_regexes:
                if pattern.match(line):
                    candidates.append({
                        "title": line,
                        "startOffset": offsets[i],
                        "startByte": byte_offsets[i],
                        "strength": 1,
                        "is_body_only": is_body_only
                    })
                    found = True
                    break

        if not found:
            match = inline_strong.search(line)
            if match:
                title = match.group().strip()
                if len(title) <= max_title_len:
                    inline_char_offset = match.start()
                    inline_byte_offset = len(line[:inline_char_offset].encode('utf-8'))
                    candidates.append({
                        "title": title,
                        "startOffset": offsets[i] + inline_char_offset,
                        "startByte": byte_offsets[i] + inline_byte_offset,
                        "strength": 2,
                        "is_body_only": False
                    })

    candidates.sort(key=lambda x: x["startOffset"])
    filtered = []
    for cand in candidates:
        if filtered and cand["startOffset"] - filtered[-1]["startOffset"] <= min_gap:
            if cand["strength"] > filtered[-1]["strength"]:
                filtered[-1] = cand
            continue
        filtered.append(cand)

    if any(not c.get("is_body_only") for c in filtered):
        filtered = [c for c in filtered if not c.get("is_body_only")]

    chapters = []
    total_len = len(content)
    total_bytes = len(content.encode('utf-8'))

    if not filtered:
        return [{
            "title": "全文",
            "startOffset": 0,
            "endOffset": total_len,
            "startByte": 0,
            "endByte": total_bytes
        }], total_bytes

    for i, match in enumerate(filtered):
        end_offset = filtered[i + 1]["startOffset"] if i < len(filtered) - 1 else total_len
        end_byte = filtered[i + 1]["startByte"] if i < len(filtered) - 1 else total_bytes
        chapters.append({
            "title": match["title"],
            "startOffset": match["startOffset"],
            "endOffset": end_offset,
            "startByte": match["startByte"],
            "endByte": end_byte
        })

    if filtered and filtered[0]["startOffset"] > 100:
        chapters.insert(0, {
            "title": "序",
            "startOffset": 0,
            "endOffset": filtered[0]["startOffset"],
            "startByte": 0,
            "endByte": filtered[0]["startByte"]
        })

    return chapters, total_bytes


def _clean_txt_content(content: str) -> str:
    """
    清理TXT内容中的常见乱码和网站标记
    """
    import re
    
    # 移除常见的网站广告标记
    patterns_to_remove = [
        # [书库] [数字] 等标记
        r'\[书库\][\[\]\d,，\.。\s]*',
        r'\[\d+\][\[\]\d,，\.。\s]*',
        # 网站水印
        r'本书来自[^\n]+\n?',
        r'更多精彩[^\n]+\n?',
        r'手机阅读[^\n]+\n?',
        r'本书.*?网.*?\n?',
        r'全文阅读[^\n]+\n?',
        r'最新章节[^\n]+\n?',
        r'www\.[a-zA-Z0-9]+\.[a-zA-Z]+',
        r'http[s]?://[^\s\n]+',
        # 零宽字符
        r'[\u200b\u200c\u200d\ufeff]',
        # 过多的空行（超过2个连续空行）
        r'\n{4,}',
    ]
    
    for pattern in patterns_to_remove:
        try:
            content = re.sub(pattern, '', content, flags=re.IGNORECASE)
        except Exception as e:
            log.warning(f"清理模式失败: {pattern}, 错误: {e}")
    
    # 规范化换行
    content = re.sub(r'\n{3,}', '\n\n', content)
    
    # 移除行首行尾的空白字符（保留缩进）
    lines = content.split('\n')
    cleaned_lines = [line.rstrip() for line in lines]
    content = '\n'.join(cleaned_lines)
    
    return content.strip()


def _is_probably_binary_file(file_path: Path, sample_size: int = 8192) -> bool:
    """
    根据文件头部字节判断是否为二进制文件
    """
    try:
        with open(file_path, 'rb') as f:
            sample = f.read(sample_size)
    except Exception as e:
        log.warning(f"读取文件样本失败: {file_path}, 错误: {e}")
        return False

    if not sample:
        return False

    if sample.startswith(b'\xff\xfe') or sample.startswith(b'\xfe\xff'):
        return False

    if b'\x00' in sample:
        even_nulls = sum(1 for i in range(0, len(sample), 2) if sample[i] == 0)
        odd_nulls = sum(1 for i in range(1, len(sample), 2) if sample[i] == 0)
        if max(even_nulls, odd_nulls) / max(1, len(sample) // 2) > 0.6:
            return False
        return True

    control_bytes = 0
    for b in sample:
        if b < 32 and b not in (9, 10, 13):
            control_bytes += 1

    return (control_bytes / len(sample)) > 0.1


async def _get_valid_version(book: Book) -> BookVersion:
    """
    获取书籍的有效版本（优先主版本，其次检查文件是否存在）
    """
    if not book.versions:
        raise HTTPException(status_code=404, detail="书籍没有可用的文件版本")
    
    # 1. 尝试主版本
    primary = next((v for v in book.versions if v.is_primary), None)
    if primary and Path(primary.file_path).exists():
        return primary
        
    # 2. 尝试其他版本
    for version in book.versions:
        if version == primary:
            continue
        if Path(version.file_path).exists():
            log.warning(f"书籍 {book.id} 主版本丢失，回退到版本: {version.file_path}")
            return version
            
    # 3. 找不到有效文件
    raise HTTPException(status_code=404, detail="书籍文件不存在")


async def _get_user_from_token(
    token: str,
    db: AsyncSession
) -> User:
    credentials_exception = HTTPException(
        status_code=401,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    username: str = payload.get("sub")
    if not username:
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise credentials_exception

    return user
