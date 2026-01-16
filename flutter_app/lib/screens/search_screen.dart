import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/book.dart';
import '../services/book_service.dart';
import '../services/api_client.dart';
import '../services/storage_service.dart';
import '../widgets/book_card.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  late BookService _bookService;
  
  List<Book> _searchResults = [];
  bool _isSearching = false;
  String? _errorMessage;
  int _totalResults = 0;
  
  @override
  void initState() {
    super.initState();
    _initService();
  }

  Future<void> _initService() async {
    final storage = StorageService();
    await storage.init();
    final apiClient = ApiClient(storage);
    _bookService = BookService(apiClient);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _performSearch(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _searchResults = [];
        _totalResults = 0;
      });
      return;
    }

    setState(() {
      _isSearching = true;
      _errorMessage = null;
    });

    try {
      final result = await _bookService.searchBooks(
        query: query,
        page: 1,
        limit: 50,
      );

      setState(() {
        _searchResults = result['books'] as List<Book>;
        _totalResults = result['total'] as int;
        _isSearching = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = '搜索失败: ${e.toString()}';
        _isSearching = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: '搜索书名、作者...',
            border: InputBorder.none,
            hintStyle: TextStyle(color: Colors.grey),
          ),
          style: const TextStyle(color: Colors.white, fontSize: 18),
          onSubmitted: _performSearch,
        ),
        actions: [
          if (_searchController.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _searchController.clear();
                setState(() {
                  _searchResults = [];
                  _totalResults = 0;
                });
              },
            ),
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              _performSearch(_searchController.text);
            },
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    // 加载中
    if (_isSearching) {
      return const Center(child: CircularProgressIndicator());
    }

    // 错误状态
    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text(_errorMessage!),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => _performSearch(_searchController.text),
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    // 空状态（未搜索或无结果）
    if (_searchResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.search,
              size: 64,
              color: Colors.grey[600],
            ),
            const SizedBox(height: 16),
            Text(
              _searchController.text.isEmpty
                  ? '输入关键词开始搜索'
                  : '未找到相关书籍',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey[400],
              ),
            ),
          ],
        ),
      );
    }

    // 搜索结果
    return Column(
      children: [
        // 结果统计
        Container(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Text(
                '找到 $_totalResults 本书籍',
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[400],
                ),
              ),
            ],
          ),
        ),

        // 结果列表
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 0.65,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: _searchResults.length,
            itemBuilder: (context, index) {
              final book = _searchResults[index];
              final coverUrl = _bookService.getCoverUrl(book.id);

              return BookCard(
                book: book,
                coverUrl: coverUrl,
                onTap: () {
                  context.push('/books/${book.id}');
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
