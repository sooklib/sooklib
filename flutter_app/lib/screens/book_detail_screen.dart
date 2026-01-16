import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/book.dart';
import '../services/book_service.dart';
import '../services/api_client.dart';
import '../services/api_config.dart';
import '../services/storage_service.dart';

class BookDetailScreen extends StatefulWidget {
  final int bookId;

  const BookDetailScreen({super.key, required this.bookId});

  @override
  State<BookDetailScreen> createState() => _BookDetailScreenState();
}

class _BookDetailScreenState extends State<BookDetailScreen> {
  late BookService _bookService;
  late ApiClient _apiClient;
  Book? _book;
  bool _isLoading = true;
  String? _errorMessage;
  bool _isFavorite = false;
  double? _readingProgress;

  @override
  void initState() {
    super.initState();
    _initService();
  }

  Future<void> _initService() async {
    final storage = StorageService();
    await storage.init();
    _apiClient = ApiClient(storage);
    _bookService = BookService(_apiClient);
    await _loadBookDetail();
    await _loadReadingProgress();
    await _checkFavoriteStatus();
  }

  Future<void> _loadBookDetail() async {
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

  Future<void> _loadReadingProgress() async {
    try {
      final response = await _apiClient.get('/api/progress/${widget.bookId}');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        setState(() {
          _readingProgress = (data['progress'] as num?)?.toDouble() ?? 0.0;
        });
      }
    } catch (e) {
      debugPrint('❌ Load progress error: $e');
    }
  }

  Future<void> _checkFavoriteStatus() async {
    try {
      final response = await _apiClient.get('/api/user/favorites/${widget.bookId}/check');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        setState(() {
          _isFavorite = data['is_favorite'] as bool? ?? false;
        });
      }
    } catch (e) {
      debugPrint('❌ Check favorite error: $e');
    }
  }

  Future<void> _toggleFavorite() async {
    try {
      if (_isFavorite) {
        await _apiClient.delete('/api/user/favorites/${widget.bookId}');
      } else {
        await _apiClient.post('/api/user/favorites/${widget.bookId}', data: {});
      }
      setState(() {
        _isFavorite = !_isFavorite;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_isFavorite ? '已添加到收藏' : '已取消收藏'),
            duration: const Duration(seconds: 1),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('操作失败: $e')),
        );
      }
    }
  }

  void _downloadBook() {
    final downloadUrl = '${ApiConfig.baseUrl}/books/${widget.bookId}/download';
    // 使用 dart:html 在新窗口打开下载链接
    html.window.open(downloadUrl, '_blank');
    
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('开始下载...'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? _buildErrorView()
              : _buildDetailView(),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(_errorMessage!),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadBookDetail,
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailView() {
    if (_book == null) return const SizedBox();

    final coverUrl = '${ApiConfig.baseUrl}/books/${_book!.id}/cover?size=large';

    return CustomScrollView(
      slivers: [
        // 顶部AppBar with背景
        SliverAppBar(
          expandedHeight: 300,
          pinned: true,
          flexibleSpace: FlexibleSpaceBar(
            background: Stack(
              fit: StackFit.expand,
              children: [
                // 背景模糊封面
                ColorFiltered(
                  colorFilter: ColorFilter.mode(
                    Colors.black.withOpacity(0.6),
                    BlendMode.darken,
                  ),
                  child: Image.network(
                    coverUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(color: Colors.grey[900]),
                  ),
                ),
                // 前景封面
                Center(
                  child: Container(
                    margin: const EdgeInsets.only(top: 80),
                    width: 150,
                    height: 200,
                    decoration: BoxDecoration(
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.5),
                          blurRadius: 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: Image.network(
                        coverUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: Colors.grey[800],
                          child: const Icon(Icons.menu_book, size: 64),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        // 内容
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 标题
                Text(
                  _book!.title,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),

                // 作者
                if (_book!.authorName != null)
                  Row(
                    children: [
                      Icon(Icons.person, size: 16, color: Colors.grey[400]),
                      const SizedBox(width: 4),
                      Text(
                        _book!.authorName!,
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.grey[400],
                        ),
                      ),
                    ],
                  ),

                // 阅读进度
                if (_readingProgress != null && _readingProgress! > 0) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: LinearProgressIndicator(
                          value: _readingProgress,
                          backgroundColor: Colors.grey[800],
                          valueColor: AlwaysStoppedAnimation<Color>(
                            Theme.of(context).primaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${(_readingProgress! * 100).toInt()}%',
                        style: TextStyle(color: Colors.grey[400], fontSize: 12),
                      ),
                    ],
                  ),
                ],

                const SizedBox(height: 16),

                // 操作按钮
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          context.push('/reader/${_book!.id}');
                        },
                        icon: Icon(
                          _readingProgress != null && _readingProgress! > 0
                              ? Icons.play_arrow
                              : Icons.auto_stories,
                        ),
                        label: Text(
                          _readingProgress != null && _readingProgress! > 0
                              ? '继续阅读'
                              : '开始阅读',
                        ),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    IconButton.filled(
                      onPressed: _toggleFavorite,
                      icon: Icon(
                        _isFavorite ? Icons.favorite : Icons.favorite_border,
                      ),
                      tooltip: '收藏',
                    ),
                    IconButton.filled(
                      onPressed: _downloadBook,
                      icon: const Icon(Icons.download),
                      tooltip: '下载',
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // 基本信息
                _buildInfoSection(),

                const SizedBox(height: 24),

                // 标签
                if (_book!.tags.isNotEmpty) ...[
                  const Text(
                    '标签',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _book!.tags
                        .map((tag) => Chip(
                              label: Text(tag),
                              backgroundColor: Colors.grey[800],
                            ))
                        .toList(),
                  ),
                  const SizedBox(height: 24),
                ],

                // 简介
                if (_book!.description != null && _book!.description!.isNotEmpty) ...[
                  const Text(
                    '简介',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _book!.description!,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[300],
                      height: 1.6,
                    ),
                  ),
                ],

                const SizedBox(height: 80), // 底部留白
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInfoSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            _buildInfoRow('文件格式', _book!.fileFormat.toUpperCase()),
            const Divider(),
            _buildInfoRow('文件大小', _book!.formatFileSize),
            const Divider(),
            _buildInfoRow('添加时间', _book!.formattedCreatedAt),
            if (_book!.ageRating != null) ...[
              const Divider(),
              _buildInfoRow(
                '年龄分级',
                _book!.ageRating == 'adult' ? '18+' : '全年龄',
                valueColor: _book!.ageRating == 'adult' ? Colors.red : null,
              ),
            ],
            if (_book!.contentWarning != null && _book!.contentWarning!.isNotEmpty) ...[
              const Divider(),
              _buildInfoRow(
                '内容警告',
                _book!.contentWarning!.join(', '),
                valueColor: Colors.orange,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, {Color? valueColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: Colors.grey[400],
            fontSize: 14,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: valueColor ?? Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
