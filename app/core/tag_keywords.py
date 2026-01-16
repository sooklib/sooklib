"""
标签关键词库
用于从文件名和内容自动提取标签
"""

# 内置标签关键词库
TAG_KEYWORDS = {
    "题材": {
        "玄幻": ["玄幻", "修仙", "修真", "仙侠", "异世", "洪荒"],
        "都市": ["都市", "现代", "都市言情", "都市异能"],
        "科幻": ["科幻", "星际", "未来", "机甲", "末日", "赛博"],
        "历史": ["历史", "架空历史", "古代"],
        "武侠": ["武侠", "江湖", "武林"],
        "游戏": ["游戏", "网游", "电竞", "游戏竞技"],
        "奇幻": ["奇幻", "西幻", "魔法", "剑与魔法"],
        "悬疑": ["悬疑", "推理", "侦探", "探案"],
        "灵异": ["灵异", "恐怖", "惊悚", "鬼怪"],
        "二次元": ["二次元", "动漫", "漫改"],
    },
    "元素": {
        "重生": ["重生", "再世", "转生"],
        "穿越": ["穿越", "穿书", "穿成"],
        "系统": ["系统", "金手指", "外挂"],
        "末世": ["末世", "末日", "丧尸", "灾难", "废土"],
        "无限流": ["无限流", "无限", "主神"],
        "快穿": ["快穿", "快速穿越"],
        "宫斗": ["宫斗", "宅斗", "宫廷"],
        "种田": ["种田", "经营", "基建"],
        "直播": ["直播", "网红"],
        "娱乐圈": ["娱乐圈", "明星", "演员"],
    },
    "风格": {
        "爽文": ["爽文", "打脸", "碾压", "无敌"],
        "虐文": ["虐文", "虐心", "be"],
        "甜文": ["甜文", "甜宠", "he", "双洁"],
        "轻松": ["轻松", "日常", "温馨"],
        "搞笑": ["搞笑", "沙雕", "幽默"],
        "暗黑": ["暗黑", "黑暗", "反派"],
        "热血": ["热血", "燃"],
        "治愈": ["治愈", "暖心"],
    },
    "受众": {
        "男频": ["男主", "男频", "龙傲天"],
        "女频": ["女主", "女频", "言情", "耽美", "百合"],
        "轻小说": ["轻小说", "轻改", "ライトノベル"],
        "网文": ["网文", "网络小说"],
    },
    "完结状态": {
        "完结": ["完结", "完本", "全本"],
        "连载": ["连载中", "未完结"],
    },
    "特殊标记": {
        "精校": ["精校", "校对", "修正版"],
        "TXT": ["txt", "文本"],
        "EPUB": ["epub"],
    }
}


def get_tags_from_filename(filename: str) -> list[str]:
    """
    从文件名提取标签
    
    Args:
        filename: 文件名（不含路径）
        
    Returns:
        标签列表
    """
    tags = []
    filename_lower = filename.lower()
    
    # 遍历所有分类
    for category, tag_dict in TAG_KEYWORDS.items():
        for tag_name, keywords in tag_dict.items():
            # 检查是否匹配任意关键词
            if any(keyword.lower() in filename_lower for keyword in keywords):
                tags.append(tag_name)
    
    # 去重
    return list(set(tags))


def get_tags_from_content(content: str, max_length: int = 1000) -> list[str]:
    """
    从内容前部提取标签
    
    Args:
        content: 书籍内容
        max_length: 分析的最大长度
        
    Returns:
        标签列表
    """
    tags = []
    preview = content[:max_length].lower()
    
    # 只从部分分类提取（避免误判）
    target_categories = ["元素", "风格", "题材"]
    
    for category in target_categories:
        if category in TAG_KEYWORDS:
            tag_dict = TAG_KEYWORDS[category]
            for tag_name, keywords in tag_dict.items():
                # 内容匹配需要更严格
                if any(keyword.lower() in preview for keyword in keywords):
                    tags.append(tag_name)
    
    # 去重
    return list(set(tags))


def get_all_tag_names() -> list[str]:
    """
    获取所有内置标签名称
    
    Returns:
        所有标签名称列表
    """
    all_tags = []
    for category, tag_dict in TAG_KEYWORDS.items():
        all_tags.extend(tag_dict.keys())
    return all_tags


def get_tags_by_category(category: str) -> dict[str, list[str]]:
    """
    获取指定分类的标签
    
    Args:
        category: 分类名称
        
    Returns:
        标签字典
    """
    return TAG_KEYWORDS.get(category, {})


def get_all_categories() -> list[str]:
    """
    获取所有分类名称
    
    Returns:
        分类名称列表
    """
    return list(TAG_KEYWORDS.keys())
