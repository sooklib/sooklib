"""
TXT文件名解析器
从文件名提取作者和书名信息
支持动态规则加载和统计
同时提供简介智能提取功能
"""
import json
import re
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FilenamePattern
from app.utils.logger import log

# 简单的内存缓存
# Key: (file_path_str, file_mtime, file_size)
# Value: chapters_list
_toc_cache = {}

class TxtParser:
    """TXT文件名解析器（支持动态规则）"""
    
    # 默认内置规则（优先级从高到低）
    DEFAULT_PATTERNS = [
        # 作者-书名.txt
        (r'^(.+?)[-_](.+?)\.txt$', 1, 2, '作者-书名格式'),
        # [作者]书名.txt
        (r'^\[(.+?)\](.+?)\.txt$', 1, 2, '[作者]书名格式'),
        # 作者《书名》.txt
        (r'^(.+?)《(.+?)》\.txt$', 1, 2, '作者《书名》格式'),
        # 书名(作者).txt
        (r'^(.+?)\((.+?)\)\.txt$', 2, 1, '书名(作者)格式'),
        # 作者_书名.txt
        (r'^(.+?)_(.+?)\.txt$', 1, 2, '作者_书名格式'),
        # 【作者】书名.txt
        (r'^【(.+?)】(.+?)\.txt$', 1, 2, '【作者】书名格式'),
    ]
    
    def __init__(self, db: Optional[AsyncSession] = None):
        """
        初始化解析器
        
        Args:
            db: 数据库会话（可选，用于加载自定义规则）
        """
        self.db = db
        self.custom_patterns: List[Tuple] = []
        self.pattern_stats: Dict[int, Dict] = {}  # pattern_id -> {matches, successes}
        
    def parse_toc(self, file_path: Path) -> List[Dict]:
        """
        解析章节目录（带缓存）
        
        Args:
            file_path: 文件路径
            
        Returns:
            章节列表
        """
        try:
            stat = file_path.stat()
            cache_key = (str(file_path), stat.st_mtime, stat.st_size)
            
            if cache_key in _toc_cache:
                return _toc_cache[cache_key]
            
            # 读取内容并解析
            content = self._read_file_content(file_path)
            if not content:
                return []
                
            chapters = self._parse_chapters(content)
            
            # 存入缓存 (简单的LRU机制：如果太大就清空)
            if len(_toc_cache) > 100:
                _toc_cache.clear()
            _toc_cache[cache_key] = chapters
            
            return chapters
        except Exception as e:
            log.error(f"解析目录失败: {file_path}, 错误: {e}")
            return []

    def read_preview(self, file_path: Path, max_chars: int = 5000) -> Optional[str]:
        """读取文件前N字符用于简介/标签提取"""
        return self._read_file_content(file_path, max_chars=max_chars)

    def _read_file_content(self, file_path: Path, max_chars: Optional[int] = None) -> Optional[str]:
        """读取文件内容（尝试多种编码）"""
        import chardet

        if self._is_probably_binary_file(file_path):
            log.warning(f"疑似二进制文件，跳过读取: {file_path.name}")
            return None
        
        def decode_quality(text: str) -> float:
            if not text:
                return 1.0
            total = len(text)
            replacement = text.count('\ufffd')
            control = sum(1 for ch in text if ord(ch) < 32 and ch not in '\t\n\r')
            return (replacement + control) / total

        def cjk_ratio(text: str) -> float:
            if not text:
                return 0.0
            total = len(text)
            cjk = sum(1 for ch in text if '\u4e00' <= ch <= '\u9fff')
            return cjk / total

        def choose_encoding() -> Optional[str]:
            candidates = [
                'utf-8', 'utf-8-sig',
                'gb18030', 'gbk', 'gb2312',
                'big5',
                'utf-16-le', 'utf-16-be',
            ]
            try:
                with open(file_path, 'rb') as f:
                    raw_data = f.read(200000)
            except Exception as e:
                log.error(f"读取编码检测样本失败: {e}")
                return None

            bom_encoding = None
            if raw_data.startswith(b'\xff\xfe'):
                bom_encoding = 'utf-16-le'
            elif raw_data.startswith(b'\xfe\xff'):
                bom_encoding = 'utf-16-be'
            if bom_encoding:
                return bom_encoding

            best_encoding = None
            best_score = None
            for encoding in candidates:
                try:
                    decoded = raw_data.decode(encoding)
                except UnicodeDecodeError:
                    continue
                score = (decode_quality(decoded), -cjk_ratio(decoded))
                if best_score is None or score < best_score:
                    best_score = score
                    best_encoding = encoding

            if best_encoding:
                return best_encoding

            result = chardet.detect(raw_data)
            detected = result.get('encoding')
            if not detected:
                return None

            detected_lower = detected.lower()
            if detected_lower in ('utf-16', 'utf_16'):
                even_nulls = sum(1 for i in range(0, len(raw_data), 2) if raw_data[i] == 0)
                odd_nulls = sum(1 for i in range(1, len(raw_data), 2) if raw_data[i] == 0)
                if odd_nulls > even_nulls:
                    return 'utf-16-le'
                if even_nulls > odd_nulls:
                    return 'utf-16-be'
                return None

            if detected_lower in ('utf-16le', 'utf_16le'):
                return 'utf-16-le'
            if detected_lower in ('utf-16be', 'utf_16be'):
                return 'utf-16-be'

            return detected

        encoding = choose_encoding()
        if not encoding:
            return None

        try:
            with open(file_path, 'r', encoding=encoding, errors='replace') as f:
                content = f.read() if max_chars is None else f.read(max_chars)
            if decode_quality(content[:10000]) > 0.2:
                log.warning(f"编码 {encoding} 读取质量较差: {file_path.name}")
            return self._clean_content(content)
        except Exception as e:
            log.error(f"使用编码 {encoding} 读取失败: {e}")
            return None

    def _clean_content(self, content: str) -> str:
        """清理内容"""
        # 移除零宽字符
        content = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', content)
        # 规范化换行
        content = re.sub(r'\r\n', '\n', content)
        return content

    def _is_probably_binary_file(self, file_path: Path, sample_size: int = 8192) -> bool:
        """根据文件头部字节判断是否为二进制文件"""
        try:
            with open(file_path, 'rb') as f:
                sample = f.read(sample_size)
        except Exception as e:
            log.warning(f"读取文件样本失败: {file_path}, 错误: {e}")
            return False

        if not sample:
            return False

        if sample.startswith(b'\xff\xfe') or sample.startswith(b'\xfe\xff'):
            return False

        if b'\x00' in sample:
            even_nulls = sum(1 for i in range(0, len(sample), 2) if sample[i] == 0)
            odd_nulls = sum(1 for i in range(1, len(sample), 2) if sample[i] == 0)
            if max(even_nulls, odd_nulls) / max(1, len(sample) // 2) > 0.6:
                return False
            return True

        control_bytes = 0
        for b in sample:
            if b < 32 and b not in (9, 10, 13):
                control_bytes += 1

        return (control_bytes / len(sample)) > 0.1

    def _parse_chapters(self, content: str) -> List[Dict]:
        """解析章节列表"""
        max_title_len = 50
        min_gap = 40
        strong_patterns = [
            r'^第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
            r'^(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回].*$',
            r'^Chapter\s+\d+.*$',
            r'^卷[零一二三四五六七八九十百千万亿\d]+.*$',
            r'^(序章|楔子|引子|前言|后记|尾声|番外|终章|大结局).*$',
            r'^[【\[\(].+[】\]\)]$',
        ]
        weak_patterns = [
            r'^\d{1,4}[\.、]\s*.*$',
            r'^\d{1,4}\s+.*$',
        ]
        inline_strong = re.compile(
            r'(正文\s*)?第[零一二三四五六七八九十百千万亿\d]+[章节卷集部篇回][^\n]{0,40}',
            re.IGNORECASE
        )

        lines = content.split('\n')
        offsets = []
        pos = 0
        for line in lines:
            offsets.append(pos)
            pos += len(line) + 1

        candidates = []
        strong_regexes = [re.compile(p, re.IGNORECASE) for p in strong_patterns]
        weak_regexes = [re.compile(p, re.IGNORECASE) for p in weak_patterns]

        for i, raw_line in enumerate(lines):
            line = raw_line.strip()
            if not line:
                continue

            prev_blank = i == 0 or not lines[i - 1].strip()
            next_blank = i == len(lines) - 1 or not lines[i + 1].strip()
            has_blank_neighbor = prev_blank or next_blank

            found = False
            is_body_only = line in ('正文', '正文：', '正文:')

            if len(line) <= max_title_len:
                for pattern in strong_regexes:
                    if pattern.match(line):
                        candidates.append({
                            "title": line,
                            "startOffset": offsets[i],
                            "strength": 3,
                            "is_body_only": is_body_only
                        })
                        found = True
                        break

            if not found and len(line) <= max_title_len and has_blank_neighbor:
                for pattern in weak_regexes:
                    if pattern.match(line):
                        candidates.append({
                            "title": line,
                            "startOffset": offsets[i],
                            "strength": 1,
                            "is_body_only": is_body_only
                        })
                        found = True
                        break

            if not found:
                match = inline_strong.search(line)
                if match:
                    title = match.group().strip()
                    if len(title) <= max_title_len:
                        candidates.append({
                            "title": title,
                            "startOffset": offsets[i] + match.start(),
                            "strength": 2,
                            "is_body_only": False
                        })

        candidates.sort(key=lambda x: x["startOffset"])
        filtered = []
        for cand in candidates:
            if filtered and cand["startOffset"] - filtered[-1]["startOffset"] <= min_gap:
                if cand["strength"] > filtered[-1]["strength"]:
                    filtered[-1] = cand
                continue
            filtered.append(cand)

        if any(not c.get("is_body_only") for c in filtered):
            filtered = [c for c in filtered if not c.get("is_body_only")]

        chapters = []
        total_len = len(content)
        if not filtered:
            return [{
                "title": "全文",
                "startOffset": 0,
                "endOffset": total_len
            }]

        for i, match in enumerate(filtered):
            end_offset = filtered[i + 1]["startOffset"] if i < len(filtered) - 1 else total_len
            chapters.append({
                "title": match["title"],
                "startOffset": match["startOffset"],
                "endOffset": end_offset
            })

        if filtered and filtered[0]["startOffset"] > 100:
            chapters.insert(0, {
                "title": "序",
                "startOffset": 0,
                "endOffset": filtered[0]["startOffset"]
            })

        return chapters

    async def load_custom_patterns(self):
        """从数据库加载自定义规则（按优先级排序）"""
        if not self.db:
            log.debug("未提供数据库会话，跳过自定义规则加载")
            return
        
        try:
            # 查询所有活跃的规则，按优先级降序排列
            result = await self.db.execute(
                select(FilenamePattern)
                .where(FilenamePattern.is_active == True)
                .order_by(FilenamePattern.priority.desc())
            )
            patterns = result.scalars().all()
            
            self.custom_patterns = []
            for pattern in patterns:
                try:
                    # 直接使用模型字段
                    self.custom_patterns.append({
                        "regex": pattern.regex_pattern,
                        "title_group": pattern.title_group,
                        "author_group": pattern.author_group,
                        "extra_group": pattern.extra_group,
                        # 如果未来添加了tag_group字段，这里可以读取
                        "tag_group": getattr(pattern, "tag_group", 0),
                        "name": pattern.name,
                        "id": pattern.id
                    })
                    log.debug(f"加载自定义规则: {pattern.name} (优先级: {pattern.priority})")
                except Exception as e:
                    log.error(f"加载规则失败: {pattern.name}, 错误: {e}")
            
            log.info(f"成功加载 {len(self.custom_patterns)} 个自定义文件名规则")
            
        except Exception as e:
            log.error(f"加载自定义规则失败: {e}")
    
    def parse(self, file_path: Path) -> Dict[str, Optional[str]]:
        """
        解析TXT文件名
        
        Args:
            file_path: 文件路径
            
        Returns:
            包含title和author的字典
        """
        filename = file_path.name
        
        # 先尝试自定义规则（优先级更高）
        for pattern in self.custom_patterns:
            regex = pattern["regex"]
            
            try:
                if match := re.match(regex, filename):
                    title = None
                    author = None
                    extra = None
                    tags = []
                    
                    # 提取标题
                    if pattern["title_group"] > 0:
                        try:
                            title = self._normalize(match.group(pattern["title_group"]))
                        except IndexError:
                            pass
                            
                    # 提取作者
                    if pattern["author_group"] > 0:
                        try:
                            author = self._normalize(match.group(pattern["author_group"]))
                        except IndexError:
                            pass
                            
                    # 提取额外信息
                    if pattern["extra_group"] > 0:
                        try:
                            extra = self._normalize(match.group(pattern["extra_group"]))
                        except IndexError:
                            pass
                            
                    # 提取标签（如果有）
                    if pattern["tag_group"] > 0:
                        try:
                            tag_str = self._normalize(match.group(pattern["tag_group"]))
                            # 假设标签用空格或逗号分隔，或者就是单个标签
                            tags.append(tag_str)
                        except IndexError:
                            pass
                    
                    if title:
                        # 记录统计
                        if pattern["id"]:
                            self._record_match(pattern["id"], success=True)
                        
                        log.debug(f"成功解析文件名: {filename} -> 作者: {author}, 书名: {title}, 额外: {extra} (规则: {pattern['name']})")
                        
                        return {
                            "title": title,
                            "author": author,
                            "description": None,
                            "publisher": None,
                            "cover": None,
                            "extra": extra,  # 虽然models.Book没有extra字段，但可以在上层处理
                            "auto_tags": tags if tags else None
                        }
            except Exception as e:
                log.error(f"应用规则 {pattern['name']} 失败: {e}")
                if pattern["id"]:
                    self._record_match(pattern["id"], success=False)
        
        # 再尝试默认规则
        for pattern, author_group, title_group, pattern_name in self.DEFAULT_PATTERNS:
            try:
                if match := re.match(pattern, filename):
                    author = self._normalize(match.group(author_group))
                    title = self._normalize(match.group(title_group))
                    
                    log.debug(f"成功解析文件名: {filename} -> 作者: {author}, 书名: {title} (默认规则: {pattern_name})")
                    
                    return {
                        "title": title,
                        "author": author,
                        "description": None,
                        "publisher": None,
                        "cover": None,
                    }
            except Exception as e:
                log.error(f"应用默认规则 {pattern_name} 失败: {e}")
        
        # 无法解析，使用文件名作为书名
        title = file_path.stem
        log.warning(f"无法解析文件名格式: {filename}，使用文件名作为书名")
        
        return {
            "title": title,
            "author": None,
            "description": None,
            "publisher": None,
            "cover": None,
        }
    
    def _normalize(self, text: str) -> str:
        """
        标准化文本（去除首尾空格和可能的后缀）
        
        Args:
            text: 原始文本
            
        Returns:
            标准化后的文本
        """
        text = text.strip()
        # 去除可能包含在捕获组中的文件后缀
        # 这通常发生在正则写得不够严谨，或者文件名包含多重后缀时
        lower_text = text.lower()
        for ext in ['.txt', '.epub', '.mobi', '.azw3', '.zip', '.rar']:
            if lower_text.endswith(ext):
                text = text[:-len(ext)].strip()
                break
        return text
    
    def _record_match(self, pattern_id: int, success: bool):
        """
        记录规则匹配统计
        
        Args:
            pattern_id: 规则ID
            success: 是否成功提取
        """
        if pattern_id not in self.pattern_stats:
            self.pattern_stats[pattern_id] = {'matches': 0, 'successes': 0}
        
        self.pattern_stats[pattern_id]['matches'] += 1
        if success:
            self.pattern_stats[pattern_id]['successes'] += 1
    
    async def update_pattern_stats(self):
        """将统计信息更新到数据库"""
        if not self.db or not self.pattern_stats:
            return
        
        try:
            for pattern_id, stats in self.pattern_stats.items():
                result = await self.db.execute(
                    select(FilenamePattern).where(FilenamePattern.id == pattern_id)
                )
                pattern = result.scalar_one_or_none()
                
                if pattern:
                    pattern.match_count += stats['matches']
                    pattern.success_count += stats['successes']
                    
                    # 更新准确率
                    if pattern.match_count > 0:
                        pattern.accuracy_rate = pattern.success_count / pattern.match_count
                    
                    log.debug(f"更新规则统计: {pattern.name}, 匹配: {stats['matches']}, 成功: {stats['successes']}")
            
            await self.db.commit()
            self.pattern_stats.clear()  # 清空本地统计
            
        except Exception as e:
            log.error(f"更新规则统计失败: {e}")
            await self.db.rollback()
    
    def extract_description(self, content: str, max_length: int = 500) -> Optional[str]:
        """
        智能提取TXT简介
        
        采用三级策略:
        1. 提取推书人评论/书评
        2. 提取开头简介段落
        3. 使用前250字兜底
        
        Args:
            content: 书籍内容
            max_length: 简介最大长度
            
        Returns:
            提取的简介，失败返回None
        """
        if not content or len(content) < 50:
            return None
        
        # 策略1：提取推书人评论
        desc = self._extract_recommender_comment(content)
        if desc:
            return self._clean_description(desc, max_length)
        
        # 策略2：提取开头简介段落
        desc = self._extract_intro_section(content)
        if desc:
            return self._clean_description(desc, max_length)
        
        # 策略3：使用前250字兜底
        return self._fallback_description(content, 250)
    
    def _extract_recommender_comment(self, content: str) -> Optional[str]:
        """提取推书人评论"""
        # 匹配推荐理由、书评等
        patterns = [
            r'【推荐理由】(.+?)(?:【|第一章|正文|序章|\n\n\n)',
            r'【书评】(.+?)(?:【|第一章|正文|序章|\n\n\n)',
            r'【简介】(.+?)(?:【|第一章|正文|序章|\n\n\n)',
            r'【内容简介】(.+?)(?:【|第一章|正文|序章|\n\n\n)',
            r'推书人说[:：](.+?)(?:\n\n|\n第|正文)',
            r'内容介绍[:：](.+?)(?:\n\n|\n第|正文)',
        ]
        
        # 只搜索前2000字
        search_text = content[:2000]
        
        for pattern in patterns:
            match = re.search(pattern, search_text, re.DOTALL)
            if match:
                desc = match.group(1).strip()
                if 50 <= len(desc) <= 800:  # 合理的简介长度
                    log.debug(f"通过推书人评论提取到简介: {len(desc)}字")
                    return desc
        
        return None
    
    def _extract_intro_section(self, content: str) -> Optional[str]:
        """提取开头简介段落"""
        # 识别特征
        intro_keywords = ['简介', '内容介绍', '故事简介', '内容梗概', '作品简介']
        chapter_markers = ['正文', '第一章', '第1章', '序章', '楔子', 'Chapter 1', 'Chapter 01']
        
        # 搜索前2000字
        search_text = content[:2000]
        lines = search_text.split('\n')
        
        intro_start = -1
        intro_end = -1
        
        # 策略1：查找明确的简介标记
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            if any(keyword in line_stripped for keyword in intro_keywords):
                intro_start = i + 1  # 从下一行开始
                break
        
        # 策略2：如果没找到简介标记，查找"正文"、"第一章"等，提取之前的内容
        if intro_start < 0:
            for i, line in enumerate(lines):
                line_stripped = line.strip()
                # 检查是否是章节标记
                if any(marker in line_stripped for marker in chapter_markers) or \
                   (line_stripped.startswith('第') and ('章' in line_stripped or '节' in line_stripped)):
                    # 找到了章节标记，从文件开头到这里的内容可能是简介
                    intro_start = 0
                    intro_end = i
                    break
        
        if intro_start < 0:
            return None
        
        # 从简介开始位置往后找到结束
        intro_lines = []
        end_index = intro_end if intro_end > 0 else min(intro_start + 25, len(lines))
        
        for i in range(intro_start, end_index):
            line = lines[i].strip()
            
            # 如果已经设置了intro_end，就不需要再检查了
            if intro_end < 0:
                # 遇到章节标题或明显的正文标记停止
                if any(marker in line for marker in chapter_markers) or \
                   (line.startswith('第') and ('章' in line or '节' in line)) or \
                   line.startswith('Chapter'):
                    break
            
            # 跳过常见的文件头信息
            if i == intro_start and any(skip in line for skip in ['来源:', '来源：', '转载', 'vip', 'VIP', 'QQ群', 'www.', 'http']):
                continue
            
            if line:  # 非空行
                intro_lines.append(line)
        
        if intro_lines:
            desc = '\n'.join(intro_lines)
            # 放宽长度要求，允许更短的简介
            if 30 <= len(desc) <= 1000:
                log.debug(f"通过简介段落提取到简介: {len(desc)}字")
                return desc
        
        return None
    
    def _fallback_description(self, content: str, length: int = 250) -> str:
        """兜底方案：使用前N字"""
        # 跳过可能的文件头信息
        start_pos = 0
        
        # 跳过常见的文件头标记
        header_patterns = [
            r'^.*?(?:【|『|\[).*?(?:】|』|\]).*?\n',  # 跳过【xxx】这类标记
            r'^.*?来源[:：].*?\n',
            r'^.*?转载.*?\n',
        ]
        
        for pattern in header_patterns:
            match = re.match(pattern, content, re.MULTILINE)
            if match:
                start_pos = match.end()
        
        # 提取内容
        text = content[start_pos:start_pos + length * 2]  # 多取一些以防截断
        
        # 清理并截断
        text = text.strip()
        if len(text) > length:
            # 尝试在句号处截断
            sentences = text[:length + 50].split('。')
            if len(sentences) > 1:
                text = '。'.join(sentences[:-1]) + '。'
            else:
                text = text[:length]
        
        text = text + "..." if len(content) > start_pos + length else text
        
        log.debug(f"使用兜底方案提取简介: {len(text)}字")
        return text
    
    def _clean_description(self, text: str, max_length: int) -> str:
        """清理简介文本"""
        # 移除多余空白
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        # 过滤常见广告语
        ad_patterns = [
            r'.*?(?:vip|VIP).*?(?:群|QQ).*?\d+',
            r'.*?(?:下载|阅读).*?(?:www|http)',
            r'.*?更新最快.*?',
            r'.*?笔趣阁.*?',
        ]
        
        for pattern in ad_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        
        # 限制长度
        if len(text) > max_length:
            # 在句号处截断
            sentences = text[:max_length + 50].split('。')
            if len(sentences) > 1:
                text = '。'.join(sentences[:-1]) + '。'
            else:
                text = text[:max_length] + '...'
        
        return text.strip()
