<p align="center">
  <img src="react_app/public/icon.png" alt="Sooklib" width="120" />
</p>

# Sooklib - Library & Book Management

**Languages**:
[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [한국어](README.ko.md)

Sooklib is a library-first self-hosted system focused on management, discovery, and continuous reading.  
Online reading supports **TXT only** with deep optimizations; other formats are download-only.

## Positioning

- **Library first**: management and discovery before reader features
- **TXT-only online reading**: stability and large-file handling are top priority
- **Other formats: download-only**: EPUB/PDF/Comics
- **AI features**: conversational search, recommendations, filename analysis

## Key Features

- Book scanning, metadata extraction, dedup, cover cache
- Multi-path libraries
- Background scan with progress
- Advanced search + filters
- RBAC + JWT auth
- Reading progress sync
- OPDS catalog
- Telegram bot (search/download/TXT reading)
- Scheduled backup & restore

## Tech Stack

Backend:
- FastAPI (web framework)
- Uvicorn (ASGI server)
- SQLAlchemy 2.x + Alembic (ORM & migrations)
- SQLite / aiosqlite (default)
- APScheduler (scheduled jobs)
- python-telegram-bot
- Loguru (logging)
- Pillow (cover image processing)
- chardet / ebooklib / mobi / beautifulsoup4 (text & ebook parsing)

Frontend:
- React 18 + TypeScript
- Vite
- MUI (Material UI)
- Zustand
- React Router
- Axios
- react-i18next (i18n)
- epub.js / react-pdf (readers)
- react-window (virtual lists)
- vite-plugin-pwa (PWA)

## Images & Versions

- GHCR: `ghcr.io/sooklib/sooklib`
- DockerHub: `haruka041/sooklib`
- Versions: `v1.2.3`
- Channels: `beta` (test) / `stable` (release)

## Quick Start (Docker)

```bash
mkdir sooklib && cd sooklib
curl -O https://raw.githubusercontent.com/sooklib/sooklib/main/docker-compose.yml
docker-compose up -d
```

## OPDS

OPDS uses HTTP Basic Auth:

- URL: `http://your-server:8080/opds/`
- Username/Password: your Sooklib account

## Docs

- Docs repo: https://github.com/sooklib/sooklib-docs
- Getting started: https://github.com/sooklib/sooklib-docs/blob/main/docs/getting-started.md
- Docker deployment: https://github.com/sooklib/sooklib-docs/blob/main/docs/docker-deployment.md

## License

MIT License
