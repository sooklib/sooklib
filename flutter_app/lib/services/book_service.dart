import 'package:flutter/foundation.dart';
import '../models/book.dart';
import 'api_client.dart';
import 'api_config.dart';

class BookService {
  final ApiClient _apiClient;

  BookService(this._apiClient);

  // 获取书籍列表
  Future<List<Book>> getBooks({
    int page = 1,
    int limit = 20,
    int? authorId,
    int? libraryId,
  }) async {
    debugPrint('📚 BookService.getBooks: page=$page, limit=$limit');
    
    final response = await _apiClient.get(
      ApiConfig.booksEndpoint,
      queryParameters: {
        'page': page,
        'limit': limit,
        if (authorId != null) 'author_id': authorId,
        if (libraryId != null) 'library_id': libraryId,
      },
    );

    if (response.statusCode == 200) {
      final List<dynamic> data = response.data as List<dynamic>;
      debugPrint('📚 BookService: Parsing ${data.length} books');
      
      final books = <Book>[];
      for (var i = 0; i < data.length; i++) {
        try {
          final json = data[i] as Map<String, dynamic>;
          final book = Book.fromJson(json);
          books.add(book);
        } catch (e) {
          debugPrint('❌ Error parsing book at index $i: $e');
          // 继续处理其他书籍，不因一本书的解析错误而中断
        }
      }
      
      debugPrint('📚 BookService: Successfully parsed ${books.length} books');
      return books;
    } else {
      debugPrint('❌ BookService: Failed with status ${response.statusCode}');
      throw Exception('获取书籍列表失败: ${response.statusCode}');
    }
  }

  // 获取书籍详情
  Future<Book> getBookDetail(int bookId) async {
    debugPrint('📖 BookService.getBookDetail: bookId=$bookId');
    
    final response = await _apiClient.get('${ApiConfig.booksEndpoint}/$bookId');

    if (response.statusCode == 200) {
      final json = response.data as Map<String, dynamic>;
      debugPrint('📖 BookService: Got book detail for "${ json['title'] }"');
      return Book.fromJson(json);
    } else {
      debugPrint('❌ BookService: Failed with status ${response.statusCode}');
      throw Exception('获取书籍详情失败: ${response.statusCode}');
    }
  }

  // 搜索书籍
  Future<Map<String, dynamic>> searchBooks({
    required String query,
    int page = 1,
    int limit = 20,
    int? authorId,
    String? formats,
    int? libraryId,
  }) async {
    debugPrint('🔍 BookService.searchBooks: query="$query"');
    
    final response = await _apiClient.get(
      ApiConfig.searchEndpoint,
      queryParameters: {
        'q': query,
        'page': page,
        'limit': limit,
        if (authorId != null) 'author_id': authorId,
        if (formats != null) 'formats': formats,
        if (libraryId != null) 'library_id': libraryId,
      },
    );

    if (response.statusCode == 200) {
      final data = response.data as Map<String, dynamic>;
      final List<dynamic> booksJson = data['books'] as List<dynamic>? ?? [];
      
      debugPrint('🔍 BookService: Found ${booksJson.length} search results');
      
      final books = <Book>[];
      for (var json in booksJson) {
        try {
          books.add(Book.fromJson(json as Map<String, dynamic>));
        } catch (e) {
          debugPrint('❌ Error parsing search result: $e');
        }
      }
      
      return {
        'books': books,
        'total': data['total'] as int? ?? 0,
        'page': data['page'] as int? ?? page,
        'total_pages': data['total_pages'] as int? ?? 0,
      };
    } else {
      debugPrint('❌ BookService: Search failed with status ${response.statusCode}');
      throw Exception('搜索失败: ${response.statusCode}');
    }
  }

  // 获取书籍封面URL
  String getCoverUrl(int bookId, {String size = 'thumbnail'}) {
    final url = '${ApiConfig.baseUrl}/books/$bookId/cover?size=$size';
    return url;
  }

  // 获取书籍下载URL
  String getDownloadUrl(int bookId) {
    return '${ApiConfig.baseUrl}/books/$bookId/download';
  }
}
