# 书籍版本管理系统实施文档

## 实施日期
2026-01-15 晚间

## 功能概述

实现了 Emby 风格的书籍版本管理系统，允许同一本书的不同格式/版本共存，前端显示为一本书但可选择不同版本阅读。

## 核心设计

### 数据库架构

**两表分离设计：**

```
Book (books)                    BookVersion (book_versions)
├─ id                          ├─ id
├─ title                       ├─ book_id (FK)
├─ author_id                   ├─ file_path (unique)
├─ library_id                  ├─ file_name
├─ cover_path                  ├─ file_format
├─ description                 ├─ file_size
├─ publisher                   ├─ file_hash (unique)
├─ age_rating                  ├─ quality (low/medium/high)
├─ content_warning             ├─ source
└─ added_at                    ├─ is_primary (boolean)
                               └─ added_at
```

**关系：**
- Book : BookVersion = 1 : N
- 每本书至少有一个版本（主版本）
- 一个版本只属于一本书

### 版本合并逻辑

**Deduplicator 三种处理结果：**

1. **skip** - 文件Hash完全相同 → 跳过
2. **add_version** - 书名+作者相同 → 作为新版本添加
3. **new_book** - 全新书籍 → 创建新书籍记录

**判断流程：**
```
文件扫描
  ↓
计算Hash
  ↓
Hash存在？ → 是 → skip（重复文件）
  ↓ 否
书名+作者存在？ → 是 → add_version（新版本）
  ↓ 否
new_book（新书籍）
```

### 版本质量判断

**自动质量评估规则：**

```python
格式优先级：
- EPUB/AZW3 → high
- MOBI → medium  
- TXT → low

文件大小调整：
- > 2MB → high
- 500KB - 2MB → medium
- < 500KB → low
```

## 已实施功能

### 1. 数据库模型 (models.py)

- ✅ Book 模型重构（移除文件字段）
- ✅ BookVersion 模型新增
- ✅ 关系定义（Book.versions）

### 2. 数据库迁移 (Alembic)

**迁移脚本：** `348d466cdb24_add_book_versions_table.py`

**迁移步骤：**
1. 创建 `book_versions` 表
2. 将现有 books 表的文件信息迁移到 book_versions
3. 每本现有书籍标记为自己的主版本
4. 删除 books 表的文件相关字段（重建表）
5. 重建索引

**安全性：**
- 保留所有现有数据
- 向后兼容
- 支持降级（downgrade）

### 3. 去重检测器 (deduplicator.py)

**新增功能：**
- `check_duplicate()` - 返回三种处理动作
- `_find_same_book()` - 查找同名同作者书籍
- 保留 `is_duplicate()` 向后兼容

**Hash检查：**
- 从 `books.file_hash` 迁移到 `book_versions.file_hash`

### 4. 扫描器 (scanner.py)

**新增功能：**
- `_save_book()` - 创建书籍+主版本
- `_save_book_version()` - 仅添加新版本
- `_determine_quality()` - 自动质量评估

**版本处理：**
```python
if action == 'skip':
    stats["skipped"] += 1
elif action == 'add_version':
    await self._save_book_version(file_path, book_id, metadata)
    stats["added"] += 1
else:  # new_book
    await self._save_book(file_path, library_id, metadata)
    stats["added"] += 1
```

## 待实施功能

### API 修改（优先级高）

#### 1. 书籍列表 API
```json
GET /api/books
{
  "id": 1,
  "title": "三体",
  "author": "刘慈欣",
  "version_count": 3,
  "primary_format": ".epub",
  "available_formats": [".txt", ".epub", ".mobi"]
}
```

#### 2. 书籍详情 API
```json
GET /api/books/{id}
{
  "id": 1,
  "title": "三体",
  "versions": [
    {
      "id": 101,
      "format": ".epub",
      "size": 2621440,
      "quality": "high",
      "is_primary": true
    },
    {
      "id": 102,
      "format": ".txt",
      "size": 1887436,
      "quality": "low",
      "is_primary": false
    }
  ]
}
```

#### 3. 版本管理 API
```
GET /api/books/{book_id}/versions - 获取所有版本
POST /api/books/{book_id}/versions/{version_id}/set-primary - 设置主版本
DELETE /api/books/{book_id}/versions/{version_id} - 删除版本
```

### 阅读器修改

