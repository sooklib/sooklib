"""
MOBI/AZW3元数据解析器
从MOBI文件中提取元数据和封面
"""
from pathlib import Path
from typing import Dict, Optional
import shutil
import os

from app.config import settings
from app.utils.logger import log


class MobiParser:
    """MOBI/AZW3文件解析器"""
    
    def parse(self, file_path: Path) -> Dict[str, Optional[str]]:
        """
        解析MOBI/AZW3文件元数据
        
        Args:
            file_path: MOBI文件路径
            
        Returns:
            包含元数据的字典
        """
        try:
            # 尝试使用mobi库解析
            import mobi
            
            tempdir, filepath = mobi.extract(str(file_path))
            
            # 读取OPF文件获取元数据
            opf_file = None
            for root, dirs, files in os.walk(tempdir):
                for file in files:
                    if file.endswith('.opf'):
                        opf_file = os.path.join(root, file)
                        break
                if opf_file:
                    break
            
            metadata = {}
            if opf_file:
                metadata = self._parse_opf(opf_file)
            else:
                # 使用文件名作为默认值
                metadata = {
                    "title": file_path.stem,
                    "author": None,
                    "description": None,
                    "publisher": None,
                }
            
            # 尝试提取封面
            cover_path = self._extract_cover(tempdir, file_path)
            metadata["cover"] = cover_path
            
            # 清理临时文件
            shutil.rmtree(tempdir, ignore_errors=True)
            
            log.info(f"成功解析MOBI: {file_path.name} -> {metadata.get('title', file_path.stem)}")
            return metadata
                
        except Exception as e:
            log.warning(f"MOBI解析失败，使用文件名: {file_path}, 错误: {e}")
            # 解析失败时返回基本信息
            return {
                "title": file_path.stem,
                "author": None,
                "description": None,
                "publisher": None,
                "cover": None,
            }
    
    def _parse_opf(self, opf_path: str) -> Dict[str, Optional[str]]:
        """
        解析OPF文件获取元数据
        
        Args:
            opf_path: OPF文件路径
            
        Returns:
            元数据字典
        """
        try:
            import xml.etree.ElementTree as ET
            
            tree = ET.parse(opf_path)
            root = tree.getroot()
            
            # 定义命名空间
            ns = {'dc': 'http://purl.org/dc/elements/1.1/',
                  'opf': 'http://www.idpf.org/2007/opf'}
            
            # 提取元数据
            title_elem = root.find('.//dc:title', ns)
            title = title_elem.text if title_elem is not None else None
            
            creator_elem = root.find('.//dc:creator', ns)
            author = creator_elem.text if creator_elem is not None else None
            
            publisher_elem = root.find('.//dc:publisher', ns)
            publisher = publisher_elem.text if publisher_elem is not None else None
            
            description_elem = root.find('.//dc:description', ns)
            description = description_elem.text if description_elem is not None else None
            
            return {
                "title": title,
                "author": author,
                "description": description,
                "publisher": publisher,
            }
            
        except Exception as e:
            log.error(f"解析OPF文件失败: {opf_path}, 错误: {e}")
            return {
                "title": None,
                "author": None,
                "description": None,
                "publisher": None,
            }
    
    def _extract_cover(self, tempdir: str, file_path: Path) -> Optional[str]:
        """
        从MOBI解压目录中提取封面
        
        Args:
            tempdir: 临时解压目录
            file_path: 原始MOBI文件路径
            
        Returns:
            封面图片保存路径，如果没有封面返回None
        """
        try:
            from PIL import Image
            from io import BytesIO
            
            # 查找封面图片
            cover_image_path = None
            
            # 方法1: 查找常见封面文件名
            for root, dirs, files in os.walk(tempdir):
                for file in files:
                    file_lower = file.lower()
                    if any(name in file_lower for name in ['cover', 'jacket']):
                        if file_lower.endswith(('.jpg', '.jpeg', '.png', '.gif')):
                            cover_image_path = os.path.join(root, file)
                            break
                if cover_image_path:
                    break
            
            # 方法2: 如果没找到，查找第一张图片（通常是封面）
            if not cover_image_path:
                for root, dirs, files in os.walk(tempdir):
                    for file in files:
                        if file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
                            cover_image_path = os.path.join(root, file)
                            break
                    if cover_image_path:
                        break
            
            if not cover_image_path:
                log.debug(f"未找到MOBI封面: {file_path.name}")
                return None
            
            # 保存封面
            cover_dir = Path(settings.directories.covers)
            cover_dir.mkdir(parents=True, exist_ok=True)
            
            # 使用文件hash作为封面文件名
            from app.utils.file_hash import calculate_file_hash
            file_hash = calculate_file_hash(file_path)
            cover_save_path = cover_dir / f"{file_hash}.jpg"
            
            # 转换并保存为JPG
            img = Image.open(cover_image_path)
            img = img.convert('RGB')
            img.save(cover_save_path, 'JPEG', quality=85)
            
            log.debug(f"提取MOBI封面: {cover_save_path}")
            return str(cover_save_path)
            
        except Exception as e:
            log.warning(f"提取MOBI封面失败: {file_path}, 错误: {e}")
            return None

    def extract_text(
        self,
        file_path: Path,
        max_chars: int = 5_000_000,
        max_file_bytes: int = 200 * 1024 * 1024,
        max_html_bytes: int = 2 * 1024 * 1024
    ) -> Optional[str]:
        """
        从MOBI/AZW3文件中提取纯文本内容
        """
        try:
            import mobi
            from bs4 import BeautifulSoup
            
            file_path = Path(file_path)
            try:
                file_size = file_path.stat().st_size
                if file_size > max_file_bytes:
                    log.warning(
                        f"MOBI文件过大，跳过提取: {file_path.name}, "
                        f"{file_size / 1024 / 1024:.2f} MB"
                    )
                    return None
            except Exception as e:
                log.warning(f"读取MOBI文件大小失败: {file_path}, 错误: {e}")

            log.info(f"开始提取MOBI文本: {file_path}")
            
            # 解压
            # mobi.extract 返回 (tempdir, filepath)
            tempdir, filepath = mobi.extract(str(file_path))
            content_parts = []
            html_files = []
            total_chars = 0
            truncated = False

            def append_text(text: str) -> bool:
                nonlocal total_chars, truncated
                if not text:
                    return True
                text = text.strip()
                if not text:
                    return True

                remaining = max_chars - total_chars if max_chars else None
                if remaining is not None and remaining <= 0:
                    truncated = True
                    return False

                if remaining is not None and len(text) > remaining:
                    content_parts.append(text[:remaining])
                    total_chars = max_chars
                    truncated = True
                    return False

                content_parts.append(text)
                total_chars += len(text)
                return True

            def read_text_file(path: str) -> str:
                try:
                    size = os.path.getsize(path)
                    if max_html_bytes and size > max_html_bytes:
                        log.warning(f"HTML文件过大，截断读取: {path}")
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        return f.read(max_html_bytes) if max_html_bytes else f.read()
                except Exception as e:
                    log.warning(f"读取HTML文件失败 {path}: {e}")
                    return ""
            
            log.debug(f"MOBI解压目录: {tempdir}, 主文件路径: {filepath}")
            
            try:
                # 方法1: 尝试读取主文件
                if filepath and os.path.isfile(filepath):
                    log.debug(f"尝试读取主文件: {filepath}")
                    try:
                        raw_content = read_text_file(filepath)
                        if raw_content.strip():
                            soup = BeautifulSoup(raw_content, 'html.parser')
                            text = soup.get_text(separator='\n')
                            if append_text(text):
                                log.debug(f"从主文件提取到 {len(text)} 字符")
                            else:
                                log.warning(f"MOBI文本过长，已截断: {file_path.name}")
                    except Exception as e:
                        log.warning(f"读取主文件失败: {e}")
                
                # 方法2: 如果主文件为空或不存在，扫描所有HTML文件
                if total_chars == 0:
                    log.debug("主文件为空，扫描目录中的HTML文件")
                    for root, dirs, files in os.walk(tempdir):
                        for file in sorted(files):  # 排序保证顺序
                            if file.lower().endswith(('.html', '.htm', '.xhtml')):
                                html_path = os.path.join(root, file)
                                html_files.append(html_path)
                    
                    log.debug(f"找到 {len(html_files)} 个HTML文件")
                    
                    for html_path in html_files:
                        raw_html = read_text_file(html_path)
                        if not raw_html:
                            continue
                        soup = BeautifulSoup(raw_html, 'html.parser')

                        # 移除script和style标签
                        for script in soup(['script', 'style', 'head']):
                            script.decompose()

                        text = soup.get_text(separator='\n')
                        if not append_text(text):
                            log.warning(f"MOBI文本过长，已截断: {file_path.name}")
                            break

                    if content_parts:
                        log.debug(f"从 {len(content_parts)} 段HTML内容合并提取到 {total_chars} 字符")
                
                # 方法3: 查找纯文本文件
                if total_chars == 0:
                    log.debug("尝试查找纯文本文件")
                    for root, dirs, files in os.walk(tempdir):
                        for file in files:
                            if file.lower().endswith('.txt'):
                                txt_path = os.path.join(root, file)
                                try:
                                    with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
                                        text = f.read(max_chars if max_chars else None)
                                        if append_text(text):
                                            log.debug(f"从TXT文件提取到 {len(text)} 字符")
                                        else:
                                            log.warning(f"MOBI文本过长，已截断: {file_path.name}")
                                        break
                                except:
                                    continue
                        if content_parts:
                            break
                
            finally:
                # 清理临时文件
                shutil.rmtree(tempdir, ignore_errors=True)
            
            if content_parts:
                content = '\n\n'.join(content_parts).strip()
                if truncated:
                    content = f"{content}\n\n[内容过长，已截断]"
                log.info(f"成功提取MOBI文本: {file_path.name}, 共 {len(content)} 字符")
                return content
            else:
                log.warning(f"MOBI文本提取结果为空: {file_path}")
                return None
            
        except ImportError:
            log.error("未安装 mobi 或 beautifulsoup4，请运行: pip install mobi beautifulsoup4")
            return None
        except Exception as e:
            log.error(f"提取MOBI文本失败: {file_path}, 错误: {e}", exc_info=True)
            return None


def extract_text_in_subprocess(
    file_path: str,
    max_chars: int = 5_000_000,
    max_file_bytes: int = 200 * 1024 * 1024,
    max_html_bytes: int = 2 * 1024 * 1024
) -> Optional[str]:
    """在子进程中提取MOBI文本，避免主进程崩溃"""
    parser = MobiParser()
    return parser.extract_text(
        Path(file_path),
        max_chars=max_chars,
        max_file_bytes=max_file_bytes,
        max_html_bytes=max_html_bytes
    )
