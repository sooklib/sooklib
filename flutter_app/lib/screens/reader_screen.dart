import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/book.dart';
import '../services/book_service.dart';
import '../services/api_client.dart';
import '../services/storage_service.dart';

class ReaderScreen extends StatefulWidget {
  final int bookId;

  const ReaderScreen({super.key, required this.bookId});

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  late BookService _bookService;
  Book? _book;
  bool _isLoading = true;
  String? _errorMessage;
  
  // 阅读设置
  double _fontSize = 18.0;
  double _lineHeight = 1.8;
  bool _showAppBar = true;

  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _initService();
    
    // 隐藏系统UI
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.immersiveSticky,
    );
  }

  @override
  void dispose() {
    _scrollController.dispose();
    // 恢复系统UI
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.edgeToEdge,
    );
    super.dispose();
  }

  Future<void> _initService() async {
    final storage = StorageService();
    await storage.init();
    final apiClient = ApiClient(storage);
    _bookService = BookService(apiClient);
    _loadBook();
  }

  Future<void> _loadBook() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final book = await _bookService.getBookDetail(widget.bookId);
      setState(() {
        _book = book;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = '加载失败: ${e.toString()}';
        _isLoading = false;
      });
    }
  }

  void _toggleAppBar() {
    setState(() {
      _showAppBar = !_showAppBar;
    });
  }

  void _showSettings() {
    showModalBottomSheet(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '阅读设置',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 24),
              
              // 字体大小
              Row(
                children: [
                  const Text('字体大小'),
                  Expanded(
                    child: Slider(
                      value: _fontSize,
                      min: 12.0,
                      max: 32.0,
                      divisions: 20,
                      label: _fontSize.round().toString(),
                      onChanged: (value) {
                        setModalState(() {
                          _fontSize = value;
                        });
                        setState(() {
                          _fontSize = value;
                        });
                      },
                    ),
                  ),
                  Text('${_fontSize.round()}'),
                ],
              ),
              
              // 行高
              Row(
                children: [
                  const Text('行高'),
                  Expanded(
                    child: Slider(
                      value: _lineHeight,
                      min: 1.0,
                      max: 3.0,
                      divisions: 20,
                      label: _lineHeight.toStringAsFixed(1),
                      onChanged: (value) {
                        setModalState(() {
                          _lineHeight = value;
                        });
                        setState(() {
                          _lineHeight = value;
                        });
                      },
                    ),
                  ),
                  Text(_lineHeight.toStringAsFixed(1)),
                ],
              ),
              
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_errorMessage != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('阅读器')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text(_errorMessage!),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadBook,
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }

    if (_book == null) {
      return const Scaffold(
        body: Center(child: Text('书籍信息加载失败')),
      );
    }

    return Scaffold(
      appBar: _showAppBar
          ? AppBar(
              title: Text(
                _book!.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.settings),
                  onPressed: _showSettings,
                ),
                IconButton(
                  icon: const Icon(Icons.bookmark_border),
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('书签功能开发中...')),
                    );
                  },
                ),
              ],
            )
          : null,
      body: GestureDetector(
        onTap: _toggleAppBar,
        child: Container(
          color: Colors.black,
          child: SafeArea(
            child: SingleChildScrollView(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              child: SelectableText(
                _getDemoContent(),
                style: TextStyle(
                  fontSize: _fontSize,
                  height: _lineHeight,
                  color: const Color(0xFFE0E0E0),
                  fontFamily: 'serif',
                ),
              ),
            ),
          ),
        ),
      ),
      bottomNavigationBar: _showAppBar
          ? BottomAppBar(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('上一章功能开发中...')),
                      );
                    },
                    tooltip: '上一章',
                  ),
                  IconButton(
                    icon: const Icon(Icons.list),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('目录功能开发中...')),
                      );
                    },
                    tooltip: '目录',
                  ),
                  IconButton(
                    icon: const Icon(Icons.brightness_6),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('背景色功能开发中...')),
                      );
                    },
                    tooltip: '背景',
                  ),
                  IconButton(
                    icon: const Icon(Icons.arrow_forward),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('下一章功能开发中...')),
                      );
                    },
                    tooltip: '下一章',
                  ),
                ],
              ),
            )
          : null,
    );
  }

  String _getDemoContent() {
    return '''
第一章 示例内容

这是一个演示阅读器。实际使用时，这里将显示从服务器获取的书籍内容。

功能特点：
• 可调节字体大小
• 可调节行高
• 点击屏幕显示/隐藏控制栏
• 沉浸式阅读体验

当前正在阅读：${_book!.title}
作者：${_book!.authorName ?? '未知'}

开发中的功能：
1. 章节导航
2. 书签管理
3. 阅读进度保存
4. 背景色切换
5. 翻页动画

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

这段文字用于演示阅读器的文本渲染效果。您可以通过设置按钮调整字体大小和行高，以获得最佳的阅读体验。

点击屏幕可以显示或隐藏顶部和底部的控制栏，提供沉浸式的阅读体验。

更多内容敬请期待...
''';
  }
}
