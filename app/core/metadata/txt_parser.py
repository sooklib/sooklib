"""
TXT文件名解析器
从文件名提取作者和书名信息
支持动态规则加载和统计
同时提供简介智能提取功能
"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FilenamePattern
from app.utils.logger import log


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
                # 解析 regex_pattern，假设格式为 "regex|author_group|title_group"
                # 例如: "^(.+?)[-_](.+?)\.txt$|1|2"
                try:
                    parts = pattern.regex_pattern.split('|')
                    if len(parts) >= 3:
                        regex = parts[0]
                        author_group = int(parts[1])
                        title_group = int(parts[2])
                        self.custom_patterns.append((
                            regex,
                            author_group,
                            title_group,
                            pattern.name,
                            pattern.id
                        ))
                        log.debug(f"加载自定义规则: {pattern.name} (优先级: {pattern.priority})")
                except (ValueError, IndexError) as e:
                    log.error(f"解析规则失败: {pattern.name}, 错误: {e}")
            
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
        for pattern_data in self.custom_patterns:
            regex = pattern_data[0]
            author_group = pattern_data[1]
            title_group = pattern_data[2]
            pattern_name = pattern_data[3]
            pattern_id = pattern_data[4] if len(pattern_data) > 4 else None
            
            try:
                if match := re.match(regex, filename):
                    author = self._normalize(match.group(author_group))
                    title = self._normalize(match.group(title_group))
                    
                    # 记录统计
                    if pattern_id:
                        self._record_match(pattern_id, success=True)
                    
                    log.debug(f"成功解析文件名: {filename} -> 作者: {author}, 书名: {title} (规则: {pattern_name})")
                    
                    return {
                        "title": title,
                        "author": author,
                        "description": None,
                        "publisher": None,
                        "cover": None,
                    }
            except Exception as e:
                log.error(f"应用规则 {pattern_name} 失败: {e}")
                if pattern_id:
                    self._record_match(pattern_id, success=False)
        
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
        标准化文本（去除首尾空格）
        
        Args:
            text: 原始文本
            
        Returns:
            标准化后的文本
        """
        return text.strip()
    
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
        
        # 搜索前1500字
        search_text = content[:1500]
        lines = search_text.split('\n')
        
        intro_start = -1
        intro_end = -1
        
        # 查找简介开始位置
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            if any(keyword in line_stripped for keyword in intro_keywords):
                intro_start = i + 1  # 从下一行开始
                break
        
        if intro_start < 0:
            return None
        
        # 从简介开始位置往后找到结束
        intro_lines = []
        for i in range(intro_start, min(intro_start + 20, len(lines))):
            line = lines[i].strip()
            
            # 遇到章节标题或明显的正文标记停止
            if (line.startswith('第') and ('章' in line or '节' in line)) or \
               line.startswith('Chapter') or \
               line.startswith('序章') or \
               line.startswith('楔子') or \
               line.startswith('正文'):
                break
            
            if line:  # 非空行
                intro_lines.append(line)
        
        if intro_lines:
            desc = '\n'.join(intro_lines)
            if 50 <= len(desc) <= 800:
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