#### 1. reader.py 适配
```python
# 当前：直接从 Book 获取文件路径
# 需改为：从 BookVersion 获取

@router.get("/books/{book_id}/content")
async def get_book_content(
    book_id: int,
    version_id: Optional[int] = None,  # 新增版本选择
    ...
):
    # 如果未指定version_id，使用主版本
    # 如果指定，使用指定版本
```

#### 2. 前端版本选择器
- 在阅读器顶部添加格式切换下拉框
- 切换时重新加载内容
- 保存用户选择（localStorage）

### OPDS 修改（优先级高）

#### opds_builder.py
```python
def build_opds_entry(book, versions):
    """为每个版本生成acquisition link"""
    entry = f'''
    <entry>
      <title>{book.title}</title>
      ...
    '''
    
    for version in versions:
        media_type = get_media_type(version.file_format)
        entry += f'''
      <link rel="http://opds-spec.org/acquisition"
            href="/opds/download/{version.id}"
            type="{media_type}"
            title="{version.file_format.upper()} - {version.quality}"
            length="{version.file_size}"/>
        '''
    
    return entry
```

#### opds.py 路由
```python
# 修改所有返回书籍的端点
# 确保包含所有版本的下载链接

@router.get("/opds/recent")
async def get_recent_books(...):
    books = await get_books_with_versions(db)
    return build_opds_acquisition_feed(books, with_versions=True)
```

### Web 前端

#### 1. 书籍卡片
- 显示版本数量徽章（"3个版本"）
- 悬停显示所有可用格式

#### 2. 书籍详情页
- 版本列表标签页
- 显示每个版本的格式、大小、质量
- 设置主版本按钮（管理员）
- 删除版本按钮（管理员）

## 实施步骤

### Phase 1：数据迁移（已完成 ✅）
1. ✅ 修改数据库模型
2. ✅ 创建迁移脚本
3. ✅ 修改去重逻辑
4. ✅ 修改扫描器

### Phase 2：API适配（下一步）
1. 修改书籍查询API（包含版本）
2. 修改阅读器API（支持版本选择）
3. 添加版本管理API

### Phase 3：OPDS适配
1. 修改OPDS生成器
2. 添加多版本链接
3. 测试客户端兼容性

### Phase 4：前端显示
1. 书籍列表显示版本信息
2. 详情页版本选择器
3. 阅读器版本切换

## 使用指南

### 数据迁移

```bash
# 1. 备份数据库
cp data/library.db data/library.db.backup

# 2. 运行迁移
cd sooklib
alembic upgrade head

# 3. 验证迁移
python -c "from app.database import engine; from app.models import Book, BookVersion; print('OK')"
```

### 测试版本合并

```bash
# 扫描书库，相同书名的不同格式会自动合并
curl -X POST http://localhost:8080/api/libraries/1/scan
```

### 查询书籍版本（迁移后可用）

```sql
-- 查看书籍及其版本数量
SELECT b.id, b.title, COUNT(v.id) as version_count
FROM books b
LEFT JOIN book_versions v ON b.id = v.book_id
GROUP BY b.id;

-- 查看某本书的所有版本
SELECT v.file_format, v.file_size, v.quality, v.is_primary
FROM book_versions v
WHERE v.book_id = 1;
```

## 技术亮点

1. **数据完整性** - 现有数据无损迁移
2. **灵活扩展** - 版本属性可继续扩展
3. **智能合并** - 自动识别同一本书
4. **质量评估** - 自动判断版本质量
5. **OPDS兼容** - 符合标准多格式支持

## 注意事项

### 迁移前
- ⚠️ 务必备份数据库
- ⚠️ 停止正在运行的服务
- ⚠️ 确认 Python 环境正确

### 迁移后
- 需要修改API以支持版本查询
- 需要修改阅读器以支持版本选择
- 现有客户端可能需要适配

### 降级
如果需要回退：
```bash
alembic downgrade -1
```
注意：降级会丢失版本信息，仅保留主版本

## 未来扩展

### 短期
- [ ] 手动设置版本质量
- [ ] 手动设置主版本
- [ ] 版本来源标注

### 中期
- [ ] 版本自动升级（发现更高质量版本）
- [ ] 版本比较工具
- [ ] 批量版本管理

### 长期
- [ ] 机器学习质量评估
- [ ] 自动转换格式
- [ ] 云端版本同步

---

**文档版本：** v1.0  
**创建日期：** 2026-01-15  
**作者：** Cline AI Assistant
