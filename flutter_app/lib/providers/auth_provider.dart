import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/storage_service.dart';
import '../services/api_client.dart';

class AuthProvider extends ChangeNotifier {
  User? _currentUser;
  bool _isLoading = false;
  String? _errorMessage;

  late final AuthService _authService;
  late final StorageService _storage;

  AuthProvider() {
    _storage = StorageService();
    _init();
  }

  Future<void> _init() async {
    await _storage.init();
    final apiClient = ApiClient(_storage);
    _authService = AuthService(apiClient, _storage);
    await _loadSavedUser();
  }

  // Getters
  User? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _currentUser != null;
  bool get isAdmin => _currentUser?.isAdmin ?? false;

  // 加载保存的用户信息
  Future<void> _loadSavedUser() async {
    try {
      final user = await _authService.getSavedUser();
      if (user != null) {
        _currentUser = user;
        notifyListeners();
      }
    } catch (e) {
      // 加载失败，保持未登录状态
    }
  }

  // 登录
  Future<bool> login(String username, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final user = await _authService.login(username, password);
      _currentUser = user;
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = _getErrorMessage(e);
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  // 登出
  Future<void> logout() async {
    await _authService.logout();
    _currentUser = null;
    _errorMessage = null;
    notifyListeners();
  }

  // 刷新用户信息
  Future<void> refreshUser() async {
    try {
      final user = await _authService.getCurrentUser();
      _currentUser = user;
      await _storage.saveUser(user);
      notifyListeners();
    } catch (e) {
      _errorMessage = _getErrorMessage(e);
      notifyListeners();
    }
  }

  // 清除错误消息
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  // 错误消息处理
  String _getErrorMessage(dynamic error) {
    final errorString = error.toString();
    if (errorString.contains('401') || errorString.contains('Unauthorized')) {
      return '用户名或密码错误';
    } else if (errorString.contains('timeout')) {
      return '连接超时，请检查网络';
    } else if (errorString.contains('SocketException')) {
      return '无法连接到服务器';
    } else {
      return '登录失败：$errorString';
    }
  }
}
