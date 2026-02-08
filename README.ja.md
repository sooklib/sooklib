<p align="center">
  <img src="react_app/public/icon.png" alt="Sooklib" width="120" />
</p>

# Sooklib - 書庫管理システム

**Languages**：
[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [한국어](README.ko.md)

Sooklib は書庫を中心とした Emby 風の書城／書庫プロジェクトです。  
オンライン閲覧は **TXT のみ**対応し、その他の形式はダウンロード専用です。

## 位置づけ

- **書庫優先**：管理と発見を最優先
- **TXT のみオンライン閲覧**：安定性と大容量対応を重視
- **他形式はダウンロードのみ**：EPUB / PDF / 漫画
- **AI 機能**：会話式検索、推薦、ファイル名解析

## 主な機能

- 自動スキャン、メタデータ抽出、重複排除、表紙キャッシュ
- 複数パスの書庫
- バックグラウンドスキャン + 進捗
- 高度検索・フィルタ
- RBAC + JWT
- 読書進捗の同期
- OPDS カタログ
- Telegram Bot（検索／ダウンロード／TXT 閲覧）
- 自動バックアップ

## 技術スタック

バックエンド：
- FastAPI
- Uvicorn（ASGI サーバー）
- SQLAlchemy 2.x + Alembic（ORM / マイグレーション）
- SQLite / aiosqlite
- APScheduler（スケジューラ）
- python-telegram-bot
- Loguru（ログ）
- Pillow（カバー画像処理）
- chardet / ebooklib / mobi / beautifulsoup4（テキスト/電子書籍解析）

フロントエンド：
- React 18 + TypeScript
- Vite
- MUI（Material UI）
- Zustand
- React Router
- Axios
- react-i18next（i18n）
- epub.js / react-pdf（リーダー）
- react-window（仮想リスト）
- vite-plugin-pwa（PWA）

## イメージ & バージョン

- GHCR：`ghcr.io/sooklib/sooklib`
- DockerHub：`haruka041/sooklib`
- バージョン：`v1.2.3`
- チャネル：`beta`（テスト）/ `stable`（リリース）

## クイックスタート（Docker）

```bash
mkdir sooklib && cd sooklib
curl -O https://raw.githubusercontent.com/sooklib/sooklib/main/docker-compose.yml
docker-compose up -d
```

## OPDS

OPDS は HTTP Basic Auth を使用：

- URL：`http://your-server:8080/opds/`
- ユーザー名／パスワード：Sooklib のアカウント

## ドキュメント

- Docs: https://github.com/sooklib/sooklib-docs
- Getting started: https://github.com/sooklib/sooklib-docs/blob/main/docs/getting-started.md
- Docker deployment: https://github.com/sooklib/sooklib-docs/blob/main/docs/docker-deployment.md

## ライセンス

MIT License
