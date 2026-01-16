import 'package:flutter/material.dart';
import '../models/library.dart';
import '../services/dashboard_service.dart';
import '../services/api_client.dart';
import '../services/api_config.dart';
import '../services/storage_service.dart';

class DashboardProvider extends ChangeNotifier {
  DashboardData? _dashboardData;
  bool _isLoading = false;
  String? _errorMessage;
  
  // 初始化状态
  bool _initialized = false;
  bool _initializing = false;

  DashboardService? _dashboardService;

  // Getters
  DashboardData? get dashboardData => _dashboardData;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isInitialized => _initialized;
  
  // 便捷 Getters
  List<ContinueReadingItem> get continueReading => _dashboardData?.continueReading ?? [];
  List<Library> get libraries => _dashboardData?.libraries ?? [];
  List<LibraryLatest> get latestByLibrary => _dashboardData?.latestByLibrary ?? [];
  int get favoritesCount => _dashboardData?.favoritesCount ?? 0;

  /// 确保服务已初始化
  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    if (_initializing) {
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
      _dashboardService = DashboardService(apiClient);
      _initialized = true;
      debugPrint('📊 DashboardProvider initialized successfully');
    } catch (e) {
      debugPrint('❌ DashboardProvider initialization failed: $e');
      rethrow;
    } finally {
      _initializing = false;
    }
  }

  /// 加载 Dashboard 数据
  Future<void> loadDashboard({bool forceRefresh = false}) async {
    if (_isLoading) return;
    
    // 如果已有数据且不强制刷新，直接返回
    if (_dashboardData != null && !forceRefresh) {
      return;
    }
    
    debugPrint('📊 loadDashboard called, forceRefresh: $forceRefresh');
    
    await _ensureInitialized();
    
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _dashboardData = await _dashboardService!.getDashboard();
      debugPrint('📊 Dashboard loaded: ${_dashboardData!.libraries.length} libraries, ${_dashboardData!.latestByLibrary.length} latest sections');
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('❌ Load dashboard error: $e');
      _errorMessage = '加载失败: ${e.toString()}';
      _isLoading = false;
      notifyListeners();
    }
  }

  /// 刷新数据
  Future<void> refresh() async {
    await loadDashboard(forceRefresh: true);
  }

  /// 清除错误
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  /// 获取封面 URL
  String getCoverUrl(int bookId) {
    return '${ApiConfig.baseUrl}/books/$bookId/cover';
  }

  /// 获取书库封面 URL
  String getLibraryCoverUrl(String? coverUrl) {
    if (coverUrl == null || coverUrl.isEmpty) {
      return '';
    }
    return '${ApiConfig.baseUrl}$coverUrl';
  }
}
