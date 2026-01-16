import '../models/user.dart';
import 'api_client.dart';
import 'api_config.dart';
import 'storage_service.dart';

class AuthService {
  final ApiClient _apiClient;
  final StorageService _storage;

  AuthService(this._apiClient, this._storage);

  // 登录
  Future<User> login(String username, String password) async {
    final response = await _apiClient.post(
      ApiConfig.loginEndpoint,
      data: {
        'username': username,
        'password': password,
      },
    );

    if (response.statusCode == 200) {
      final data = response.data as Map<String, dynamic>;
      final token = data['access_token'] as String;
      
      // 保存token
      await _storage.saveToken(token);
      
      // 获取用户信息
      final user = await getCurrentUser();
      await _storage.saveUser(user);
      
      return user;
    } else {
      throw Exception('登录失败');
    }
  }

  // 获取当前用户信息
  Future<User> getCurrentUser() async {
    final response = await _apiClient.get(ApiConfig.currentUserEndpoint);
    
    if (response.statusCode == 200) {
      return User.fromJson(response.data as Map<String, dynamic>);
    } else {
      throw Exception('获取用户信息失败');
    }
  }

  // 登出
  Future<void> logout() async {
    await _storage.deleteToken();
    await _storage.deleteUser();
  }

  // 检查是否已登录
  Future<bool> isLoggedIn() async {
    final token = await _storage.getToken();
    return token != null && token.isNotEmpty;
  }

  // 获取保存的用户信息
  Future<User?> getSavedUser() async {
    return await _storage.getUser();
  }
}
