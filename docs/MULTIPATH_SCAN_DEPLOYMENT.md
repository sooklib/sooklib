# 多路径书库与后台扫描系统 - Docker 部署指南

## 🚀 新功能概述

本次更新添加了以下重要功能：

1. **多路径书库支持** - 一个书库可以配置多个扫描路径
2. **后台扫描系统** - 异步扫描，支持百万级文件，实时进度追踪
3. **图形化管理界面** - React WebUI 完整的路径管理和扫描监控界面

## 📋 更新内容

### 数据库变更
- 新增 `library_paths` 表 - 存储书库多路径配置
- 新增 `scan_tasks` 表 - 扫描任务状态追踪

### 新增文件
- `app/core/background_scanner.py` - 后台扫描引擎
- `app/web/routes/admin_scan.py` - 扫描管理 API
- `alembic/versions/20260116_add_multi_path_and_scan_tasks.py` - 数据库迁移

### 修改文件
- `app/models.py` - 添加新数据模型
- `app/web/app.py` - 注册新路由
- `react_app/src/components/admin/LibrariesTab.tsx` - 完全重写管理界面

## 🐳 Docker 部署步骤

### 1. 拉取最新代码

```bash
cd /path/to/sooklib
git pull origin main
```

### 2. 停止现有容器

```bash
docker-compose down
```

### 3. 运行数据库迁移

**方式 A: 容器内执行（推荐）**
```bash
# 仅启动数据库服务
docker-compose up -d db

# 在应用容器中执行迁移
docker-compose run --rm web alembic upgrade head

# 验证迁移成功
docker-compose run --rm web alembic current
```

**方式 B: 手动执行**
```bash
# 如果有本地 Python 环境
pip install -r requirements.txt
alembic upgrade head
```

### 4. 重新构建镜像（如果有代码变更）

```bash
# 构建新镜像
docker-compose build

# 或者强制重新构建
docker-compose build --no-cache
```

### 5. 启动服务

```bash
docker-compose up -d
```

### 6. 验证部署

```bash
# 查看日志
docker-compose logs -f web

# 检查数据库表
docker-compose exec db sqlite3 /app/data/library.db ".schema library_paths"
docker-compose exec db sqlite3 /app/data/library.db ".schema scan_tasks"

# 访问 Web 界面
# http://your-server:8000
```

## 📝 Docker Compose 配置说明

确保你的 `docker-compose.yml` 包含以下关键配置：

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "8000:8000"
    volumes:
      # 数据库持久化
      - ./data:/app/data
      # 书库路径映射（重要！）
      - /path/to/your/books1:/books/folder1:ro
      - /path/to/your/books2:/books/folder2:ro
      # 可以添加更多路径
    environment:
      - DATABASE_URL=sqlite:///data/library.db
    depends_on:
      - db
    restart: unless-stopped
```

### ⚠️ 重要：书库路径映射

由于 Docker 容器隔离，你需要将宿主机的书库目录映射到容器内：

```yaml
volumes:
  # 格式: 宿主机路径:容器内路径:权限
  - /home/user/books:/books/main:ro        # 只读
  - /mnt/storage/novels:/books/storage:ro  # 只读
```

**在 WebUI 中配置书库时，使用容器内路径：**
- ✅ 正确：`/books/main`
- ❌ 错误：`/home/user/books`（宿主机路径）

## 🔧 配置示例

### 场景 1: 单个书库，多个路径

宿主机目录结构：
```
/mnt/books/
  ├── chinese/     (中文小说)
  ├── english/     (英文小说)
  └── japanese/    (日文小说)
```

Docker Compose 配置：
```yaml
volumes:
  - /mnt/books/chinese:/books/chinese:ro
  - /mnt/books/english:/books/english:ro
  - /mnt/books/japanese:/books/japanese:ro
```

WebUI 配置：
1. 创建书库「全部小说」
2. 添加路径：
   - `/books/chinese`
   - `/books/english`
   - `/books/japanese`
3. 点击「启动扫描」

### 场景 2: 多个书库，各自路径

Docker Compose 配置：
```yaml
volumes:
  - /mnt/novels/completed:/books/completed:ro
  - /mnt/novels/ongoing:/books/ongoing:ro
