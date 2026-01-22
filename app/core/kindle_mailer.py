"""
Kindle 邮件推送
"""
from __future__ import annotations

import mimetypes
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Tuple

import smtplib

from app.core.kindle_settings import load_kindle_settings
from app.utils.logger import log


def _resolve_mime_type(file_path: Path) -> Tuple[str, str]:
    ext = file_path.suffix.lower()
    if ext == ".epub":
        return "application", "epub+zip"
    if ext == ".mobi":
        return "application", "x-mobipocket-ebook"
    if ext == ".azw3":
        return "application", "vnd.amazon.ebook"
    mime, _ = mimetypes.guess_type(str(file_path))
    if mime:
        parts = mime.split("/", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
    return "application", "octet-stream"


def send_to_kindle(
    to_email: str,
    attachment_path: Path,
    subject: str
) -> None:
    """
    发送文件到 Kindle

    Args:
        to_email: Kindle 接收邮箱
        attachment_path: 附件路径
        subject: 邮件主题
    """
    settings = load_kindle_settings()
    if not settings.get("enabled"):
        raise ValueError("Kindle 邮件推送未启用")

    smtp_host = str(settings.get("smtp_host") or "").strip()
    smtp_port = int(settings.get("smtp_port") or 0)
    smtp_username = str(settings.get("smtp_username") or "").strip()
    smtp_password = str(settings.get("smtp_password") or "").strip()
    from_email = str(settings.get("from_email") or "").strip() or smtp_username
    from_name = str(settings.get("from_name") or "").strip() or "Sooklib"
    use_tls = bool(settings.get("use_tls", True))
    use_ssl = bool(settings.get("use_ssl", False))

    if not smtp_host or smtp_port <= 0:
        raise ValueError("SMTP 配置不完整")
    if not from_email:
        raise ValueError("未配置发件人邮箱")

    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content("Sent by Sooklib.")

    maintype, subtype = _resolve_mime_type(attachment_path)
    with open(attachment_path, "rb") as file:
        msg.add_attachment(
            file.read(),
            maintype=maintype,
            subtype=subtype,
            filename=attachment_path.name
        )

    if use_ssl:
        context = ssl.create_default_context()
        server = smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=30)
    else:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)

    try:
        if use_tls and not use_ssl:
            context = ssl.create_default_context()
            server.starttls(context=context)
        if smtp_username and smtp_password:
            server.login(smtp_username, smtp_password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception as exc:
            log.warning(f"关闭 SMTP 连接失败: {exc}")
