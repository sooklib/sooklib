import 'package:flutter/foundation.dart' show kIsWeb;

class ApiConfig {
  // API基础URL - Web部署时自动使用当前域名
  static String get baseUrl {
    if (kIsWeb) {
      // Web环境：使用当前域名（通过Nginx代理）
      return '';  // 空字符串表示使用相对路径
    }
    // 移动端/桌面端：使用完整URL
    return 'http://localhost:8000';
  }
  
  // API端点
  static const String loginEndpoint = '/api/auth/login';
  static const String currentUserEndpoint = '/api/auth/me';
  static const String booksEndpoint = '/api/books';
  static const String librariesEndpoint = '/api/libraries';
  static const String authorsEndpoint = '/api/authors';
  static const String searchEndpoint = '/api/search';
  static const String progressEndpoint = '/api/progress';
  static const String favoritesEndpoint = '/api/user/favorites';
  static const String tagsEndpoint = '/api/tags';
  static const String myTagsEndpoint = '/api/user/my-tags';
  
  // 请求超时配置
  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);
  
  // 本地存储键
  static const String tokenKey = 'access_token';
  static const String userKey = 'current_user';
}
