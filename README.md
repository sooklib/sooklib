# 📚 Sooklib - 小说书库管理系统

一个功能强大的小说管理和阅读系统，包含完整的后端API、React WebUI前端、以及Telegram机器人集成。

## ✨ 主要特性

### 📖 核心功能
- **书籍管理** - 自动扫描、元数据提取、去重
- **多路径书库** - 一个书库支持配置多个扫描路径
- **后台扫描** - 异步扫描任务，支持百万级文件，实时进度追踪
- **在线阅读** - TXT/EPUB阅读器，支持进度保存
- **高级搜索** - 全文搜索，多条件筛选
- **智能分类** - 作者、标签、书库管理
- **权限控制** - 基于角色的访问控制（RBAC）
- **封面管理** - 自动提取和缓存
- **阅读进度** - 跨设备同步
- **书签收藏** - 个人书签和收藏管理
- **备份恢复** - 自动定时备份

### 🤖 Telegram机器人
- 远程搜索和下载书籍
- 阅读进度查询
- 个性化推荐

### 🔧 技术栈
- **前端**: React 18 + TypeScript + Material-UI
- **后端**: FastAPI + Python 3.11+
- **数据库**: SQLite (默认) / PostgreSQL
- **认证**: JWT
- **部署**: Docker + GitHub Container Registry

## 🚀 快速开始

### Docker部署（推荐）

```bash
# 1. 创建目录
mkdir sooklib && cd sooklib

# 2. 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/Haruka041/sooklib/main/docker-compose.yml

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
    image: ghcr.io/haruka041/sooklib:latest
    container_name: sooklib
    ports:
      - "8080:8080"
    volumes:
      # 书库目录（只读挂载，您的小说文件存放位置）
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

### 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | admin |
| `ADMIN_PASSWORD` | 管理员密码 | admin123 |
| `SECRET_KEY` | JWT密钥 | (必须修改) |
| `LOG_LEVEL` | 日志级别 | INFO |
| `TZ` | 时区 | Asia/Shanghai |

## 📁 项目结构

```
sooklib/
├── app/                      # 后端应用
│   ├── core/                # 核心功能（扫描、元数据等）
│   ├── web/                 # Web路由和模板
│   ├── bot/                 # Telegram机器人
│   ├── models.py            # 数据模型
│   └── config.py            # 配置管理
├── react_app/               # React WebUI前端
│   ├── src/                # TypeScript源代码
│   │   ├── components/     # UI组件
│   │   ├── pages/          # 页面
│   │   ├── stores/         # Zustand状态管理
│   │   └── services/       # API服务
│   └── package.json
├── alembic/                 # 数据库迁移
├── config/                  # 配置文件
├── docs/                    # 文档
├── Dockerfile               # Docker构建文件
└── docker-compose.yml       # Docker编排
```

## 🎯 功能完成度

### 后端 (98%)
- ✅ 用户认证和授权（JWT + RBAC）
- ✅ 书籍管理（CRUD）
- ✅ 自动扫描和元数据提取
- ✅ 多路径书库支持
- ✅ 后台扫描系统（支持百万级文件）
- ✅ 搜索功能（全文搜索）
- ✅ 在线阅读器（TXT/EPUB）
- ✅ 封面管理
- ✅ 阅读进度保存
- ✅ 书签和收藏
- ✅ 标签系统
- ✅ OPDS协议支持
- ✅ Telegram机器人
- ✅ 自动备份

### React WebUI (85%)
- ✅ 用户登录认证
- ✅ 首页仪表盘
- ✅ 书库浏览（网格/列表视图）
- ✅ 书籍详情展示
- ✅ 搜索功能
- ✅ 在线阅读器（TXT/EPUB）
- ✅ 个人中心
- ✅ 后台管理（用户/书库/备份/封面）
- ✅ 多路径管理界面
- ✅ 扫描任务监控（实时进度）
- ✅ PWA支持
- ✅ 响应式设计
- 🔜 收藏功能
- 🔜 书签功能
- 🔜 个人标签

## 🌐 访问地址

| 路径 | 说明 |
|------|------|
| `/` | React WebUI |
| `/api/docs` | API文档（Swagger UI） |
| `/opds/` | OPDS目录 |

## 📱 OPDS 阅读器使用

OPDS 支持 HTTP Basic Auth 认证，使用您的 Sooklib 账号密码登录。

### 在常见阅读器中配置

**KOReader / 静读天下 / Moon+ Reader 等**：

1. 打开 OPDS 目录设置
2. 输入目录地址：`http://your-server:8080/opds/`
3. 在认证设置中填写：
   - 用户名：您的 Sooklib 用户名
   - 密码：您的密码
