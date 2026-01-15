# 小说书库管理系统

一个基于 Docker 的电子书管理系统，类似 Emby/Jellyfin 的书库管理方案。支持自动扫描、元数据提取、在线阅读、OPDS 协议和多用户管理。

## ✨ 特性

- 📚 **多格式支持**：txt、epub、mobi/azw3，以及 zip、rar、7z、iso 等压缩包
- 🔍 **智能扫描**：自动扫描书库，提取书名、作者、封面等元数据
- 🚫 **智能去重**：基于文件 Hash 和内容相似度的去重机制
- 👥 **多用户系统**：支持多用户登录，每个用户独立的阅读进度
- 📖 **阅读进度同步**：跨设备同步阅读进度
- 📡 **OPDS 支持**：兼容主流阅读器应用（Moon+ Reader、KyBook 等）
- 🐳 **Docker 部署**：一键部署，开箱即用
- 🌐 **Web 界面**：现代化的 Web 管理界面

## 🚀 快速开始

### 方法一：从 GitHub 拉取 Docker 镜像（推荐）

**适合：** 直接部署使用

```bash
# 1. 下载 docker-compose 配置
wget https://raw.githubusercontent.com/Haruka041/novel-library/main/docker-compose.prod.yml
mv docker-compose.prod.yml docker-compose.yml

# 2. 编辑配置（修改路径和密码）
nano docker-compose.yml

# 3. 启动服务
docker-compose up -d
```

Docker 镜像地址：`ghcr.io/haruka041/novel-library:latest`

### 方法二：本地构建（开发者）

**适合：** 需要修改代码或本地开发

1. **克隆项目**
```bash
git clone https://github.com/Haruka041/novel-library.git
cd novel-library
```

2. **修改配置**

编辑 `docker-compose.yml`，修改以下内容：

```yaml
volumes:
  # 将 /path/to/your/novels 改为您的小说文件存放路径
  - /path/to/your/novels:/data/novels:ro

environment:
  # 修改管理员密码
  - ADMIN_PASSWORD=your-secure-password
  # 修改为随机密钥
  - SECRET_KEY=your-random-secret-key-here
```

3. **启动服务**
```bash
docker-compose up -d
```

4. **访问系统**

打开浏览器访问：`http://localhost:8080`

默认管理员账户：
- 用户名：`admin`
- 密码：在 `docker-compose.yml` 中设置的密码

⚠️ **首次登录后请立即修改默认密码！**

## 📖 使用指南

### 添加书库

1. 登录后台
2. 进入「管理」菜单
3. 点击「添加新书库」
4. 输入书库名称和路径（容器内的路径，如 `/data/novels`）
5. 点击「开始扫描」

### 文件命名规范

系统支持以下文件命名格式自动识别作者和书名：

- `作者-书名.txt`
- `[作者]书名.txt`
- `作者《书名》.txt`
- `书名(作者).txt`
- `【作者】书名.txt`

对于 epub 和 mobi 格式，系统会自动从文件内部元数据中提取信息。

### OPDS 订阅

OPDS 目录地址：`http://your-server:8080/opds/catalog`

在支持 OPDS 的阅读器中添加此地址即可订阅您的书库。

## 🛠️ 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SERVER_HOST` | 服务器监听地址 | `0.0.0.0` |
| `SERVER_PORT` | 服务器端口 | `8080` |
| `DATABASE_URL` | 数据库连接字符串 | `sqlite+aiosqlite:///data/library.db` |
| `SECRET_KEY` | JWT 密钥（必须修改） | - |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码（必须修改） | - |
| `LOG_LEVEL` | 日志级别 | `INFO` |

### 配置文件

高级配置请编辑 `config/config.yaml`。

## 📁 目录结构

```
novel-library/
├── app/                    # 应用代码
│   ├── core/              # 核心模块（扫描、解析、去重等）
│   ├── web/               # Web 界面
│   └── utils/             # 工具模块
├── config/                # 配置文件
├── data/                  # 数据目录（数据库、日志）
├── covers/                # 封面缓存
├── docker-compose.yml     # Docker Compose 配置
├── Dockerfile            # Docker 镜像构建文件
└── README.md             # 本文件
```

## 🔧 开发

### 本地运行

1. **安装依赖**
```bash
pip install -r requirements.txt
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件
```

3. **运行应用**
```bash
python -m app.main
```

### API 文档

启动后访问：`http://localhost:8080/docs`

## 📝 待实现功能

- [ ] OPDS 协议完整实现
- [ ] 在线阅读器（txt/epub）
- [ ] 书籍搜索和筛选
- [ ] 豆瓣读书元数据刮削
- [ ] 自定义书架
- [ ] 标签系统
- [ ] 阅读统计

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## ⚠️ 免责声明

本项目仅供个人学习和研究使用，请勿用于商业用途。使用者应遵守相关法律法规。
