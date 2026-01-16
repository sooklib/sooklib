import 'package:flutter/foundation.dart';
import '../models/library.dart';
import 'api_client.dart';
import 'api_config.dart';

class DashboardService {
  final ApiClient _apiClient;

  DashboardService(this._apiClient);

  /// 获取首页 Dashboard 数据
  Future<DashboardData> getDashboard() async {
    debugPrint('📊 DashboardService.getDashboard');
    
    final response = await _apiClient.get('/api/dashboard');

    if (response.statusCode == 200) {
      final data = response.data as Map<String, dynamic>;
      debugPrint('📊 Dashboard loaded: ${data['libraries']?.length ?? 0} libraries');
      return DashboardData.fromJson(data);
    } else {
      debugPrint('❌ DashboardService: Failed with status ${response.statusCode}');
      throw Exception('获取Dashboard数据失败: ${response.statusCode}');
    }
  }

  /// 获取书库列表
  Future<List<Library>> getLibraries() async {
    debugPrint('📚 DashboardService.getLibraries');
    
    final response = await _apiClient.get('/api/libraries');

    if (response.statusCode == 200) {
      final data = response.data as List<dynamic>;
      return data.map((e) => Library.fromJson(e as Map<String, dynamic>)).toList();
    } else {
      throw Exception('获取书库列表失败: ${response.statusCode}');
    }
  }

  /// 获取继续阅读列表
  Future<List<ContinueReadingItem>> getContinueReading({int limit = 20}) async {
    debugPrint('📖 DashboardService.getContinueReading');
    
    final response = await _apiClient.get(
      '/api/reading/continue',
      queryParameters: {'limit': limit},
    );

    if (response.statusCode == 200) {
      final data = response.data as List<dynamic>;
      return data.map((e) => ContinueReadingItem.fromJson(e as Map<String, dynamic>)).toList();
    } else {
      throw Exception('获取继续阅读列表失败: ${response.statusCode}');
    }
  }

  /// 获取指定书库的最新书籍
  Future<LibraryLatest> getLibraryLatest(int libraryId, {int limit = 20}) async {
    debugPrint('📕 DashboardService.getLibraryLatest: libraryId=$libraryId');
    
    final response = await _apiClient.get(
      '/api/libraries/$libraryId/latest',
      queryParameters: {'limit': limit},
    );

    if (response.statusCode == 200) {
      final data = response.data as Map<String, dynamic>;
      return LibraryLatest.fromJson(data);
    } else {
      throw Exception('获取书库最新书籍失败: ${response.statusCode}');
    }
  }

  /// 获取封面 URL
  String getCoverUrl(int bookId) {
    return '${ApiConfig.baseUrl}/books/$bookId/cover';
  }

  /// 获取书库封面 URL（使用最新一本书的封面）
  String getLibraryCoverUrl(String? coverUrl) {
    if (coverUrl == null || coverUrl.isEmpty) {
      return '';
    }
    return '${ApiConfig.baseUrl}$coverUrl';
  }
}
