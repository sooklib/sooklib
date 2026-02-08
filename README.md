<p align="center">
  <img src="react_app/public/icon.png" alt="Sooklib" width="120" />
</p>

# Sooklib - 书城/书库管理系统

**语言 / Languages**：
[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [한국어](README.ko.md)

Sooklib 是一个以书库为核心、对标 Emby 的书城/书库项目，强调管理、发现与持续阅读体验。
在线阅读仅支持 TXT 并做深度优化，其它格式仅提供下载阅读。

## 项目定位

- **书库优先**：管理与发现体验优先于阅读器功能扩展
- **在线阅读仅 TXT**：稳定性与大文件处理为第一目标
- **其它格式仅下载**：EPUB/PDF/漫画等保留下载入口
- **AI 方向**：对话式找书、推荐、文件名解析与辅助扫库

## 主要特性

- **书籍管理**：自动扫描、元数据提取、去重、封面缓存
- **多路径书库**：一个书库支持多个扫描路径
- **后台扫描**：异步扫描任务，进度可追踪
- **高级搜索**：关键词 + 多条件筛选
- **权限与多用户**：JWT + RBAC
- **阅读进度**：跨设备同步
- **OPDS**：兼容主流阅读器的目录协议
- **Telegram 机器人**：远程搜索、下载、TXT 在线阅读
- **自动备份**：定时备份与恢复

## 技术栈（前后端）

后端（API / 服务端）：

- FastAPI（Web 框架）
- Uvicorn（ASGI Server）
- SQLAlchemy 2.x + Alembic（ORM 与迁移）
- SQLite / aiosqlite（默认数据库驱动）
- APScheduler（定时任务）
- python-telegram-bot（Telegram 机器人）
- Loguru（日志）
- Pillow（封面处理）
- chardet / ebooklib / mobi / bs4（文本与电子书处理）

前端（WebUI）：

- React 18 + TypeScript
- Vite（构建工具）
- MUI（Material UI 组件库）
- Zustand（状态管理）
- React Router（路由）
- Axios（HTTP 客户端）
- react-i18next（国际化）
- epubjs / react-pdf（阅读器）
- react-window（目录虚拟滚动）
- vite-plugin-pwa（PWA 支持）

## 镜像与版本

- **GHCR**：`ghcr.io/sooklib/sooklib`
- **DockerHub**：`haruka041/sooklib`
- **版本号**：`v1.2.3`
- **通道**：`beta`（测试）/ `stable`（稳定）

## 快速开始（Docker）

```bash
# 1. 创建目录
mkdir sooklib && cd sooklib

# 2. 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/sooklib/sooklib/main/docker-compose.yml

# 3. 修改配置（书库路径、密钥等）
vim docker-compose.yml

# 4. 启动服务
docker-compose up -d

# 5. 访问应用
# http://localhost:8080/
```

### docker-compose.yml 示例

```yaml
version: '3.8'

services:
  sooklib:
    image: ghcr.io/sooklib/sooklib:beta
    container_name: sooklib
    ports:
      - "8080:8080"
    volumes:
      # 书库目录（只读挂载）
      - /path/to/your/novels:/data/novels:ro
      # 应用数据（数据库、日志等）
      - ./data:/app/data
      # 封面缓存
      - ./covers:/app/covers
      # 配置文件
      - ./config:/app/config
      # 备份目录
      - ./backups:/app/backups
    environment:
      - TZ=Asia/Shanghai
      - LOG_LEVEL=INFO
      # 默认管理员账户（首次启动时创建）
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=admin123
      # 请修改为随机密钥
      - SECRET_KEY=your-secret-key-change-this-to-random-string
    restart: unless-stopped
```

## 配置与更新

常用环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | admin |
| `ADMIN_PASSWORD` | 管理员密码 | admin123 |
| `SECRET_KEY` | JWT 密钥 | (必须修改) |
| `LOG_LEVEL` | 日志级别 | INFO |
| `TZ` | 时区 | Asia/Shanghai |
| `APP_VERSION` | 当前版本号（用于更新检测） | 1.0.0 |
| `APP_CHANNEL` | 更新通道（beta/stable） | beta |
| `UPDATE_URL` | 更新信息地址（update.json） | https://raw.githubusercontent.com/sooklib/sooklib-docs/main/update.json |

更新检测基于 `update.json`，示例格式：

```json
{
  "stable": {
    "version": "v1.2.3",
    "url": "https://github.com/sooklib/sooklib/releases/tag/v1.2.3",
    "notes": "稳定版更新说明",
    "published_at": "2026-01-20"
  },
  "beta": {
    "version": "beta-abcdef1",
    "url": "https://github.com/sooklib/sooklib",
    "notes": "测试版更新说明",
    "published_at": "2026-01-20"
  }
}
```

## 在线阅读范围

- **仅 TXT 支持在线阅读**
- **EPUB/PDF/漫画等仅下载**

## OPDS 访问

OPDS 使用 HTTP Basic Auth：

- 地址：`http://your-server:8080/opds/`
- 用户名/密码：Sooklib 用户名密码

常用端点：

| 端点 | 说明 |
|------|------|
| `/opds/` | 根目录（导航） |
| `/opds/recent` | 最近添加 |
| `/opds/authors` | 作者索引 |
| `/opds/author/{id}` | 作者书籍 |
| `/opds/search?q=关键词` | 搜索 |
| `/opds/download/{book_id}` | 下载 |

## 文档

- 文档仓库：https://github.com/sooklib/sooklib-docs
- 快速开始：https://github.com/sooklib/sooklib-docs/blob/main/docs/getting-started.md
- Docker 部署：https://github.com/sooklib/sooklib-docs/blob/main/docs/docker-deployment.md
- 配置说明：https://github.com/sooklib/sooklib-docs/blob/main/docs/configuration.md
- 更新通道：https://github.com/sooklib/sooklib-docs/blob/main/docs/update-channel.md
- Telegram 机器人：https://github.com/sooklib/sooklib-docs/blob/main/docs/telegram-bot.md
- AI 功能：https://github.com/sooklib/sooklib-docs/blob/main/docs/ai-features.md

## 开发

后端：

```bash
pip install -r requirements.txt
python -m app.main
```

前端：

```bash
cd react_app
npm install
npm run dev
```

## 许可证

MIT License

## 贡献

- Issue：https://github.com/sooklib/sooklib/issues
- PR：https://github.com/sooklib/sooklib/pulls

---

Made with ❤️ by Sooklib
