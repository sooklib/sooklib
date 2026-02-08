"""
OPDS Feed 生成器
用于构建符合 OPDS 1.2 规范的 Atom Feed
"""
from datetime import datetime
import re
from typing import List, Optional
from urllib.parse import quote

from app.models import Author, Book, BookVersion
from app.utils.logger import log


_INVALID_XML_CHARS = re.compile(
    r"[\x00-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]"
)


def _sanitize_xml_text(value: str) -> str:
    """清理 XML 1.0 不允许的字符，避免 OPDS 输出导致编码异常。"""
    if not value:
        return ""
    return _INVALID_XML_CHARS.sub("", value)


def escape_xml(text: str) -> str:
    """转义 XML 特殊字符，并清理非法字符。"""
    if not text:
        return ""
    if isinstance(text, bytes):
        text = text.decode("utf-8", errors="replace")
    safe_text = _sanitize_xml_text(str(text))
    return (safe_text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))


def format_datetime(dt: Optional[datetime]) -> str:
    """格式化日期时间为 ISO 8601 格式"""
    if not dt:
        dt = datetime.utcnow()
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def get_primary_version(book: Book) -> Optional[BookVersion]:
    """获取书籍主版本，兜底选择最新版本"""
    if not book.versions:
        return None
    primary = next((v for v in book.versions if v.is_primary), None)
    if primary:
        return primary
    return max(book.versions, key=lambda v: v.added_at or datetime.min)


def build_opds_root(base_url: str) -> str:
    """
    构建 OPDS 根目录 Feed
    
    Args:
        base_url: 应用基础 URL (例如 http://localhost:8080)
    
    Returns:
        OPDS XML 字符串
    """
    now = format_datetime(datetime.utcnow())
    
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/static/opds.xsl"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>{base_url}/opds</id>
  <title>小说书库</title>
  <updated>{now}</updated>
  <icon>{base_url}/icons/icon-144x144.png</icon>
  
  <link rel="self" href="{base_url}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="{base_url}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="{base_url}/opds/search_descriptor" type="application/opensearchdescription+xml" title="Search"/>
  
  <entry>
    <title>最新书籍</title>
    <id>{base_url}/opds/recent</id>
    <updated>{now}</updated>
    <link rel="subsection" href="{base_url}/opds/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">浏览最新添加的书籍</content>
  </entry>

  <entry>
    <title>书库</title>
    <id>{base_url}/opds/libraries</id>
    <updated>{now}</updated>
    <link rel="subsection" href="{base_url}/opds/libraries" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
    <content type="text">按书库浏览书籍</content>
  </entry>
  
  <entry>
    <title>作者索引</title>
    <id>{base_url}/opds/authors</id>
    <updated>{now}</updated>
    <link rel="subsection" href="{base_url}/opds/authors" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
    <content type="text">按作者浏览书籍</content>
  </entry>
  
  <entry>
    <title>搜索</title>
    <id>{base_url}/opds/search</id>
    <updated>{now}</updated>
    <link rel="search" href="{base_url}/opds/search?q={{searchTerms}}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">搜索书籍</content>
  </entry>
</feed>'''
    
    return xml


def build_opds_entry(book: Book, base_url: str, author_name: Optional[str] = None) -> str:
    """
    构建单个书籍的 OPDS Entry
    
    Args:
        book: 书籍对象
        base_url: 应用基础 URL
        author_name: 作者名称（可选，如果已加载）
    
    Returns:
        OPDS Entry XML 片段
    """
    title = escape_xml(book.title)
    author = escape_xml(author_name or (book.author.name if book.author else "未知作者"))
    description = escape_xml(book.description or "暂无简介")
    updated = format_datetime(book.added_at)
    
    primary_version = get_primary_version(book)
    file_format = (primary_version.file_format if primary_version and primary_version.file_format else "unknown")
    file_format = str(file_format).lower()
    file_size = primary_version.file_size if primary_version and primary_version.file_size else 0

    # 确定 MIME 类型
    mime_types = {
        'epub': 'application/epub+zip',
        'mobi': 'application/x-mobipocket-ebook',
        'azw': 'application/vnd.amazon.ebook',
        'azw3': 'application/vnd.amazon.ebook',
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'cbz': 'application/vnd.comicbook+zip',
        'cbr': 'application/vnd.comicbook-rar',
    }
    mime_type = mime_types.get(file_format, 'application/octet-stream')
    
    # 构建下载链接
    download_link = f"{base_url}/opds/download/{book.id}"
    cover_link = f"{base_url}/api/books/{book.id}/cover"
    
    # 格式化文件大小
    if file_size:
        size_mb = file_size / (1024 * 1024)
        size_str = f"{size_mb:.2f} MB"
    else:
        size_str = "未知"
    
    entry = f'''  <entry>
    <title>{title}</title>
    <id>{base_url}/opds/books/{book.id}</id>
    <author>
      <name>{author}</name>
    </author>
    <updated>{updated}</updated>
    <published>{updated}</published>
    <summary type="text">{description}</summary>
    
    <link rel="http://opds-spec.org/acquisition" 
          href="{download_link}" 
          type="{mime_type}"
          title="下载 {escape_xml(file_format.upper())}"/>
    
    <link rel="http://opds-spec.org/image" 
          href="{cover_link}" 
          type="image/jpeg"/>
    
    <link rel="http://opds-spec.org/image/thumbnail" 
          href="{cover_link}" 
          type="image/jpeg"/>
    
    <category term="{escape_xml(file_format)}" label="格式"/>
