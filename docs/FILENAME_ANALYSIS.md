# 文件名模式分析功能使用指南

## 概述

文件名模式分析功能可以自动分析书库中的文件命名习惯，识别常见模式，并生成建议的解析规则。这对于改进元数据提取准确性非常有用。

## 功能特点

✅ **自动模式识别** - 识别10+种常见文件命名模式  
✅ **统计分析** - 分隔符、括号使用情况统计  
✅ **覆盖率计算** - 计算已识别模式的覆盖率  
✅ **规则建议** - 自动生成正则表达式规则  
✅ **代码生成** - 生成可直接使用的解析器代码  

## 支持的命名模式

### 1. 分隔符模式
- `作者-书名.txt` (使用短横线)
- `作者_书名.txt` (使用下划线)
- `作者—书名.txt` (使用全角破折号)
- `作者 - 书名.txt` (使用空格和短横线)

### 2. 括号模式
- `[作者]书名.txt`
- `【作者】书名.txt`
- `作者《书名》.txt`
- `书名(作者).txt`
- `书名（作者）.txt`

### 3. 其他模式
- `(作者)书名.txt`
- `{作者}书名.txt`

## 使用方法

### 方法 1：命令行工具（推荐）

#### 分析所有书库
```bash
cd sooklib
python scripts/analyze_filenames.py --all
```

#### 分析特定书库
```bash
# 通过书库 ID
python scripts/analyze_filenames.py --library 1

# 生成详细报告到文件
python scripts/analyze_filenames.py --library 1 --output report.txt
```

#### 分析指定目录
```bash
python scripts/analyze_filenames.py --path /path/to/books --output report.txt
```

### 方法 2：Python 代码调用

```python
from pathlib import Path
from app.utils.filename_analyzer import (
    analyze_library_filenames,
    generate_analysis_report,
    FilenameAnalyzer
)

# 分析书库
library_path = Path("/path/to/books")
report = analyze_library_filenames(library_path)

# 查看结果
print(f"总文件数: {report['total_files']}")
print(f"模式覆盖率: {report['coverage']}%")

for pattern in report['patterns_detected']:
    print(f"{pattern['pattern']}: {pattern['count']} ({pattern['percentage']}%)")

# 生成详细报告
report_text = generate_analysis_report(
    library_path,
    output_path=Path("filename_analysis.txt")
)

# 生成解析器代码
analyzer = FilenameAnalyzer()
parser_code = analyzer.generate_parser_code(report['patterns_detected'])
print(parser_code)
```

## 输出示例

### 分析报告示例

```
================================================================================
文件名模式分析报告
书库路径: /path/to/books
================================================================================

总文件数: 1523
模式覆盖率: 87.5%

================================================================================
检测到的模式:
================================================================================

模式: 作者-书名
  数量: 856 (56.2%)
  正则: ^(.+?)[-](.+?)\.txt$
  示例:
    - 刘慈欣-三体.txt
    - 金庸-天龙八部.txt
    - 东野圭吾-白夜行.txt
    - 村上春树-挪威的森林.txt
    - 余华-活着.txt

模式: [作者]书名
  数量: 342 (22.4%)
  正则: ^\[(.+?)\](.+?)\.txt$
  示例:
    - [东野圭吾]白夜行.txt
    - [刘慈欣]三体.txt
    - [金庸]天龙八部.txt

模式: 未知模式
  数量: 190 (12.5%)
  示例:
    - book1.txt
    - novel_sample.txt
    - 未命名.txt

================================================================================
分隔符使用统计:
================================================================================
  '-': 856 (56.2%)
  '_': 123 (8.1%)
  ' - ': 45 (3.0%)

================================================================================
括号使用统计:
================================================================================
  []**: 342 (22.4%)
  【】: 98 (6.4%)
  (): 67 (4.4%)
```

### 生成的解析器代码示例

