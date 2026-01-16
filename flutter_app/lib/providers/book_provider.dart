import 'package:flutter/material.dart';
import '../models/book.dart';
import '../services/book_service.dart';
import '../services/api_client.dart';
import '../services/storage_service.dart';

class BookProvider extends ChangeNotifier {
  List<Book> _books = [];
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _errorMessage;
  int _currentPage = 1;
  bool _hasMore = true;
  
  // 筛选参数
  int? _libraryId;
  int? _authorId;
  
  // 统计数据
  int _totalBooks = 0;
  int _totalAuthors = 0;
  int _totalLibraries = 0;
  
  // 初始化状态
  bool _initialized = false;
  bool _initializing = false;

  BookService? _bookService;

  // Getters
  List<Book> get books => _books;
  bool get isLoading => _isLoading;
  bool get isLoadingMore => _isLoadingMore;
  String? get errorMessage => _errorMessage;
  bool get hasMore => _hasMore;
  bool get isInitialized => _initialized;
  int? get libraryId => _libraryId;
  int? get authorId => _authorId;
  
  // 统计数据 Getters
  int get totalBooks => _totalBooks;
  int get totalAuthors => _totalAuthors;
  int get totalLibraries => _totalLibraries;

  /// 确保服务已初始化
  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    if (_initializing) {
      // 等待初始化完成
      while (_initializing) {
        await Future.delayed(const Duration(milliseconds: 50));
      }
      return;
    }
    
    _initializing = true;
    try {
      final storage = StorageService();
      await storage.init();
      final apiClient = ApiClient(storage);
      _bookService = BookService(apiClient);
      _initialized = true;
      debugPrint('📚 BookProvider initialized successfully');
    } catch (e) {
      debugPrint('❌ BookProvider initialization failed: $e');
      rethrow;
    } finally {
      _initializing = false;
    }
  }

  // 加载统计数据
  Future<void> loadStats() async {
    debugPrint('📊 loadStats called');
    
    await _ensureInitialized();
    
    try {
      final stats = await _bookService!.getStats();
      _totalBooks = stats['total_books'] ?? 0;
      _totalAuthors = stats['total_authors'] ?? 0;
      _totalLibraries = stats['total_libraries'] ?? 0;
      debugPrint('📊 Stats loaded: books=$_totalBooks, authors=$_totalAuthors');
      notifyListeners();
    } catch (e) {
      debugPrint('❌ Load stats error: $e');
    }
  }

  // 设置筛选条件
  void setFilter({int? libraryId, int? authorId}) {
    bool changed = false;
    if (libraryId != _libraryId) {
      _libraryId = libraryId;
      changed = true;
    }
    if (authorId != _authorId) {
      _authorId = authorId;
      changed = true;
    }
    if (changed) {
      loadBooks(refresh: true);
    }
  }

  // 清除筛选条件
  void clearFilter() {
    if (_libraryId != null || _authorId != null) {
      _libraryId = null;
      _authorId = null;
      loadBooks(refresh: true);
    }
  }

  // 加载书籍列表（初始加载或刷新）
  Future<void> loadBooks({bool refresh = false}) async {
    debugPrint('📚 loadBooks called, refresh: $refresh, libraryId: $_libraryId');
    
    // 确保初始化完成
    await _ensureInitialized();
    
    if (refresh) {
      _currentPage = 1;
      _hasMore = true;
      _books.clear();
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      debugPrint('📚 Fetching books from API, page: $_currentPage');
      final newBooks = await _bookService!.getBooks(
        page: _currentPage,
        limit: 20,
        libraryId: _libraryId,
        authorId: _authorId,
      );

      debugPrint('📚 Received ${newBooks.length} books');
      
      if (refresh) {
        _books = newBooks;
      } else {
        _books.addAll(newBooks);
      }

      _hasMore = newBooks.length >= 20;
      _currentPage++;
      _isLoading = false;
      
      // 同时加载统计数据
      loadStats();
      
      notifyListeners();
    } catch (e) {
      debugPrint('❌ Load books error: $e');
      _errorMessage = '加载失败: ${e.toString()}';
      _isLoading = false;
      notifyListeners();
    }
  }

  // 加载更多书籍
  Future<void> loadMore() async {
    if (_isLoadingMore || !_hasMore || _isLoading) return;

    await _ensureInitialized();

    _isLoadingMore = true;
    notifyListeners();

    try {
      debugPrint('📚 Loading more books, page: $_currentPage');
      final newBooks = await _bookService!.getBooks(
        page: _currentPage,
        limit: 20,
        libraryId: _libraryId,
        authorId: _authorId,
      );

      debugPrint('📚 Received ${newBooks.length} more books');
      _books.addAll(newBooks);
      _hasMore = newBooks.length >= 20;
      _currentPage++;
      _isLoadingMore = false;
      notifyListeners();
    } catch (e) {
      debugPrint('❌ Load more error: $e');
      _errorMessage = '加载更多失败: ${e.toString()}';
      _isLoadingMore = false;
      notifyListeners();
    }
  }

  // 刷新列表
  Future<void> refresh() async {
    await loadBooks(refresh: true);
  }

  // 清除错误
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  // 获取封面URL
  String getCoverUrl(int bookId) {
    if (_bookService == null) {
      // 返回占位符，因为服务还没初始化
      return '';
    }
    return _bookService!.getCoverUrl(bookId);
  }
}
