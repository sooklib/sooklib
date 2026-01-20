# Telegram Bot 集成实施文档

## 概述

本文档记录了小说书库管理系统 Telegram Bot 集成的完整实施过程，包括架构设计、功能实现和使用指南。

## 实施日期

2026-01-15

## 功能特性

### 核心功能

1. **账号绑定系统**
   - 基于临时授权码的安全绑定机制
   - 授权码自动过期（默认5分钟）
   - 支持解绑操作

2. **书籍搜索和浏览**
   - 关键词搜索书籍
   - 浏览最新添加的书籍
   - 查看可访问的书库列表
   - 查看书籍的多个版本/格式

3. **文件下载**
   - 直接发送小文件（< 20MB）
   - 大文件提示使用网页端下载
   - 自动选择主版本
   - 支持多格式下载

4. **阅读进度查看**
   - 查看最近阅读的书籍
   - 显示阅读进度百分比
   - 显示完成状态

5. **权限集成**
   - 完整集成现有 RBAC 系统
   - 书库访问权限检查
   - 内容分级过滤
   - 标签屏蔽支持

## 技术架构

### 目录结构

```
app/bot/
├── __init__.py          # 模块初始化
├── bot.py               # Bot 主类
└── handlers.py          # 命令处理器
```

### 核心组件

#### 1. TelegramBot 类 (bot.py)

**职责：**
- Bot 生命周期管理
- Webhook/轮询模式支持
- 命令处理器注册

**关键方法：**
- `start()` - 启动 Bot
- `stop()` - 停止 Bot
- `process_update()` - 处理 Webhook 更新

#### 2. 命令处理器 (handlers.py)

**实现的命令：**
- `/start` - 欢迎消息
- `/help` - 帮助信息
- `/bind <code>` - 绑定账号
- `/search <keyword>` - 搜索书籍
- `/recent` - 最新书籍
- `/library` - 我的书库
- `/download <id>` - 下载书籍
- `/formats <id>` - 查看格式
- `/progress` - 阅读进度

### 数据模型变更

#### User 模型扩展

```python
class User(Base):
    # ... 现有字段 ...
    
    # 新增字段
    telegram_id = Column(String(20), unique=True, nullable=True, index=True)
```

#### 数据库迁移

文件：`alembic/versions/868a6b4cdfa7_add_telegram_id_to_users.py`

```bash
# 执行迁移
cd sooklib
alembic upgrade head
```

### 配置系统

#### TelegramConfig (config.py)

```python
class TelegramConfig(BaseModel):
    enabled: bool = False                      # 是否启用
    bot_token: str = ""                        # Bot Token
    webhook_url: str = ""                      # Webhook URL（可选）
    webhook_path: str = "/webhook/telegram"    # Webhook 路径
    max_file_size: int = 20 * 1024 * 1024      # 最大文件大小
    bind_code_expiry: int = 300                # 绑定码过期时间（秒）
```

#### 环境变量支持

```bash
# .env 文件示例
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com
```

### API 端点

#### 用户 API (app/web/routes/user.py)

1. **生成绑定码**
   - `POST /api/user/telegram/bind-code`
   - 认证：需要登录
   - 响应：绑定码和使用说明

2. **获取绑定状态**
   - `GET /api/user/telegram/status`
   - 认证：需要登录
   - 响应：是否已绑定、Telegram ID

3. **解除绑定**
   - `DELETE /api/user/telegram/unbind`
   - 认证：需要登录
   - 响应：操作结果

## 部署指南

### 1. 创建 Telegram Bot

```bash
# 1. 在 Telegram 中搜索 @BotFather
# 2. 发送 /newbot 创建新 Bot
# 3. 按提示设置名称和用户名
# 4. 获取 Bot Token
```

### 2. 配置应用

#### 方式一：配置文件

编辑 `config/config.yaml`:

