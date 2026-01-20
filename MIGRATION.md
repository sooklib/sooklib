# 数据库迁移指南

本文档说明如何使用 Alembic 管理数据库迁移。

## 概述

项目使用 [Alembic](https://alembic.sqlalchemy.org/) 进行数据库版本控制和迁移管理。这使得数据库结构的变更可以被追踪、应用和回滚。

## 迁移系统特性

- ✅ 支持异步 SQLAlchemy 2.0
- ✅ 自动从模型生成迁移脚本
- ✅ 支持升级和降级
- ✅ 从应用配置读取数据库 URL
- ✅ 完整的版本历史追踪

## 常用命令

### 查看当前数据库版本

```bash
cd sooklib
alembic current
```

### 查看迁移历史

```bash
alembic history --verbose
```

### 升级数据库到最新版本

```bash
alembic upgrade head
```

### 升级到特定版本

```bash
alembic upgrade <revision_id>
```

### 降级一个版本

```bash
alembic downgrade -1
```

### 降级到特定版本

```bash
alembic downgrade <revision_id>
```

### 完全回滚（降级到初始状态）

```bash
alembic downgrade base
```

## 创建新迁移

### 自动生成迁移（推荐）

当你修改了 `app/models.py` 中的模型后：

```bash
# 自动检测模型变更并生成迁移脚本
alembic revision --autogenerate -m "描述你的变更"
```

Alembic 会自动：
- 检测新增的表
- 检测新增/删除的列
- 检测类型变更
- 检测约束变更

⚠️ **注意**：自动生成的迁移需要人工审查！某些变更可能无法自动检测：
- 表/列重命名（会被识别为删除+新增）
- 某些约束变更
- 数据迁移逻辑

### 手动创建迁移

```bash
alembic revision -m "描述你的变更"
```

然后手动编辑生成的文件 `alembic/versions/xxxx_描述.py`。

## 迁移脚本结构

每个迁移文件包含两个函数：

```python
def upgrade() -> None:
    """升级操作"""
    # 在这里添加升级逻辑
    op.create_table(...)
    op.add_column(...)
    
def downgrade() -> None:
    """降级操作"""
    # 在这里添加回滚逻辑
    op.drop_column(...)
    op.drop_table(...)
```

## 数据迁移示例

### 添加新列并设置默认值

```python
def upgrade() -> None:
    # 添加新列
    op.add_column('users', sa.Column('email', sa.String(255), nullable=True))
    
    # 为现有数据设置默认值
    op.execute("UPDATE users SET email = username || '@example.com'")
    
    # 设置为不可空
    op.alter_column('users', 'email', nullable=False)

def downgrade() -> None:
    op.drop_column('users', 'email')
```

### 数据转换

```python
from sqlalchemy import text

def upgrade() -> None:
    # 使用 text() 包装 SQL 语句
    connection = op.get_bind()
    connection.execute(text(
        "UPDATE books SET age_rating = 'general' WHERE age_rating IS NULL"
    ))
```

## 首次部署

### 新系统（空数据库）

直接运行迁移即可：

```bash
alembic upgrade head
```

### 现有系统（已有数据）

如果你的数据库已经存在（通过 `Base.metadata.create_all()` 创建），需要标记当前迁移为已应用：

```bash
# 标记为最新版本，不实际执行 SQL
alembic stamp head
```

## 初始化脚本

### 预定义标签初始化

运行以下脚本创建预定义的系统标签：

```bash
python scripts/init_tags.py
```

这将创建：
- 4 个年龄分级标签（全年龄、12+、16+、18+）
- 16 个题材标签（科幻、奇幻、推理等）
- 6 个内容警告标签（暴力、血腥、情色等）
- 6 个其他常用标签（完结、连载等）

脚本会自动跳过已存在的标签，可以安全地多次运行。

## 备份和恢复

### 备份数据库

```bash
# SQLite 数据库
cp data/library.db data/library.db.backup

# 或使用时间戳
cp data/library.db data/library.db.$(date +%Y%m%d_%H%M%S)
```

### 恢复数据库

```bash
cp data/library.db.backup data/library.db
```

## Docker 环境

### 在 Docker 中执行迁移

```bash
# 进入容器
docker exec -it sooklib sh

# 执行迁移
alembic upgrade head

# 初始化标签
python scripts/init_tags.py
```

### 自动迁移（推荐）

修改 `run.sh` 或 `docker-compose.yml` 在启动时自动执行迁移：

```bash
#!/bin/bash
# run.sh

# 等待数据库准备就绪（如果使用外部数据库）
# ...

# 执行迁移
alembic upgrade head

# 初始化标签（可选）
python scripts/init_tags.py || true

# 启动应用
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## 最佳实践

### 1. 迁移前备份

⚠️ **始终在执行迁移前备份数据库！**

```bash
cp data/library.db data/library.db.backup
alembic upgrade head
```

### 2. 在测试环境验证

先在测试环境执行迁移，确认无误后再应用到生产环境。

### 3. 小步迭代

将大的变更拆分为多个小的迁移，便于回滚和调试。

### 4. 编写可逆的迁移

确保 `downgrade()` 函数正确实现，以便在需要时回滚。

### 5. 审查自动生成的迁移

自动生成的迁移可能不完美，需要人工审查和调整。

### 6. 使用事务

Alembic 默认在事务中执行迁移（SQLite 除某些 DDL 外）。如果需要，可以手动控制：

```python
def upgrade() -> None:
    # 禁用事务（谨慎使用）
    op.execute("PRAGMA foreign_keys=OFF")
    # ... 操作 ...
    op.execute("PRAGMA foreign_keys=ON")
```

### 7. 版本命名规范

使用清晰的描述性消息：

```bash
# 好的示例
alembic revision --autogenerate -m "Add user email verification"
alembic revision --autogenerate -m "Add book rating system"

# 不好的示例  
alembic revision --autogenerate -m "update"
alembic revision --autogenerate -m "fix"
```

## 故障排除

### 问题：迁移冲突

```
FAILED: Multiple head revisions are present
```

**解决方法**：合并分支

```bash
alembic merge heads -m "merge branches"
```

### 问题：数据库锁定

```
database is locked
```

**解决方法**：
1. 确保没有其他进程在使用数据库
2. 关闭应用程序
3. 等待一段时间后重试

### 问题：迁移执行失败

如果迁移执行到一半失败：

```bash
# 查看当前版本
alembic current

# 手动修复数据库或回滚
alembic downgrade -1

# 修复迁移脚本后重新执行
alembic upgrade head
```

### 问题：需要重新生成迁移

如果需要删除并重新创建迁移：

```bash
# 1. 删除迁移文件
rm alembic/versions/xxxx_description.py

# 2. 重新生成
alembic revision --autogenerate -m "new description"
```

## 参考资料

- [Alembic 官方文档](https://alembic.sqlalchemy.org/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- 项目架构：`plans/sooklib-architecture-v2.md`
- 数据库模型：`app/models.py`

## 更新历史

### 2026-01-15
- ✅ 初始化 Alembic 迁移系统
- ✅ 创建初始数据库模式（包含 RBAC 支持）
- ✅ 配置异步 SQLAlchemy 支持
- ✅ 创建标签初始化脚本
- ✅ 编写迁移文档