4. 保存并刷新

**浏览器直接访问**：

浏览器访问 `/opds/` 时会弹出 HTTP Basic Auth 登录框，输入用户名和密码即可。

### OPDS 目录结构

| 端点 | 说明 |
|------|------|
| `/opds/` | 根目录（导航） |
| `/opds/recent` | 最近添加的书籍 |
| `/opds/authors` | 作者索引 |
| `/opds/author/{id}` | 特定作者的书籍 |
| `/opds/search?q=关键词` | 搜索书籍 |
| `/opds/download/{book_id}` | 下载书籍 |

## 📖 文档

- [安装指南](MIGRATION.md)
- [API文档](http://localhost:8080/api/docs)
- [多路径扫描部署](docs/MULTIPATH_SCAN_DEPLOYMENT.md) ⭐ **最新**
- [搜索功能](docs/SEARCH_FEATURE_IMPLEMENTATION.md)
- [在线阅读器](docs/ONLINE_READER_IMPLEMENTATION.md)
- [封面管理](docs/COVER_FEATURE_IMPLEMENTATION.md)
- [Telegram机器人](docs/TELEGRAM_BOT_IMPLEMENTATION.md)
- [备份系统](docs/BACKUP_SYSTEM_IMPLEMENTATION.md)
- [React WebUI](react_app/README.md)

## 🔒 权限系统

### 角色
- **Admin** - 系统管理员，所有权限
- **Librarian** - 图书管理员，管理书籍
- **User** - 普通用户，阅读和下载

### 权限
- `books:read` - 查看书籍
- `books:write` - 管理书籍
- `users:read` - 查看用户
- `users:write` - 管理用户
- `system:admin` - 系统管理

## 📱 Telegram机器人使用

```
/start - 开始使用
/search <关键词> - 搜索书籍
/recent - 最近添加的书籍
/progress - 我的阅读进度
/help - 帮助信息
```

## 🛠️ 开发

### 后端开发

```bash
# 安装依赖
pip install -r requirements.txt

# 运行开发服务器
python -m app.main

# 访问 http://localhost:8080
```

### React WebUI 开发

```bash
cd react_app

# 安装依赖
npm install

# 运行开发服务器（带API代理）
npm run dev

# 构建生产版本
npm run build
```

## 📝 更新日志

### v1.2.0 (2026-01-16) ⭐ **最新**
- ✨ **多路径书库** - 一个书库可配置多个扫描路径
- ✨ **后台扫描系统** - 异步扫描，支持百万级文件
- ✨ **实时进度监控** - 扫描进度实时展示，每2秒自动更新
- ✨ **扫描历史追踪** - 完整的任务历史记录
- ✨ **路径管理界面** - 图形化添加/删除/启用/禁用路径
- 🚀 **性能优化** - 生成器模式 + 批量处理，内存稳定
- 📖 **Docker部署指南** - 详细的多路径配置文档

### v1.1.0 (2026-01-16)
- ✨ 新增 React WebUI 前端
- ✨ Docker镜像发布到 GHCR
- 🐛 修复各种bug
- 🗑️ 移除 Flutter Web 前端

### v1.0.0 (2026-01-15)
- ✨ FastAPI后端API
- ✨ JWT认证系统
- ✨ RBAC权限控制
- ✨ 在线阅读器（TXT/EPUB）
- ✨ Telegram机器人
- ✨ 自动备份系统
- ✨ Docker部署支持

## 📄 许可证

MIT License

## 🙏 致谢

- [React](https://react.dev/) - React框架
- [Material-UI](https://mui.com/) - React组件库
- [FastAPI](https://fastapi.tiangolo.com/) - 后端框架
- [epub.js](https://github.com/futurepress/epub.js) - EPUB阅读器

## 📞 联系方式

- 提交 Issue: https://github.com/Haruka041/sooklib/issues
- Pull Request: https://github.com/Haruka041/sooklib/pulls

---

**Made with ❤️ by Haruka041**

**⭐ 如果这个项目对你有帮助，请给个Star！**