```yaml
telegram:
  enabled: true
  bot_token: "YOUR_BOT_TOKEN_HERE"
  webhook_url: ""  # 留空使用轮询模式
  max_file_size: 20971520  # 20MB
  bind_code_expiry: 300  # 5分钟
```

#### 方式二：环境变量

```bash
export TELEGRAM_ENABLED=true
export TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_HERE"
```

#### 方式三：Docker Compose

```yaml
services:
  app:
    environment:
      - TELEGRAM_ENABLED=true
      - TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 3. 执行数据库迁移

```bash
cd sooklib
alembic upgrade head
```

### 4. 启动应用

```bash
# 开发模式
python -m uvicorn app.web.app:app --reload

# 生产模式
docker-compose up -d
```

### 5. 验证 Bot 运行

检查日志：

```bash
# Docker 环境
docker-compose logs -f

# 应该看到：
# Telegram Bot 启动 (轮询模式)
# Telegram Bot 启动成功
```

## 使用指南

### 用户绑定流程

1. **在网页端生成绑定码**

```bash
# API 请求
POST /api/user/telegram/bind-code
Authorization: Bearer YOUR_JWT_TOKEN

# 响应
{
  "status": "success",
  "bind_code": "ABC123DEF456",
  "expires_in": 300,
  "instructions": [...]
}
```

2. **在 Telegram 中绑定**

```
/start              # 查看欢迎信息
/bind ABC123DEF456  # 使用绑定码
```

3. **开始使用**

```
/search 三体        # 搜索书籍
/recent            # 查看最新书籍
/download 123      # 下载书籍
```

### 常用命令示例

#### 搜索书籍

```
/search 三体

# 响应：
📚 搜索结果 (共 2 本):

📖 三体
👤 作者: 刘慈欣
🆔 ID: 123
───────────────

💡 使用 /download <ID> 下载书籍
```

#### 下载书籍

```
/download 123

# 响应：
📤 正在发送文件...
[发送文件]
📖 三体
格式: EPUB
```

#### 查看进度

```
/progress

# 响应：
📊 阅读进度 (最近 5 本):

📖 三体
📊 进度: 45%
📅 2026-01-15 23:30
───────────────
```

## 运行模式

### 轮询模式（Polling）

**适用场景：**
- 开发环境
- 无公网 IP
- 简单部署

**配置：**
```yaml
telegram:
  webhook_url: ""  # 留空
```

**优点：**
- 配置简单
- 无需 HTTPS
- 无需公网 IP

**缺点：**
- 响应稍慢
- 持续占用连接

### Webhook 模式

**适用场景：**
- 生产环境
- 有公网 IP/域名
- 需要高性能

**配置：**
```yaml
telegram:
  webhook_url: "https://your-domain.com"
  webhook_path: "/webhook/telegram"
```

**要求：**
- HTTPS（Telegram 要求）
- 公网可访问
- 有效的 SSL 证书

**优点：**
- 响应快速
- 节省资源
- 更稳定

## 权限系统集成

### 书库权限检查

Bot 完全集成了现有的 RBAC 权限系统：

```python
# 获取用户可访问的书库
library_ids = await get_accessible_library_ids(db, user)

# 过滤书籍
books = await filter_books_by_access(db, user, books)

# 检查单本书籍权限
if not await check_book_access(db, user, book):
    raise PermissionError
```

### 内容分级过滤

自动应用用户的内容分级限制：

```python
# 用户年龄分级限制
user.age_rating_limit  # 'all', 'teen', 'adult'

# 书籍内容分级
book.age_rating  # 'general', 'teen', 'adult'

# 自动过滤
if not check_content_rating(user, book):
    # 不返回此书籍
    pass