```python
# 自动生成的文件名解析规则
# 基于文件名模式分析结果

PATTERNS = [
    # 作者-书名 (856个文件，56.2%)
    (r'^(.+?)[-](.+?)\.txt$', 1, 2),
    # [作者]书名 (342个文件，22.4%)
    (r'^\[(.+?)\](.+?)\.txt$', 1, 2),
    # 作者_书名 (123个文件，8.1%)
    (r'^(.+?)[_](.+?)\.txt$', 1, 2),
    # 【作者】书名 (98个文件，6.4%)
    (r'^【(.+?)】(.+?)\.txt$', 1, 2),
    # 书名(作者) (67个文件，4.4%)
    (r'^(.+?)\((.+?)\)\.txt$', 2, 1),
]
```

## 应用解析规则

### 方法 1：手动更新（当前方法）

1. 运行分析脚本生成建议的规则
2. 复制生成的 `PATTERNS` 代码
3. 编辑 `app/core/metadata/txt_parser.py`
4. 替换 `PATTERNS` 列表
5. 重启应用

### 方法 2：动态规则（计划中）

未来将支持从数据库加载自定义规则，无需修改代码。

## 注意事项

### 1. 文件编码
- 分析器自动处理 UTF-8 编码的文件名
- 对于特殊编码，可能需要系统支持

### 2. 性能考虑
- 大型书库（10000+ 文件）分析可能需要几分钟
- 建议在非高峰时段运行

### 3. 准确性
- 模式识别基于启发式规则
- 复杂的自定义命名可能被归类为"未知模式"
- 建议人工审核生成的规则

### 4. 安全性
- 生成的正则表达式经过基本验证
- 建议在测试环境中先验证规则

## 高级用法

### 自定义模式检测

可以修改 `FilenameAnalyzer` 类来添加自定义模式：

```python
# 在 filename_analyzer.py 中
def _detect_patterns(self):
    # ... 现有代码 ...
    
    # 添加自定义模式
    if '【' in name_without_ext and '】' in name_without_ext and '_' in name_without_ext:
        # 【作者】_书名 模式
        pattern_key = "【作者】_书名"
        self.patterns[pattern_key].append(filename)
```

### 批量处理多个书库

```python
from pathlib import Path
from app.utils.filename_analyzer import analyze_library_filenames

libraries = [
    Path("/library1"),
    Path("/library2"),
    Path("/library3"),
]

for lib in libraries:
    print(f"\n分析: {lib}")
    report = analyze_library_filenames(lib)
    print(f"覆盖率: {report['coverage']}%")
```

## 常见问题

### Q: 为什么某些文件被识别为"未知模式"？

A: 可能的原因：
1. 文件名不符合常见模式
2. 使用了特殊的自定义格式
3. 文件名包含特殊字符

**解决方案**：
- 查看未知模式的示例
- 考虑统一文件命名格式
- 或添加自定义模式检测规则

### Q: 如何提高模式识别准确率？

A: 建议步骤：
1. 统一书库文件命名格式
2. 使用常见的分隔符（- 或 _）
3. 避免在文件名中使用多个不同类型的分隔符
4. 保持作者和书名的顺序一致

### Q: 生成的规则会覆盖现有规则吗？

A: 不会自动覆盖。你需要：
1. 审查生成的规则
2. 手动更新 txt_parser.py
3. 合并新旧规则

### Q: 支持 EPUB 和 MOBI 文件分析吗？

A: 当前版本主要针对 TXT 文件。EPUB 和 MOBI 通常从文件内部提取元数据，不太依赖文件名模式。

## 下一步计划

- [ ] API 端点集成
- [ ] Web 界面可视化
- [ ] 数据库存储规则
- [ ] AI 辅助模式识别
- [ ] 多语言文件名支持
- [ ] 批量重命名建议

## 相关文档

- [元数据提取](../README.md#元数据提取)
- [书籍扫描流程](../README.md#书籍扫描)
- [TXT 解析器源码](../app/core/metadata/txt_parser.py)

## 技术支持

如有问题或建议，请：
1. 查看日志文件了解详细信息
2. 检查文件路径权限
3. 确认 Python 环境正确配置