```

WebUI 配置：
- 书库 1「已完结」→ 路径 `/books/completed`
- 书库 2「连载中」→ 路径 `/books/ongoing`

## 🎯 使用指南

### 创建多路径书库

1. 登录管理后台
2. 进入「书库管理」标签
3. 点击「添加书库」
4. 输入书库名称
5. 添加第一个路径（必填）
6. 点击「添加路径」按钮，可添加更多路径
7. 点击「确定」

### 管理路径

1. 点击书库卡片的「展开」按钮
2. 在「扫描路径」区域：
   - **添加路径**：点击「添加路径」按钮
   - **启用/禁用**：切换开关（禁用的路径不会被扫描）
   - **删除路径**：点击删除图标（至少保留一个路径）

### 启动后台扫描

1. 点击书库卡片上的「▶ 扫描」按钮
2. 扫描任务在后台执行，界面每 2 秒自动更新进度
3. 可查看实时统计：
   - 已处理文件数
   - 已添加书籍数
   - 已跳过书籍数
   - 错误数量
4. 如需停止，点击「取消」按钮

### 查看扫描历史

1. 展开书库详情
2. 滚动到「扫描历史」区域
3. 查看最近 5 次扫描记录，包括：
   - 任务状态（完成/失败/取消等）
   - 开始时间
   - 文件数量
   - 添加/跳过统计

## 🔍 故障排查

### 问题 1: 扫描失败，提示路径不存在

**原因**：容器内路径未正确映射

**解决**：
1. 检查 `docker-compose.yml` 的 volumes 配置
2. 确保宿主机路径存在
3. 重启容器：`docker-compose restart`
4. 验证映射：`docker-compose exec web ls -la /books`

### 问题 2: 扫描进度一直为 0%

**原因**：路径为空或权限问题

**解决**：
1. 进入容器检查：`docker-compose exec web ls -la /books/your-path`
2. 检查文件权限：确保容器用户有读权限
3. 查看日志：`docker-compose logs -f web`

### 问题 3: 数据库迁移失败

**原因**：数据库锁定或版本冲突

**解决**：
```bash
# 停止所有服务
docker-compose down

# 备份数据库
cp data/library.db data/library.db.backup

# 检查当前版本
docker-compose run --rm web alembic current

# 查看待执行的迁移
docker-compose run --rm web alembic heads

# 强制执行迁移
docker-compose run --rm web alembic upgrade head

# 重启服务
docker-compose up -d
```

### 问题 4: 扫描速度很慢

**原因**：文件过多或网络存储延迟

**优化建议**：
1. 使用本地存储而非 NFS/SMB
2. 增加容器资源限制：
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
```
3. 调整批处理大小（需修改代码）

## 📊 性能建议

### 资源配置

**小规模（< 10,000 本书）：**
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
```

**中等规模（10,000 - 100,000 本书）：**
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
```

**大规模（> 100,000 本书）：**
```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 4G
```

### 存储优化

1. **使用 SSD** 存储数据库（`data/` 目录）
2. **书库可以在 HDD**（只读，顺序读取）
3. **考虑使用 PostgreSQL** 替代 SQLite（大规模部署）

## 🔄 回滚方案

如果更新后出现问题，可以回滚到之前版本：

```bash
# 1. 停止服务
docker-compose down

# 2. 还原数据库备份
cp data/library.db.backup data/library.db

# 3. 切换到旧版本代码
git checkout <previous-commit>

# 4. 重新构建
docker-compose build

# 5. 启动服务
docker-compose up -d
```

## 📚 API 文档

新增的 API 端点：

### 路径管理
- `POST /api/admin/libraries/{id}/paths` - 添加路径
- `GET /api/admin/libraries/{id}/paths` - 获取路径列表
- `DELETE /api/admin/libraries/{id}/paths/{path_id}` - 删除路径
- `PUT /api/admin/libraries/{id}/paths/{path_id}/toggle` - 启用/禁用路径

### 扫描管理
- `POST /api/admin/libraries/{id}/scan` - 启动扫描
- `GET /api/admin/scan-tasks/{task_id}` - 获取任务状态
- `GET /api/admin/libraries/{id}/scan-tasks` - 获取扫描历史
- `POST /api/admin/scan-tasks/{task_id}/cancel` - 取消任务
- `GET /api/admin/scan-tasks` - 获取所有任务
- `GET /api/admin/scan-tasks/stats` - 获取统计信息

完整 API 文档可访问：`http://your-server:8000/docs`

## ✅ 部署检查清单

部署完成后，请验证以下功能：

- [ ] 数据库迁移成功
- [ ] React WebUI 可访问
- [ ] 书库管理页面正常显示
- [ ] 可以添加/删除路径
- [ ] 可以启用/禁用路径
- [ ] 扫描任务可以启动
- [ ] 进度条实时更新
- [ ] 扫描历史正确显示
- [ ] 书籍列表正常显示
- [ ] 原有功能正常（阅读、搜索等）

## 🆘 获取帮助

如遇到问题：

1. 查看应用日志：`docker-compose logs -f web`
2. 查看数据库状态：`docker-compose exec db sqlite3 /app/data/library.db`
3. 访问 API 文档：`http://your-server:8000/docs`
4. 提交 GitHub Issue 并附上日志

## 📝 更新日志

**版本：2026-01-16**

- ✅ 新增多路径书库支持
- ✅ 新增后台扫描系统
- ✅ 新增实时进度监控
- ✅ 新增扫描历史记录
- ✅ 优化大规模文件扫描性能
- ✅ 完全重写书库管理界面

---

**部署愉快！** 🎉

如有问题，请参考故障排查部分或联系技术支持。