```

## 安全性考虑

### 1. 绑定码安全

- 随机生成 12 位字符码
- 自动过期机制（默认5分钟）
- 一次性使用
- 定期清理过期码

### 2. 身份验证

- 每个命令都验证 Telegram ID
- 绑定前检查重复绑定
- 支持解绑操作

### 3. 权限检查

- 所有操作都检查权限
- 集成 RBAC 系统
- 内容分级过滤
- 标签屏蔽支持

### 4. 文件安全

- 大文件不通过 Telegram 发送
- 检查文件存在性
- 路径遍历防护

## 错误处理

### 常见错误及解决方案

#### 1. Bot 无法启动

```
错误：Telegram Bot Token 未配置
解决：设置 TELEGRAM_BOT_TOKEN 环境变量或配置文件
```

#### 2. 绑定失败

```
错误：绑定码无效或已过期
解决：重新生成绑定码
```

#### 3. 文件下载失败

```
错误：文件太大 (XX MB)
解决：使用网页端下载
```

#### 4. 未绑定账号

```
错误：未绑定账号
解决：先使用 /bind 命令绑定账号
```

## 监控和日志

### 日志级别

```python
# 关键操作记录
log.info(f"用户 {username} 生成了 Telegram 绑定码")
log.info(f"用户 {username} 解除了 Telegram 绑定")

# 错误记录
log.error(f"Telegram Bot 启动失败: {error}")
log.error(f"绑定失败: {error}")
```

### 日志查看

```bash
# Docker 环境
docker-compose logs -f | grep "Telegram"

# 查看特定时间段
docker-compose logs --since 1h | grep "Telegram"
```

## 性能优化

### 1. 数据库查询优化

- 使用索引（telegram_id 已建索引）
- 批量查询减少数据库调用
- 使用 joinedload 减少 N+1 查询

### 2. 缓存策略

```python
# 临时绑定码存储在内存中
_bind_codes = {}

# 定期清理过期码
cleanup_expired_codes()
```

### 3. 并发处理

- Bot 使用异步处理
- 支持多用户并发请求
- 数据库连接池管理

## 未来扩展

### 计划功能

1. **内联键盘交互**
   - 格式选择按钮
   - 分页浏览
   - 快捷操作

2. **订阅通知**
   - 新书上架通知
   - 更新推送
   - 阅读提醒

3. **高级搜索**
   - 按作者搜索
   - 按标签过滤
   - 组合搜索

4. **统计功能**
   - 阅读统计
   - 收藏排行
   - 个人报告

5. **社交功能**
   - 书单分享
   - 推荐系统
   - 评论功能

### 可选增强

- **多语言支持** - 国际化
- **群组支持** - 群组内使用
- **管理功能** - 管理员专用命令
- **自定义命令** - 用户自定义快捷命令

## 故障排除

### 问题诊断步骤

1. **检查配置**
```bash
# 确认 Bot Token 正确
echo $TELEGRAM_BOT_TOKEN

# 确认 enabled 为 true
grep telegram config/config.yaml
```

2. **检查网络**
```bash
# 测试 Telegram API 连接
curl https://api.telegram.org/bot<TOKEN>/getMe
```

3. **检查日志**
```bash
# 查看启动日志
docker-compose logs | grep "Telegram Bot"

# 查看错误日志
docker-compose logs | grep ERROR | grep Telegram
```

4. **测试绑定**
```bash
# API 测试
curl -X POST http://localhost:8080/api/user/telegram/bind-code \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 总结

Telegram Bot 集成为小说书库管理系统提供了便捷的移动端访问方式，主要特点：

✅ **完整功能** - 搜索、浏览、下载、进度查看
✅ **安全集成** - 完整的权限和分级系统
✅ **简单部署** - 支持轮询和 Webhook 模式
✅ **用户友好** - 直观的命令界面
✅ **易于扩展** - 模块化设计便于添加新功能

## 参考资料

- [Python Telegram Bot 文档](https://docs.python-telegram-bot.org/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [项目完成报告](../plans/project-completion-report.md)
- [RBAC 实施文档](../plans/rbac-implementation-todo.md)

## 更新历史

- 2026-01-15: 初始实施完成
  - 核心 Bot 功能
  - 命令处理器
  - API 集成
  - 文档创建
