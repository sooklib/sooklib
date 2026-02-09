<p align="center">
  <img src="react_app/public/icon.png" alt="Sooklib" width="120" />
</p>

# Sooklib - 서재/도서관 관리 시스템

**Languages**:
[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [한국어](README.ko.md)

Sooklib은 서재 중심의 셀프호스팅 서재/서점 프로젝트로, 관리·탐색·지속적인 독서 경험을 강조합니다.  
온라인 읽기는 **TXT만** 지원하며, 다른 형식은 다운로드 전용입니다.

## 포지셔닝

- **서재 우선**: 관리/탐색 경험을 최우선
- **TXT 전용 온라인 읽기**: 안정성과 대용량 처리 중심
- **다른 형식은 다운로드만**: EPUB / PDF / 만화
- **AI 기능**: 대화형 검색, 추천, 파일명 분석

## 주요 기능

- 스캔/메타데이터 추출/중복 제거/표지 캐시
- 멀티 경로 라이브러리
- 백그라운드 스캔 + 진행률
- 고급 검색/필터
- RBAC + JWT
- 읽기 진행률 동기화
- OPDS 카탈로그
- Telegram 봇(검색/다운로드/TXT 읽기)
- 자동 백업

## 기술 스택

백엔드:
- FastAPI
- Uvicorn (ASGI 서버)
- SQLAlchemy 2.x + Alembic (ORM & 마이그레이션)
- SQLite / aiosqlite
- APScheduler (스케줄러)
- python-telegram-bot
- Loguru (로깅)
- Pillow (커버 이미지 처리)
- chardet / ebooklib / mobi / beautifulsoup4 (텍스트·전자책 파싱)

프론트엔드:
- React 18 + TypeScript
- Vite
- MUI (Material UI)
- Zustand
- React Router
- Axios
- react-i18next (i18n)
- epub.js / react-pdf (리더)
- react-window (가상 리스트)
- vite-plugin-pwa (PWA)

## 이미지 & 버전

- GHCR: `ghcr.io/sooklib/sooklib`
- DockerHub: `haruka041/sooklib`
- 버전: `v1.2.3`
- 채널: `beta` / `stable`

## 빠른 시작 (Docker)

```bash
mkdir sooklib && cd sooklib
curl -O https://raw.githubusercontent.com/sooklib/sooklib/main/docker-compose.yml
docker-compose up -d
```

## OPDS

OPDS는 HTTP Basic Auth 사용:

- URL: `http://your-server:8080/opds/`
- 계정: Sooklib 사용자 계정

## 문서

- Docs: https://github.com/sooklib/sooklib-docs
- Getting started: https://github.com/sooklib/sooklib-docs/blob/main/docs/getting-started.md
- Docker deployment: https://github.com/sooklib/sooklib-docs/blob/main/docs/docker-deployment.md

## 라이선스

MIT License
