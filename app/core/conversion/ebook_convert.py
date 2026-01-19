"""
Ebook conversion helper based on calibre ebook-convert
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from hashlib import md5
from pathlib import Path
from typing import Dict, Optional

from app.config import settings
from app.utils.logger import log


CONVERT_CACHE_DIR = Path(settings.directories.data) / "cache" / "converted"
CONVERT_JOB_DIR = Path(settings.directories.data) / "cache" / "convert_jobs"

CONVERT_TIMEOUT_SECONDS = 180
CONVERT_MEMORY_LIMIT_MB = 1024

SUPPORTED_TARGET_FORMATS = {"epub", "mobi", "azw3"}
SUPPORTED_INPUT_FORMATS = {".epub", ".mobi", ".azw3"}

_JOB_LOCK = threading.Lock()
_JOB_INDEX: Dict[str, str] = {}


def is_conversion_supported(input_format: str, target_format: str) -> bool:
    return (
        f".{input_format.lstrip('.')}" in SUPPORTED_INPUT_FORMATS
        and target_format in SUPPORTED_TARGET_FORMATS
    )


def _ensure_dirs() -> None:
    CONVERT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CONVERT_JOB_DIR.mkdir(parents=True, exist_ok=True)


def _make_cache_key(file_path: Path, target_format: str) -> str:
    file_stat = file_path.stat()
    key = f"{file_path.name}_{file_stat.st_size}_{file_stat.st_mtime}_{target_format}"
    return md5(key.encode()).hexdigest()


def _output_paths(file_path: Path, target_format: str) -> tuple[Path, Path, str]:
    cache_key = _make_cache_key(file_path, target_format)
    output_path = CONVERT_CACHE_DIR / f"{cache_key}.{target_format}"
    fail_marker = CONVERT_CACHE_DIR / f"{cache_key}.{target_format}.fail"
    return output_path, fail_marker, cache_key


def get_cached_conversion_path(file_path: Path, target_format: str) -> Optional[Path]:
    _ensure_dirs()
    output_path, fail_marker, _ = _output_paths(file_path, target_format)
    if output_path.exists() and output_path.stat().st_size > 0:
        return output_path
    if fail_marker.exists():
        return None
    return None


def get_conversion_status(job_id: str) -> Optional[dict]:
    _ensure_dirs()
    job_path = CONVERT_JOB_DIR / f"{job_id}.json"
    if not job_path.exists():
        return None
    try:
        with open(job_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"Failed to read conversion job status: {job_id}, error: {e}")
        return None


def request_conversion(file_path: Path, target_format: str, force: bool = False) -> dict:
    _ensure_dirs()
    target_format = target_format.lower().lstrip(".")
    output_path, fail_marker, cache_key = _output_paths(file_path, target_format)

    if not shutil.which("ebook-convert"):
        return {
            "status": "failed",
            "message": "ebook-convert not found",
        }

    if output_path.exists() and output_path.stat().st_size > 0:
        return {
            "status": "ready",
            "output_path": str(output_path),
        }

    if fail_marker.exists() and not force:
        return {
            "status": "failed",
            "message": "previous conversion failed",
        }

    with _JOB_LOCK:
        existing_job_id = _JOB_INDEX.get(cache_key)
        if existing_job_id:
            existing_status = get_conversion_status(existing_job_id)
            if existing_status and existing_status.get("status") == "running":
                return {
                    "status": "running",
                    "job_id": existing_job_id,
                    "progress": existing_status.get("progress", 0),
                }

        job_id = uuid.uuid4().hex
        _JOB_INDEX[cache_key] = job_id

    job_state = {
        "job_id": job_id,
        "status": "running",
        "progress": 0,
        "message": "conversion started",
        "target_format": target_format,
        "output_path": str(output_path),
        "updated_at": int(time.time()),
    }
    _write_job(job_id, job_state)

    thread = threading.Thread(
        target=_run_conversion_job,
        args=(job_id, file_path, target_format, output_path, fail_marker),
        daemon=True
    )
    thread.start()

    return {
        "status": "running",
        "job_id": job_id,
        "progress": 0,
    }


def _write_job(job_id: str, data: dict) -> None:
    _ensure_dirs()
    data["updated_at"] = int(time.time())
    job_path = CONVERT_JOB_DIR / f"{job_id}.json"
    try:
        with open(job_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=True)
    except Exception as e:
        log.warning(f"Failed to write conversion job status: {job_id}, error: {e}")


def _update_job(job_id: str, **updates) -> None:
    current = get_conversion_status(job_id) or {"job_id": job_id}
    current.update(updates)
    _write_job(job_id, current)


def _run_conversion_job(
    job_id: str,
    file_path: Path,
    target_format: str,
    output_path: Path,
    fail_marker: Path
) -> None:
    tmp_output = output_path.with_suffix(output_path.suffix + ".part")
    try:
        if tmp_output.exists():
            tmp_output.unlink()
    except Exception:
        pass

    ok, message = _run_ebook_convert(job_id, file_path, tmp_output)

    if ok and tmp_output.exists() and tmp_output.stat().st_size > 0:
        try:
            tmp_output.replace(output_path)
        except Exception as e:
            log.error(f"Failed to move output file: {tmp_output} -> {output_path}, error: {e}")
            ok = False
            message = "failed to persist output file"

    if ok:
        if fail_marker.exists():
            try:
                fail_marker.unlink()
            except Exception:
                pass
        _update_job(job_id, status="success", progress=1.0, message="conversion completed")
        log.info(f"Conversion completed: {file_path.name} -> {output_path.name}")
    else:
        try:
            fail_marker.touch(exist_ok=True)
        except Exception:
            pass
        _update_job(job_id, status="failed", progress=0, message=message or "conversion failed")
        log.warning(f"Conversion failed: {file_path.name}, reason: {message}")

    if tmp_output.exists():
        try:
            tmp_output.unlink()
        except Exception:
            pass


def _run_ebook_convert(job_id: str, input_path: Path, output_path: Path) -> tuple[bool, str]:
    cmd = [
        "ebook-convert",
        str(input_path),
        str(output_path)
    ]

    log.info(f"Start conversion: {input_path.name} -> {output_path.name}")
    _update_job(job_id, message="conversion running")

    start_time = time.monotonic()
    progress_re = re.compile(r"(\\d{1,3})%")

    def _apply_limits():
        try:
            import resource
            if CONVERT_MEMORY_LIMIT_MB:
                limit = CONVERT_MEMORY_LIMIT_MB * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
            resource.setrlimit(resource.RLIMIT_CPU, (CONVERT_TIMEOUT_SECONDS, CONVERT_TIMEOUT_SECONDS))
        except Exception:
            pass

    preexec = _apply_limits if os.name == "posix" else None

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            preexec_fn=preexec
        )
    except FileNotFoundError:
        return False, "ebook-convert not installed"
    except Exception as e:
        return False, f"failed to start converter: {e}"

    last_progress = 0.0
    output_lines: list[str] = []

    try:
        if process.stdout:
            for line in process.stdout:
                output_lines.append(line.strip())
                match = progress_re.search(line)
                if match:
                    percent = min(int(match.group(1)), 100)
                    progress = max(last_progress, percent / 100.0)
                    if progress != last_progress:
                        last_progress = progress
                        _update_job(job_id, progress=progress)

                if time.monotonic() - start_time > CONVERT_TIMEOUT_SECONDS:
                    process.kill()
                    return False, "conversion timeout"
    finally:
        try:
            process.wait(timeout=5)
        except Exception:
            pass

    if process.returncode != 0:
        message = "conversion failed"
        if output_lines:
            message = output_lines[-1]
        return False, message

    if last_progress < 1.0:
        _update_job(job_id, progress=1.0)

    return True, "ok"
