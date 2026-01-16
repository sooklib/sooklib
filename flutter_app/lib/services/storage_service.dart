import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../models/user.dart';
import 'api_config.dart';

class StorageService {
  SharedPreferences? _prefs;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    
    debugPrint('💾 StorageService: Initializing...');
    _prefs = await SharedPreferences.getInstance();
    _initialized = true;
    debugPrint('💾 StorageService: Initialized successfully');
    
    // 调试：打印当前存储的数据
    if (kDebugMode) {
      final token = _prefs?.getString(ApiConfig.tokenKey);
      debugPrint('💾 StorageService: Token present: ${token != null && token.isNotEmpty}');
    }
  }

  // Token管理
  Future<void> saveToken(String token) async {
    debugPrint('💾 StorageService: Saving token (${token.length} chars)');
    await _prefs?.setString(ApiConfig.tokenKey, token);
  }

  Future<String?> getToken() async {
    if (_prefs == null) {
      debugPrint('⚠️ StorageService: getToken called before init!');
      return null;
    }
    final token = _prefs?.getString(ApiConfig.tokenKey);
    debugPrint('💾 StorageService: getToken returns ${token != null ? "token (${token.length} chars)" : "null"}');
    return token;
  }

  Future<void> deleteToken() async {
    debugPrint('💾 StorageService: Deleting token');
    await _prefs?.remove(ApiConfig.tokenKey);
  }

  // 用户信息管理
  Future<void> saveUser(User user) async {
    final userJson = json.encode(user.toJson());
    debugPrint('💾 StorageService: Saving user: ${user.username}');
    await _prefs?.setString(ApiConfig.userKey, userJson);
  }

  Future<User?> getUser() async {
    final userJson = _prefs?.getString(ApiConfig.userKey);
    if (userJson == null) {
      debugPrint('💾 StorageService: No saved user');
      return null;
    }
    
    try {
      final userMap = json.decode(userJson) as Map<String, dynamic>;
      final user = User.fromJson(userMap);
      debugPrint('💾 StorageService: Loaded user: ${user.username}');
      return user;
    } catch (e) {
      debugPrint('❌ StorageService: Error loading user: $e');
      return null;
    }
  }

  Future<void> deleteUser() async {
    debugPrint('💾 StorageService: Deleting user');
    await _prefs?.remove(ApiConfig.userKey);
  }

  // 清除所有数据
  Future<void> clearAll() async {
    debugPrint('💾 StorageService: Clearing all data');
    await _prefs?.clear();
  }

  // 主题设置
  Future<void> saveThemeMode(String mode) async {
    await _prefs?.setString('theme_mode', mode);
  }

  Future<String?> getThemeMode() async {
    return _prefs?.getString('theme_mode');
  }

  // 主题色存储
  Future<void> saveSeedColor(int colorValue) async {
    await _prefs?.setInt('seed_color', colorValue);
  }

  Future<int?> getSeedColor() async {
    return _prefs?.getInt('seed_color');
  }

  // 记住密码
  Future<void> saveRememberMe(bool value) async {
    await _prefs?.setBool('remember_me', value);
  }

  Future<bool> getRememberMe() async {
    return _prefs?.getBool('remember_me') ?? false;
  }

  Future<void> saveUsername(String username) async {
    await _prefs?.setString('saved_username', username);
  }

  Future<String?> getSavedUsername() async {
    return _prefs?.getString('saved_username');
  }
}
