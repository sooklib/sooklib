<p align="center">
  <img src="react_app/public/icon.png" alt="Sooklib" width="120" />
</p>

# Sooklib - 書城／書庫管理系統

**語言 / Languages**：
[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [한국어](README.ko.md)

Sooklib 是以書庫為核心、對標 Emby 的書城／書庫專案。  
線上閱讀僅支援 **TXT**，其餘格式僅提供下載。

## 專案定位

- **書庫優先**：管理與發現優先於閱讀器擴充
- **線上閱讀僅 TXT**：穩定性與大檔處理為第一目標
- **其他格式僅下載**：EPUB / PDF / 漫畫
- **AI 方向**：對話式找書、推薦、檔名解析與掃庫輔助

## 主要特性

- 掃描入庫、元資料提取、去重、封面快取
- 多路徑書庫
- 背景掃描任務與進度追蹤
- 高級搜尋與多條件篩選
- RBAC + JWT 權限
- 閱讀進度同步
- OPDS 目錄
- Telegram 機器人（搜尋／下載／TXT 閱讀）
- 定時備份與還原

## 技術棧

後端：
- FastAPI
- Uvicorn（ASGI 伺服器）
- SQLAlchemy 2.x + Alembic（ORM 與遷移）
- SQLite / aiosqlite（預設）
- APScheduler（排程）
- python-telegram-bot
- Loguru（日誌）
- Pillow（封面處理）
- chardet / ebooklib / mobi / beautifulsoup4（文本與電子書解析）

前端：
- React 18 + TypeScript
- Vite
- MUI（Material UI）
- Zustand
- React Router
- Axios
- react-i18next（國際化）
- epub.js / react-pdf（閱讀器）
- react-window（虛擬列表）
- vite-plugin-pwa（PWA）

## 鏡像與版本

- GHCR：`ghcr.io/sooklib/sooklib`
- DockerHub：`haruka041/sooklib`
- 版本號：`v1.2.3`
- 通道：`beta`（測試）/ `stable`（正式）

## 快速開始（Docker）

```bash
mkdir sooklib && cd sooklib
curl -O https://raw.githubusercontent.com/sooklib/sooklib/main/docker-compose.yml
docker-compose up -d
```

## OPDS

OPDS 使用 HTTP Basic Auth：

- 位址：`http://your-server:8080/opds/`
- 帳號／密碼：Sooklib 使用者帳密

## 文件

- 文件倉庫：https://github.com/sooklib/sooklib-docs
- 快速開始：https://github.com/sooklib/sooklib-docs/blob/main/docs/getting-started.md
- Docker 部署：https://github.com/sooklib/sooklib-docs/blob/main/docs/docker-deployment.md

## 授權

MIT License