'''
    
    # 添加内容分级
    if book.age_rating:
        entry += f'    <category term="{escape_xml(book.age_rating)}" label="分级"/>\n'
    
    # 添加文件信息
    entry += f'''    <content type="text">格式: {escape_xml(file_format.upper())} | 大小: {size_str}</content>
  </entry>
'''
    
    return entry


def build_opds_acquisition_feed(
    books: List[Book],
    title: str,
    feed_id: str,
    base_url: str,
    page: int = 1,
    total_pages: int = 1,
    self_link: str = None
) -> str:
    """
    构建书籍列表 Acquisition Feed
    
    Args:
        books: 书籍列表
        title: Feed 标题
        feed_id: Feed ID
        base_url: 应用基础 URL
        page: 当前页码
        total_pages: 总页数
        self_link: 当前页链接
    
    Returns:
        OPDS XML 字符串
    """
    now = format_datetime(datetime.utcnow())
    
    # 构建分页链接
    pagination_links = ""
    if self_link:
        pagination_links += f'  <link rel="self" href="{self_link}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n'
    
    if page > 1:
        prev_link = self_link.replace(f"page={page}", f"page={page-1}") if "page=" in self_link else f"{self_link}?page={page-1}"
        pagination_links += f'  <link rel="previous" href="{prev_link}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n'
    
    if page < total_pages:
        next_link = self_link.replace(f"page={page}", f"page={page+1}") if "page=" in self_link else f"{self_link}?page={page+1}"
        pagination_links += f'  <link rel="next" href="{next_link}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n'
    
    # 构建 Feed
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/static/opds.xsl"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>{feed_id}</id>
  <title>{escape_xml(title)}</title>
  <updated>{now}</updated>
  
  <link rel="start" href="{base_url}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
{pagination_links}
'''
    
    # 添加书籍条目
    if books:
        for book in books:
            try:
                xml += build_opds_entry(book, base_url)
            except Exception as exc:
                log.warning(f"OPDS 构建条目失败: book_id={getattr(book, 'id', None)} err={exc}")
    else:
        xml += '''  <entry>
    <title>暂无书籍</title>
    <id>urn:uuid:no-books</id>
    <updated>{}</updated>
    <content type="text">当前没有可用的书籍</content>
  </entry>
'''.format(now)
    
    xml += '</feed>'
    
    return xml


def build_opds_navigation_feed(
    entries: List[dict],
    title: str,
    feed_id: str,
    base_url: str
) -> str:
    """
    构建导航 Feed (例如作者列表)
    
    Args:
        entries: 导航条目列表，每个条目包含 {title, link, updated, content}
        title: Feed 标题
        feed_id: Feed ID
        base_url: 应用基础 URL
    
    Returns:
        OPDS XML 字符串
    """
    now = format_datetime(datetime.utcnow())
    
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/static/opds.xsl"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>{feed_id}</id>
  <title>{escape_xml(title)}</title>
  <updated>{now}</updated>
  
  <link rel="self" href="{feed_id}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="{base_url}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  
'''
    
    # 添加导航条目
    for entry in entries:
        entry_title = escape_xml(entry.get('title', ''))
        entry_link = entry.get('link', '')
        entry_updated = entry.get('updated', now)
        entry_content = escape_xml(entry.get('content', ''))
        entry_id = entry.get('id', entry_link)
        
        xml += f'''  <entry>
    <title>{entry_title}</title>
    <id>{entry_id}</id>
    <updated>{entry_updated}</updated>
    <link rel="subsection" href="{entry_link}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">{entry_content}</content>
  </entry>
  
'''
    
    xml += '</feed>'
    
    return xml


def build_opds_search_descriptor(base_url: str) -> str:
    """
    构建 OpenSearch 描述文档
    
    Args:
        base_url: 应用基础 URL
    
    Returns:
        OpenSearch XML 字符串
    """
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Sooklib Search</ShortName>
  <Description>Search for books in Sooklib</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
       template="{base_url}/opds/search?q={{searchTerms}}"/>
</OpenSearchDescription>'''
    
    return xml
