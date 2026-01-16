import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:intl/intl.dart';
import '../services/api_client.dart';
import '../services/storage_service.dart';

/// 书签信息
class BookmarkInfo {
  final int id;
  final String position;
  final String? chapterTitle;
  final String? note;
  final DateTime createdAt;
  
  BookmarkInfo({
    required this.id,
    required this.position,
    this.chapterTitle,
    this.note,
    required this.createdAt,
  });
  
  factory BookmarkInfo.fromJson(Map<String, dynamic> json) {
    return BookmarkInfo(
      id: json['id'] as int,
      position: json['position'] as String,
      chapterTitle: json['chapter_title'] as String?,
      note: json['note'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

/// 章节信息
class Chapter {
  final String title;
  final int startIndex;
  final int endIndex;
  
  Chapter({required this.title, required this.startIndex, this.endIndex = -1});
  
  Chapter copyWith({int? endIndex}) {
    return Chapter(
      title: title,
      startIndex: startIndex,
      endIndex: endIndex ?? this.endIndex,
    );
  }
}

/// 翻页模式
enum PageMode {
  scroll,  // 滚动模式
  tap,     // 点击翻页
  slide,   // 滑动翻页
}

/// 可用字体列表
class FontOption {
  final String name;
  final String displayName;
  final String? preview;
  
  const FontOption({
    required this.name,
    required this.displayName,
    this.preview,
  });
}

const List<FontOption> availableFonts = [
  FontOption(name: 'default', displayName: '系统默认', preview: '春风又绿江南岸'),
  FontOption(name: 'serif', displayName: '衬线体', preview: '春风又绿江南岸'),
  FontOption(name: 'sans-serif', displayName: '无衬线', preview: '春风又绿江南岸'),
  FontOption(name: 'Georgia', displayName: 'Georgia', preview: 'The quick brown fox'),
  FontOption(name: 'Times New Roman', displayName: 'Times New Roman', preview: 'The quick brown fox'),
  FontOption(name: 'Courier New', displayName: 'Courier New', preview: 'The quick brown fox'),
  // Google Fonts (需要在 web/index.html 中引入)
  FontOption(name: 'Noto Sans SC', displayName: '思源黑体', preview: '春风又绿江南岸'),
  FontOption(name: 'Noto Serif SC', displayName: '思源宋体', preview: '春风又绿江南岸'),
  FontOption(name: 'LXGW WenKai', displayName: '霞鹜文楷', preview: '春风又绿江南岸'),
  FontOption(name: 'Ma Shan Zheng', displayName: '马善政楷体', preview: '春风又绿江南岸'),
];

/// 章节解析结果
class ChapterParseResult {
  final List<Chapter> chapters;
  final List<String> lines;
  final List<int> lineStartIndices;
  
  ChapterParseResult({
    required this.chapters,
    required this.lines,
    required this.lineStartIndices,
  });
}

/// 在后台线程解析章节（用于大文件）
ChapterParseResult _parseChaptersIsolate(String content) {
  final chapters = <Chapter>[];
  
  // 增强的章节识别正则模式（按优先级排序）
  final patterns = [
    // === 高优先级：明确的章节标记 ===
    
    // 中文章节：第X章/节/卷/部/回/集/篇（带可选标题）
    RegExp(r'^[　\s]*第[一二三四五六七八九十百千万零〇0-9１２３４５６７８９０]+[章节卷部回集篇幕话][　\s：:—\-]*.{0,60}$', multiLine: true),
    
    // 带括号的章节：【第X章】《第X章》「第X章」
    RegExp(r'^[　\s]*[【\[《「]第[一二三四五六七八九十百千万零〇0-9１２３４５６７８９０]+[章节卷部回集篇][】\]》」][　\s：:]*.*$', multiLine: true),
    
    // 序章、楔子、尾声等特殊章节
    RegExp(r'^[　\s]*(序章|序幕|序言|楔子|引子|引言|前言|前传|后记|后传|尾声|番外|番外篇|终章|终幕|完结|大结局|全文完)[　\s：:\d]*.*$', multiLine: true),
    
    // === 中优先级：常见格式 ===
    
    // 英文 Chapter/Part/Book/Episode/Volume
    RegExp(r'^[　\s]*(Chapter|Part|Book|Section|Episode|Volume|Prologue|Epilogue)\s*[:\-]?\s*\d*[　\s:.\-]*.*$', multiLine: true, caseSensitive: false),
    
    // 纯数字编号格式：1. xxx 或 1、xxx 或 001 xxx
    RegExp(r'^[　\s]*(\d{1,4})[\.、\s]\s*[\u4e00-\u9fa5].{2,50}$', multiLine: true),
    
    // 中文数字编号：一、xxx 二、xxx
    RegExp(r'^[　\s]*[一二三四五六七八九十百]+[、\.][　\s]*.{2,50}$', multiLine: true),
    
    // 卷/部标题（独立）
    RegExp(r'^[　\s]*(卷|部|篇|册)[一二三四五六七八九十百千万零〇0-9]+[　\s：:].{0,50}$', multiLine: true),
    
    // === 低优先级：宽松匹配 ===
    
    // 更宽松的"第X章"格式
    RegExp(r'^[　\s]*第\s*[0-9]+\s*[章节回话].{0,60}$', multiLine: true),
    
    // 带分隔线的章节标题
    RegExp(r'^[　\s]*[-=_]{3,}[　\s]*[\u4e00-\u9fa5].{2,30}[　\s]*[-=_]{3,}[　\s]*$', multiLine: true),
    
    // 章节标题单独一行（短标题，中文开头）
    RegExp(r'^[　\s]*(第[一二三四五六七八九十百千万零〇0-9]+[章节回])[　\s]*$', multiLine: true),
  ];
  
  // 收集所有匹配的章节
  final allMatches = <MapEntry<int, String>>[];
  
  for (final pattern in patterns) {
    final matches = pattern.allMatches(content);
    for (final match in matches) {
      final title = match.group(0)!.trim();
      // 过滤掉太短或太长的标题
      if (title.length >= 2 && title.length <= 60) {
        // 检查是否已存在相同位置的章节（去重）
        final exists = allMatches.any((e) => (e.key - match.start).abs() < 10);
        if (!exists) {
          allMatches.add(MapEntry(match.start, title));
        }
      }
    }
  }
  
  // 按位置排序
  allMatches.sort((a, b) => a.key.compareTo(b.key));
  
  // 转换为 Chapter 对象
  for (int i = 0; i < allMatches.length; i++) {
    final match = allMatches[i];
    final endIndex = i + 1 < allMatches.length ? allMatches[i + 1].key : content.length;
    chapters.add(Chapter(
      title: match.value,
      startIndex: match.key,
      endIndex: endIndex,
    ));
  }
  
  // 如果没有找到章节，创建一个默认章节
  if (chapters.isEmpty) {
    chapters.add(Chapter(title: '正文', startIndex: 0, endIndex: content.length));
  }
  
  // 将内容按行分割用于虚拟滚动
  final lines = <String>[];
  final lineStartIndices = <int>[];
  
  int currentIndex = 0;
  final contentLines = content.split('\n');
  for (final line in contentLines) {
    lines.add(line);
    lineStartIndices.add(currentIndex);
    currentIndex += line.length + 1; // +1 for newline
  }
  
  return ChapterParseResult(
    chapters: chapters,
    lines: lines,
    lineStartIndices: lineStartIndices,
  );
}

class ReaderScreen extends StatefulWidget {
  final int bookId;

  const ReaderScreen({super.key, required this.bookId});

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> with WidgetsBindingObserver {
  late StorageService _storage;
  late ApiClient _apiClient;
  
  String? _bookTitle;
  String? _content;
  bool _isLoading = true;
  bool _isParsing = false;
  bool _isRestoringProgress = false;
  String? _errorMessage;
  
  // 行数据（用于虚拟滚动）
  List<String> _lines = [];
  List<int> _lineStartIndices = [];
  
  // 阅读器设置
  double _fontSize = 18.0;
  double _lineHeight = 1.8;
  String _theme = 'dark';
  String _fontFamily = 'default';
  bool _showSettings = false;
  bool _showChapters = false;
  bool _showControls = true;
  PageMode _pageMode = PageMode.scroll;
  
  // 章节目录
  List<Chapter> _chapters = [];
  int _currentChapterIndex = 0;
  
  // 自动滚动
  bool _autoScrollEnabled = false;
  int _scrollSpeed = 5;
  Timer? _autoScrollTimer;
  
  // 阅读进度
  final ScrollController _scrollController = ScrollController();
  double _scrollProgress = 0.0;
  int? _currentPosition;
  int? _savedPosition;
  bool _progressRestored = false;
  
  // 分页模式
  final PageController _pageController = PageController();
  List<String> _pages = [];
  int _currentPage = 0;
  
  // 保存进度防抖
  Timer? _saveProgressDebounce;
  
  // 书签
  List<BookmarkInfo> _bookmarks = [];
  bool _showBookmarks = false;
  
  // 状态栏时间
  Timer? _clockTimer;
  String _currentTime = '';
  
  // 文件大小信息
  int _contentLength = 0;
  static const int _largeFileThreshold = 500000; // 500KB 以上视为大文件

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initReader();
    _scrollController.addListener(_onScroll);
    _startClock();
  }
  
  void _startClock() {
    _updateTime();
    _clockTimer = Timer.periodic(const Duration(minutes: 1), (_) => _updateTime());
  }
  
  void _updateTime() {
    if (mounted) {
      setState(() {
        _currentTime = DateFormat('HH:mm').format(DateTime.now());
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _pageController.dispose();
    _autoScrollTimer?.cancel();
    _saveProgressDebounce?.cancel();
    _clockTimer?.cancel();
    _saveProgress();
    super.dispose();
  }
  
  // 书签方法
  Future<void> _loadBookmarks() async {
    try {
      final response = await _apiClient.get('/api/books/${widget.bookId}/bookmarks');
      if (response.statusCode == 200) {
        final List<dynamic> data = response.data as List<dynamic>;
        setState(() {
          _bookmarks = data.map((json) => BookmarkInfo.fromJson(json as Map<String, dynamic>)).toList();
        });
      }
    } catch (e) {
      debugPrint('加载书签失败: $e');
    }
  }
  
  Future<void> _addBookmark() async {
    final position = _currentPosition?.toString() ?? '0';
    final chapterTitle = _chapters.isNotEmpty ? _chapters[_currentChapterIndex].title : null;
    
    try {
      final response = await _apiClient.post('/api/bookmarks', data: {
        'book_id': widget.bookId,
        'position': position,
        'chapter_title': chapterTitle,
      });
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已添加书签 - ${chapterTitle ?? "当前位置"}'),
            duration: const Duration(seconds: 2),
          ),
        );
        _loadBookmarks();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('添加书签失败: $e')),
      );
    }
  }
  
  Future<void> _deleteBookmark(int bookmarkId) async {
    try {
      await _apiClient.delete('/api/bookmarks/$bookmarkId');
      setState(() {
        _bookmarks.removeWhere((b) => b.id == bookmarkId);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('书签已删除')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('删除失败: $e')),
      );
    }
  }
  
  void _jumpToBookmark(BookmarkInfo bookmark) {
    final position = int.tryParse(bookmark.position) ?? 0;
    _jumpToPosition(position);
    setState(() => _showBookmarks = false);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _saveProgress();
      _saveSettings();
    }
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;
    
    if (maxScroll > 0) {
      final newProgress = currentScroll / maxScroll;
      if ((newProgress - _scrollProgress).abs() > 0.001) {
        setState(() {
          _scrollProgress = newProgress;
        });
      }
      
      // 计算当前字符位置（基于行索引）
      _updateCurrentPositionFromScroll();
      
      // 更新当前章节
      if (_currentPosition != null) {
        _updateCurrentChapter(_currentPosition!);
      }
      
      // 防抖保存进度
      _saveProgressDebounce?.cancel();
      _saveProgressDebounce = Timer(const Duration(seconds: 2), _saveProgress);
    }
  }
  
  void _updateCurrentPositionFromScroll() {
    if (!_scrollController.hasClients || _lines.isEmpty) return;
    
    // 估算当前可见的第一行
    final scrollOffset = _scrollController.offset;
    final estimatedLineHeight = _fontSize * _lineHeight + 4; // 粗略估计
    final firstVisibleLine = (scrollOffset / estimatedLineHeight).floor();
    
    if (firstVisibleLine >= 0 && firstVisibleLine < _lineStartIndices.length) {
      _currentPosition = _lineStartIndices[firstVisibleLine];
    }
  }

  void _updateCurrentChapter(int position) {
    if (_chapters.isEmpty) return;
    
    for (int i = _chapters.length - 1; i >= 0; i--) {
      if (position >= _chapters[i].startIndex) {
        if (_currentChapterIndex != i) {
          setState(() {
            _currentChapterIndex = i;
          });
        }
        break;
      }
    }
  }

  Future<void> _initReader() async {
    try {
      _storage = StorageService();
      await _storage.init();
      _apiClient = ApiClient(_storage);
      
      await _loadSettings();
      await _loadBookContent();
      await _loadProgress();
      await _loadBookmarks();
    } catch (e) {
      setState(() {
        _errorMessage = '初始化失败: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _loadSettings() async {
    final settings = await _storage.loadAllReaderSettings();
    setState(() {
      _fontSize = settings['fontSize'] as double;
      _lineHeight = settings['lineHeight'] as double;
      _theme = settings['theme'] as String;
      _fontFamily = settings['fontFamily'] as String;
      _autoScrollEnabled = settings['autoScroll'] as bool;
      _scrollSpeed = settings['scrollSpeed'] as int;
      
      final pageModeStr = settings['pageMode'] as String? ?? 'scroll';
      _pageMode = PageMode.values.firstWhere(
        (m) => m.name == pageModeStr,
        orElse: () => PageMode.scroll,
      );
    });
  }

  Future<void> _saveSettings() async {
    await _storage.saveAllReaderSettings(
      fontSize: _fontSize,
      lineHeight: _lineHeight,
      theme: _theme,
      fontFamily: _fontFamily,
      autoScroll: _autoScrollEnabled,
      scrollSpeed: _scrollSpeed,
      pageMode: _pageMode.name,
    );
  }

  Future<void> _loadBookContent() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // 获取书籍信息
      final bookResponse = await _apiClient.get('/api/books/${widget.bookId}');
      if (bookResponse.statusCode == 200) {
        final bookData = bookResponse.data as Map<String, dynamic>;
        _bookTitle = bookData['title'] as String?;
      }
      
      // 获取内容
      final contentResponse = await _apiClient.get('/books/${widget.bookId}/content');
      if (contentResponse.statusCode == 200) {
        final data = contentResponse.data as Map<String, dynamic>;
        final content = data['content'] as String?;
        
        if (content != null) {
          _contentLength = content.length;
          
          setState(() {
            _content = content;
            _isLoading = false;
            _isParsing = true;
          });
          
          // 大文件使用后台解析
          if (_contentLength > _largeFileThreshold) {
            debugPrint('大文件检测: ${(_contentLength / 1024 / 1024).toStringAsFixed(2)} MB，使用后台解析');
            final result = await compute(_parseChaptersIsolate, content);
            if (mounted) {
              setState(() {
                _chapters = result.chapters;
                _lines = result.lines;
                _lineStartIndices = result.lineStartIndices;
                _isParsing = false;
              });
            }
          } else {
            // 小文件直接解析
            final result = _parseChaptersIsolate(content);
            setState(() {
              _chapters = result.chapters;
              _lines = result.lines;
              _lineStartIndices = result.lineStartIndices;
              _isParsing = false;
            });
          }
          
          // 分页处理
          _paginateContent(content);
        } else {
          throw Exception('内容为空');
        }
      } else {
        throw Exception('无法加载内容');
      }
    } catch (e) {
      setState(() {
        _errorMessage = '加载失败: $e';
        _isLoading = false;
        _isParsing = false;
      });
    }
  }

  void _paginateContent(String content) {
    // 简单分页：每页约2000字符
    const pageSize = 2000;
    _pages = [];
    
    for (int i = 0; i < content.length; i += pageSize) {
      int end = (i + pageSize).clamp(0, content.length);
      // 尽量在标点符号处分页
      if (end < content.length) {
        final searchEnd = (end + 100).clamp(0, content.length);
        final substring = content.substring(end, searchEnd);
        final breakIndex = substring.indexOf(RegExp(r'[。！？\n]'));
        if (breakIndex > 0) {
          end += breakIndex + 1;
        }
      }
      _pages.add(content.substring(i, end));
    }
  }

  Future<void> _loadProgress() async {
    try {
      final response = await _apiClient.get('/api/progress/${widget.bookId}');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        final position = data['position'] as String?;
        if (position != null) {
          _savedPosition = int.tryParse(position);
          if (_savedPosition != null && _savedPosition! > 0) {
            _showRestoreProgressDialog();
          }
        }
      }
    } catch (e) {
      debugPrint('加载进度失败: $e');
    }
  }

  void _showRestoreProgressDialog() {
    if (!mounted) return;
    
    final progressPercent = _content != null && _content!.isNotEmpty
        ? ((_savedPosition! / _content!.length) * 100).toStringAsFixed(1)
        : '0.0';
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('继续阅读'),
        content: Text('检测到上次阅读进度 ($progressPercent%)，是否恢复？'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _progressRestored = true;
            },
            child: const Text('从头开始'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              _restoreProgress();
            },
            child: const Text('继续阅读'),
          ),
        ],
      ),
    );
  }

  void _restoreProgress() {
    if (_savedPosition == null) return;
    _jumpToPosition(_savedPosition!);
    _progressRestored = true;
    _showRestoredSnackBar();
  }
  
  void _jumpToPosition(int position) {
    if (_pageMode == PageMode.scroll) {
      // 找到对应的行
      int targetLine = 0;
      for (int i = 0; i < _lineStartIndices.length; i++) {
        if (_lineStartIndices[i] > position) {
          targetLine = i > 0 ? i - 1 : 0;
          break;
        }
        targetLine = i;
      }
      
      // 计算滚动位置
      final estimatedLineHeight = _fontSize * _lineHeight + 4;
      final targetScroll = targetLine * estimatedLineHeight;
      
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          final maxScroll = _scrollController.position.maxScrollExtent;
          _scrollController.jumpTo(targetScroll.clamp(0.0, maxScroll));
        }
      });
    } else {
      // 分页模式
      if (_content != null && _pages.isNotEmpty) {
        int charCount = 0;
        for (int i = 0; i < _pages.length; i++) {
          charCount += _pages[i].length;
          if (charCount >= position) {
            setState(() {
              _currentPage = i;
            });
            _pageController.jumpToPage(i);
            break;
          }
        }
      }
    }
    
    // 更新当前章节
    _updateCurrentChapter(position);
    _currentPosition = position;
  }

  void _showRestoredSnackBar() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已恢复到上次阅读位置'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  Future<void> _saveProgress() async {
    if (_pageMode == PageMode.scroll) {
      if (_currentPosition == null) return;
    } else {
      // 计算分页模式的位置
      int charCount = 0;
      for (int i = 0; i < _currentPage && i < _pages.length; i++) {
        charCount += _pages[i].length;
      }
      _currentPosition = charCount;
    }
    
    try {
      await _apiClient.post('/api/progress/${widget.bookId}', data: {
        'progress': _scrollProgress,
        'position': _currentPosition.toString(),
        'finished': _scrollProgress >= 0.99,
      });
    } catch (e) {
      debugPrint('保存进度失败: $e');
    }
  }

  void _jumpToChapter(Chapter chapter) {
    _jumpToPosition(chapter.startIndex);
    setState(() {
      _showChapters = false;
    });
  }

  // 上一章
  void _previousChapter() {
    if (_currentChapterIndex > 0) {
      _jumpToChapter(_chapters[_currentChapterIndex - 1]);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已是第一章')),
      );
    }
  }

  // 下一章
  void _nextChapter() {
    if (_currentChapterIndex < _chapters.length - 1) {
      _jumpToChapter(_chapters[_currentChapterIndex + 1]);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已是最后一章')),
      );
    }
  }

  // 翻页
  void _previousPage() {
    if (_pageMode == PageMode.scroll) {
      final viewHeight = MediaQuery.of(context).size.height - 150;
      final newPosition = (_scrollController.offset - viewHeight).clamp(0.0, _scrollController.position.maxScrollExtent);
      _scrollController.animateTo(
        newPosition,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } else {
      if (_currentPage > 0) {
        _pageController.previousPage(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    }
  }

  void _nextPage() {
    if (_pageMode == PageMode.scroll) {
      final viewHeight = MediaQuery.of(context).size.height - 150;
      final newPosition = (_scrollController.offset + viewHeight).clamp(0.0, _scrollController.position.maxScrollExtent);
      _scrollController.animateTo(
        newPosition,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } else {
      if (_currentPage < _pages.length - 1) {
        _pageController.nextPage(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    }
  }

  // 处理点击事件
  void _handleTap(TapUpDetails details) {
    final screenWidth = MediaQuery.of(context).size.width;
    final x = details.globalPosition.dx;
    
    if (x > screenWidth * 0.3 && x < screenWidth * 0.7) {
      setState(() {
        _showControls = !_showControls;
      });
      return;
    }
    
    if (_pageMode == PageMode.tap) {
      if (x < screenWidth * 0.3) {
        _previousPage();
      } else if (x > screenWidth * 0.7) {
        _nextPage();
      }
    }
  }

  // 自动滚动
  void _toggleAutoScroll() {
    setState(() {
      _autoScrollEnabled = !_autoScrollEnabled;
    });
    
    if (_autoScrollEnabled) {
      _startAutoScroll();
    } else {
      _stopAutoScroll();
    }
  }

  void _startAutoScroll() {
    _autoScrollTimer?.cancel();
    
    _autoScrollTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (_scrollController.hasClients && _autoScrollEnabled) {
        final maxScroll = _scrollController.position.maxScrollExtent;
        final currentScroll = _scrollController.offset;
        
        if (currentScroll < maxScroll) {
          final speed = 0.5 + (_scrollSpeed - 1) * 0.5;
          _scrollController.jumpTo(currentScroll + speed);
        } else {
          _toggleAutoScroll();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('已到达底部')),
          );
        }
      }
    });
  }

  void _stopAutoScroll() {
    _autoScrollTimer?.cancel();
    _autoScrollTimer = null;
  }

  // 主题颜色
  Color get _backgroundColor {
    switch (_theme) {
      case 'light':
        return const Color(0xFFF5F5F5);
      case 'sepia':
        return const Color(0xFFFEFCE8);
      case 'green':
        return const Color(0xFFE8F5E9);
      default:
        return const Color(0xFF101010);
    }
  }

  Color get _textColor {
    switch (_theme) {
      case 'light':
        return const Color(0xFF111827);
      case 'sepia':
        return const Color(0xFF713F12);
      case 'green':
        return const Color(0xFF1B5E20);
      default:
        return const Color(0xFFE5E5E5);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: _showControls ? AppBar(
        backgroundColor: _backgroundColor,
        foregroundColor: _textColor,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _bookTitle ?? '阅读',
              style: TextStyle(color: _textColor, fontSize: 16),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (_chapters.isNotEmpty)
              Text(
                _chapters[_currentChapterIndex].title,
                style: TextStyle(
                  color: _textColor.withOpacity(0.6),
                  fontSize: 12,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            _saveProgress();
            _saveSettings();
            Navigator.of(context).pop();
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.bookmark_add),
            tooltip: '添加书签',
            onPressed: _addBookmark,
          ),
          IconButton(
            icon: const Icon(Icons.bookmarks),
            tooltip: '书签列表',
            onPressed: () {
              _loadBookmarks();
              setState(() {
                _showBookmarks = !_showBookmarks;
                _showChapters = false;
                _showSettings = false;
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.list),
            tooltip: '目录',
            onPressed: () {
              setState(() {
                _showChapters = !_showChapters;
                _showSettings = false;
                _showBookmarks = false;
              });
            },
          ),
          if (_pageMode == PageMode.scroll)
            IconButton(
              icon: Icon(_autoScrollEnabled ? Icons.pause : Icons.play_arrow),
              tooltip: _autoScrollEnabled ? '停止自动滚动' : '自动滚动',
              onPressed: _toggleAutoScroll,
            ),
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: '阅读设置',
            onPressed: () {
              setState(() {
                _showSettings = !_showSettings;
                _showChapters = false;
                _showBookmarks = false;
              });
            },
          ),
        ],
      ) : null,
      body: Stack(
        children: [
          GestureDetector(
            onTapUp: _handleTap,
            onHorizontalDragEnd: _pageMode == PageMode.slide ? (details) {
              if (details.primaryVelocity! < -100) {
                _nextPage();
              } else if (details.primaryVelocity! > 100) {
                _previousPage();
              }
            } : null,
            child: _buildMainContent(),
          ),
          
          if (_showChapters) _buildChaptersPanel(),
          if (_showBookmarks) _buildBookmarksPanel(),
          if (_showSettings) _buildSettingsPanel(),
          
          if (_isRestoringProgress)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text('恢复阅读进度...', style: TextStyle(color: Colors.white)),
                  ],
                ),
              ),
            ),
          
          if (_showControls)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                color: _backgroundColor.withOpacity(0.95),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // 状态信息栏
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          _currentTime,
                          style: TextStyle(
                            color: _textColor.withOpacity(0.6),
                            fontSize: 12,
                          ),
                        ),
                        if (_contentLength > _largeFileThreshold)
                          Text(
                            '${(_contentLength / 1024 / 1024).toStringAsFixed(1)} MB',
                            style: TextStyle(
                              color: _textColor.withOpacity(0.4),
                              fontSize: 10,
                            ),
                          ),
                        Text(
                          '${(_scrollProgress * 100).toStringAsFixed(1)}%',
                          style: TextStyle(
                            color: _textColor.withOpacity(0.6),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(
                      value: _pageMode == PageMode.scroll 
                        ? _scrollProgress 
                        : (_pages.isEmpty ? 0 : (_currentPage + 1) / _pages.length),
                      backgroundColor: _textColor.withOpacity(0.1),
                      valueColor: AlwaysStoppedAnimation<Color>(
                        Theme.of(context).primaryColor,
                      ),
                      minHeight: 3,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        TextButton.icon(
                          onPressed: _previousChapter,
                          icon: Icon(Icons.skip_previous, color: _textColor, size: 20),
                          label: Text('上一章', style: TextStyle(color: _textColor, fontSize: 12)),
                        ),
                        TextButton.icon(
                          onPressed: _previousPage,
                          icon: Icon(Icons.chevron_left, color: _textColor, size: 20),
                          label: Text('上一页', style: TextStyle(color: _textColor, fontSize: 12)),
                        ),
                        TextButton.icon(
                          onPressed: _nextPage,
                          icon: Icon(Icons.chevron_right, color: _textColor, size: 20),
                          label: Text('下一页', style: TextStyle(color: _textColor, fontSize: 12)),
                        ),
                        TextButton.icon(
                          onPressed: _nextChapter,
                          icon: Icon(Icons.skip_next, color: _textColor, size: 20),
                          label: Text('下一章', style: TextStyle(color: _textColor, fontSize: 12)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          
          if (_pageMode == PageMode.tap && _showControls)
            Positioned(
              top: 80,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '点击左侧上一页 | 点击中间显示/隐藏 | 点击右侧下一页',
                    style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 12),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMainContent() {
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: _textColor),
            const SizedBox(height: 16),
            Text('加载中...', style: TextStyle(color: _textColor)),
          ],
        ),
      );
    }
    
    if (_isParsing) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: _textColor),
            const SizedBox(height: 16),
            Text('正在解析章节...', style: TextStyle(color: _textColor)),
            const SizedBox(height: 8),
            Text(
              '文件较大 (${(_contentLength / 1024 / 1024).toStringAsFixed(1)} MB)',
              style: TextStyle(color: _textColor.withOpacity(0.6), fontSize: 12),
            ),
          ],
        ),
      );
    }
    
    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
            const SizedBox(height: 16),
            Text(_errorMessage!, style: TextStyle(color: _textColor)),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadBookContent,
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }
    
    if (_pageMode == PageMode.scroll) {
      return _buildVirtualScrollContent();
    } else {
      return _buildPagedContent();
    }
  }

  /// 使用 ListView.builder 实现虚拟滚动，解决大文件性能问题
  Widget _buildVirtualScrollContent() {
    if (_lines.isEmpty) return const SizedBox();

    return ListView.builder(
      controller: _scrollController,
      padding: EdgeInsets.fromLTRB(20, 16, 20, _showControls ? 100 : 16),
      itemCount: _lines.length,
      // 增加缓存区域以提高滚动流畅度
      cacheExtent: 2000,
      itemBuilder: (context, index) {
        final line = _lines[index];
        
        // 检查是否是章节标题
        final isChapterTitle = _chapters.any((c) => 
          c.startIndex >= _lineStartIndices[index] && 
          c.startIndex < (_lineStartIndices.length > index + 1 
            ? _lineStartIndices[index + 1] 
            : _lineStartIndices[index] + line.length + 1)
        );
        
        // 空行处理
        if (line.trim().isEmpty) {
          return SizedBox(height: _fontSize * _lineHeight * 0.5);
        }
        
        return Padding(
          padding: EdgeInsets.only(bottom: _fontSize * (_lineHeight - 1)),
          child: Text(
            line,
            style: TextStyle(
              color: _textColor,
              fontSize: isChapterTitle ? _fontSize * 1.2 : _fontSize,
              height: _lineHeight,
              fontWeight: isChapterTitle ? FontWeight.bold : FontWeight.normal,
              fontFamily: _fontFamily == 'default' ? null : _fontFamily,
            ),
          ),
        );
      },
    );
  }

  Widget _buildPagedContent() {
    if (_pages.isEmpty) return const SizedBox();

    return PageView.builder(
      controller: _pageController,
      itemCount: _pages.length,
      onPageChanged: (page) {
        setState(() {
          _currentPage = page;
          _scrollProgress = (page + 1) / _pages.length;
        });
        int charCount = 0;
        for (int i = 0; i <= page && i < _pages.length; i++) {
          charCount += _pages[i].length;
        }
        _updateCurrentChapter(charCount);
        _currentPosition = charCount;
      },
      itemBuilder: (context, index) {
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 16, 20, _showControls ? 100 : 16),
          child: Text(
            _pages[index],
            style: TextStyle(
              color: _textColor,
              fontSize: _fontSize,
              height: _lineHeight,
              fontFamily: _fontFamily == 'default' ? null : _fontFamily,
            ),
          ),
        );
      },
    );
  }

  Widget _buildBookmarksPanel() {
    return Positioned(
      top: 0,
      left: 0,
      bottom: 0,
      child: Material(
        elevation: 8,
        color: _theme == 'dark' ? const Color(0xFF1A1A1A) : Colors.white,
        child: SizedBox(
          width: 300,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '书签 (${_bookmarks.length})',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: _textColor,
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.close, color: _textColor),
                      onPressed: () => setState(() => _showBookmarks = false),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: _bookmarks.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.bookmark_border, size: 48, color: _textColor.withOpacity(0.3)),
                            const SizedBox(height: 8),
                            Text('暂无书签', style: TextStyle(color: _textColor.withOpacity(0.5))),
                          ],
                        ),
                      )
                    : ListView.builder(
                        itemCount: _bookmarks.length,
                        itemBuilder: (context, index) {
                          final bookmark = _bookmarks[index];
                          return Dismissible(
                            key: Key('bookmark_${bookmark.id}'),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              color: Colors.red,
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.only(right: 16),
                              child: const Icon(Icons.delete, color: Colors.white),
                            ),
                            onDismissed: (_) => _deleteBookmark(bookmark.id),
                            child: ListTile(
                              title: Text(
                                bookmark.chapterTitle ?? '位置 ${bookmark.position}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: _textColor),
                              ),
                              subtitle: Text(
                                DateFormat('yyyy-MM-dd HH:mm').format(bookmark.createdAt),
                                style: TextStyle(
                                  color: _textColor.withOpacity(0.5),
                                  fontSize: 12,
                                ),
                              ),
                              leading: Icon(Icons.bookmark, color: Theme.of(context).primaryColor),
                              onTap: () => _jumpToBookmark(bookmark),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildChaptersPanel() {
    return Positioned(
      top: 0,
      left: 0,
      bottom: 0,
      child: Material(
        elevation: 8,
        color: _theme == 'dark' ? const Color(0xFF1A1A1A) : Colors.white,
        child: SizedBox(
          width: 320,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '目录',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: _textColor,
                          ),
                        ),
                        Text(
                          '共 ${_chapters.length} 章',
                          style: TextStyle(
                            fontSize: 12,
                            color: _textColor.withOpacity(0.6),
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: Icon(Icons.close, color: _textColor),
                      onPressed: () => setState(() => _showChapters = false),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView.builder(
                  itemCount: _chapters.length,
                  itemBuilder: (context, index) {
                    final chapter = _chapters[index];
                    final isCurrentChapter = index == _currentChapterIndex;
                    
                    return ListTile(
                      title: Text(
                        chapter.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isCurrentChapter 
                            ? Theme.of(context).primaryColor 
                            : _textColor,
                          fontWeight: isCurrentChapter 
                            ? FontWeight.bold 
                            : FontWeight.normal,
                          fontSize: 14,
                        ),
                      ),
                      leading: isCurrentChapter 
                        ? Icon(Icons.bookmark, color: Theme.of(context).primaryColor, size: 20)
                        : Text(
                            '${index + 1}',
                            style: TextStyle(
                              color: _textColor.withOpacity(0.4),
                              fontSize: 12,
                            ),
                          ),
                      dense: true,
                      onTap: () => _jumpToChapter(chapter),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSettingsPanel() {
    return Positioned(
      top: 0,
      right: 0,
      child: Material(
        elevation: 8,
        color: _theme == 'dark' ? const Color(0xFF1A1A1A) : Colors.white,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(16),
        ),
        child: Container(
          width: 320,
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.8,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '阅读设置',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: _textColor,
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.close, color: _textColor),
                      onPressed: () {
                        setState(() => _showSettings = false);
                        _saveSettings();
                      },
                    ),
                  ],
                ),
                
                const SizedBox(height: 16),
                
                // 翻页模式
                Text('翻页模式', style: TextStyle(color: _textColor.withOpacity(0.7))),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _buildModeButton(PageMode.scroll, '滚动', Icons.swap_vert),
                    const SizedBox(width: 8),
                    _buildModeButton(PageMode.tap, '点击', Icons.touch_app),
                    const SizedBox(width: 8),
                    _buildModeButton(PageMode.slide, '滑动', Icons.swipe),
                  ],
                ),
                
                const SizedBox(height: 16),
                
                // 字体大小
                Text('字体大小', style: TextStyle(color: _textColor.withOpacity(0.7))),
                Row(
                  children: [
                    IconButton(
                      icon: Icon(Icons.remove, color: _textColor),
                      onPressed: () {
                        if (_fontSize > 12) {
                          setState(() => _fontSize -= 2);
                        }
                      },
                    ),
                    Expanded(
                      child: Slider(
                        value: _fontSize,
                        min: 12,
                        max: 32,
                        divisions: 10,
                        label: '${_fontSize.toInt()}px',
                        onChanged: (value) {
                          setState(() => _fontSize = value);
                        },
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.add, color: _textColor),
                      onPressed: () {
                        if (_fontSize < 32) {
                          setState(() => _fontSize += 2);
                        }
                      },
                    ),
                  ],
                ),
                Center(
                  child: Text(
                    '${_fontSize.toInt()}px',
                    style: TextStyle(color: _textColor),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // 行距
                Text('行距', style: TextStyle(color: _textColor.withOpacity(0.7))),
                Slider(
                  value: _lineHeight,
                  min: 1.2,
                  max: 2.5,
                  divisions: 13,
                  label: _lineHeight.toStringAsFixed(1),
                  onChanged: (value) {
                    setState(() => _lineHeight = value);
                  },
                ),
                
                const SizedBox(height: 16),
                
                // 字体选择
                Text('字体', style: TextStyle(color: _textColor.withOpacity(0.7))),
                const SizedBox(height: 8),
                _buildFontSelector(),
                
                const SizedBox(height: 16),
                
                // 主题
                Text('阅读主题', style: TextStyle(color: _textColor.withOpacity(0.7))),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildThemeButton('dark', '深色', const Color(0xFF101010), Colors.white),
                    _buildThemeButton('light', '浅色', const Color(0xFFF5F5F5), Colors.black),
                    _buildThemeButton('sepia', '护眼', const Color(0xFFFEFCE8), const Color(0xFF713F12)),
                    _buildThemeButton('green', '绿色', const Color(0xFFE8F5E9), const Color(0xFF1B5E20)),
                  ],
                ),
                
                const SizedBox(height: 16),
                
                if (_pageMode == PageMode.scroll) ...[
                  Text('自动滚动速度', style: TextStyle(color: _textColor.withOpacity(0.7))),
                  Slider(
                    value: _scrollSpeed.toDouble(),
                    min: 1,
                    max: 10,
                    divisions: 9,
                    label: '$_scrollSpeed',
                    onChanged: (value) {
                      setState(() => _scrollSpeed = value.toInt());
                      if (_autoScrollEnabled) {
                        _stopAutoScroll();
                        _startAutoScroll();
                      }
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildModeButton(PageMode mode, String label, IconData icon) {
    final isSelected = _pageMode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() => _pageMode = mode);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? Theme.of(context).primaryColor : _textColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                color: isSelected ? Colors.white : _textColor,
                size: 20,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : _textColor,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFontSelector() {
    final currentFont = availableFonts.firstWhere(
      (f) => f.name == _fontFamily,
      orElse: () => availableFonts.first,
    );
    
    return GestureDetector(
      onTap: () {
        _showFontPickerDialog();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: _textColor.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _textColor.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  currentFont.displayName,
                  style: TextStyle(
                    color: _textColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  currentFont.preview ?? '',
                  style: TextStyle(
                    color: _textColor.withOpacity(0.6),
                    fontSize: 12,
                    fontFamily: currentFont.name == 'default' ? null : currentFont.name,
                  ),
                ),
              ],
            ),
            Icon(Icons.arrow_drop_down, color: _textColor),
          ],
        ),
      ),
    );
  }
  
  void _showFontPickerDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _theme == 'dark' ? const Color(0xFF1A1A1A) : Colors.white,
        title: Text('选择字体', style: TextStyle(color: _textColor)),
        content: SizedBox(
          width: 300,
          height: 400,
          child: ListView.builder(
            itemCount: availableFonts.length,
            itemBuilder: (context, index) {
              final font = availableFonts[index];
              final isSelected = font.name == _fontFamily;
              
              return ListTile(
                title: Text(
                  font.displayName,
                  style: TextStyle(
                    color: isSelected ? Theme.of(context).primaryColor : _textColor,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                subtitle: Text(
                  font.preview ?? '',
                  style: TextStyle(
                    color: _textColor.withOpacity(0.6),
                    fontFamily: font.name == 'default' ? null : font.name,
                  ),
                ),
                leading: Icon(
                  isSelected ? Icons.check_circle : Icons.circle_outlined,
                  color: isSelected ? Theme.of(context).primaryColor : _textColor.withOpacity(0.3),
                ),
                onTap: () {
                  setState(() => _fontFamily = font.name);
                  Navigator.pop(context);
                },
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
        ],
      ),
    );
  }

  Widget _buildThemeButton(String theme, String label, Color bg, Color fg) {
    final isSelected = _theme == theme;
    return GestureDetector(
      onTap: () {
        setState(() => _theme = theme);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(8),
          border: isSelected
              ? Border.all(color: Theme.of(context).primaryColor, width: 2)
              : Border.all(color: Colors.grey.withOpacity(0.3)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: fg,
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}
