/// 管理员功能服务
import 'api_client.dart';

class AdminService {
  final ApiClient _apiClient;

  AdminService(this._apiClient);

  // ===== 备份管理 =====
  
  /// 获取备份列表
  Future<List<Map<String, dynamic>>> getBackupList() async {
    final response = await _apiClient.get('/api/admin/backup/list');
    if (response.statusCode == 200) {
      final data = response.data as Map<String, dynamic>;
      return (data['backups'] as List<dynamic>).cast<Map<String, dynamic>>();
    }
    throw Exception('获取备份列表失败: ${response.statusCode}');
  }

  /// 创建备份
  Future<Map<String, dynamic>> createBackup({String? description}) async {
    final response = await _apiClient.post(
      '/api/admin/backup/create',
      data: {'description': description},
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('创建备份失败: ${response.statusCode}');
  }

  /// 删除备份
  Future<void> deleteBackup(String backupId) async {
    final response = await _apiClient.delete('/api/admin/backup/$backupId');
    if (response.statusCode != 200) {
      throw Exception('删除备份失败: ${response.statusCode}');
    }
  }

  /// 获取备份统计
  Future<Map<String, dynamic>> getBackupStats() async {
    final response = await _apiClient.get('/api/admin/backup/stats');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取备份统计失败: ${response.statusCode}');
  }

  /// 获取调度器状态
  Future<Map<String, dynamic>> getSchedulerStatus() async {
    final response = await _apiClient.get('/api/admin/backup/scheduler/status');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取调度器状态失败: ${response.statusCode}');
  }

  /// 手动触发备份
  Future<Map<String, dynamic>> triggerBackup() async {
    final response = await _apiClient.post('/api/admin/backup/scheduler/trigger', data: {});
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('触发备份失败: ${response.statusCode}');
  }

  /// 启用/禁用自动备份
  Future<void> setAutoBackup(bool enabled) async {
    final endpoint = enabled
        ? '/api/admin/backup/scheduler/enable'
        : '/api/admin/backup/scheduler/disable';
    final response = await _apiClient.post(endpoint, data: {});
    if (response.statusCode != 200) {
      throw Exception('设置自动备份失败: ${response.statusCode}');
    }
  }

  // ===== 封面管理 =====

  /// 获取封面统计
  Future<Map<String, dynamic>> getCoverStats() async {
    final response = await _apiClient.get('/api/admin/covers/stats');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取封面统计失败: ${response.statusCode}');
  }

  /// 批量提取封面
  Future<Map<String, dynamic>> batchExtractCovers({int? limit}) async {
    final response = await _apiClient.post(
      '/api/admin/covers/batch-extract',
      data: {'limit': limit},
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('批量提取封面失败: ${response.statusCode}');
  }

  /// 清理孤立封面
  Future<Map<String, dynamic>> cleanupOrphanedCovers() async {
    final response = await _apiClient.delete('/api/admin/covers/cleanup');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('清理封面失败: ${response.statusCode}');
  }

  // ===== 文件名规则管理 =====

  /// 获取规则列表
  Future<List<Map<String, dynamic>>> getFilenamePatterns() async {
    final response = await _apiClient.get('/api/admin/filename-patterns');
    if (response.statusCode == 200) {
      return (response.data as List<dynamic>).cast<Map<String, dynamic>>();
    }
    throw Exception('获取规则列表失败: ${response.statusCode}');
  }

  /// 获取规则统计
  Future<Map<String, dynamic>> getPatternStats() async {
    final response = await _apiClient.get('/api/admin/filename-patterns/stats/summary');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取规则统计失败: ${response.statusCode}');
  }

  /// 创建规则
  Future<Map<String, dynamic>> createPattern(Map<String, dynamic> data) async {
    final response = await _apiClient.post('/api/admin/filename-patterns', data: data);
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('创建规则失败: ${response.statusCode}');
  }

  /// 删除规则
  Future<void> deletePattern(int patternId) async {
    final response = await _apiClient.delete('/api/admin/filename-patterns/$patternId');
    if (response.statusCode != 200) {
      throw Exception('删除规则失败: ${response.statusCode}');
    }
  }

  // ===== 书库管理 =====

  /// 获取书库列表
  Future<List<Map<String, dynamic>>> getLibraries() async {
    final response = await _apiClient.get('/api/libraries');
    if (response.statusCode == 200) {
      return (response.data as List<dynamic>).cast<Map<String, dynamic>>();
    }
    throw Exception('获取书库列表失败: ${response.statusCode}');
  }

  /// 获取书库详情
  Future<Map<String, dynamic>> getLibrary(int libraryId) async {
    final response = await _apiClient.get('/api/libraries/$libraryId');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取书库详情失败: ${response.statusCode}');
  }

  /// 创建书库
  Future<Map<String, dynamic>> createLibrary({
    required String name,
    required String path,
  }) async {
    final response = await _apiClient.post(
      '/api/libraries',
      data: {'name': name, 'path': path},
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('创建书库失败: ${response.statusCode}');
  }

  /// 更新书库
  Future<Map<String, dynamic>> updateLibrary(
    int libraryId, {
    String? name,
    String? path,
  }) async {
    final response = await _apiClient.put(
      '/api/libraries/$libraryId',
      data: {'name': name, 'path': path},
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('更新书库失败: ${response.statusCode}');
  }

  /// 删除书库
  Future<void> deleteLibrary(int libraryId) async {
    final response = await _apiClient.delete('/api/libraries/$libraryId');
    if (response.statusCode != 200) {
      throw Exception('删除书库失败: ${response.statusCode}');
    }
  }

  /// 获取书库统计
  Future<Map<String, dynamic>> getLibraryStats(int libraryId) async {
    final response = await _apiClient.get('/api/libraries/$libraryId/stats');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取书库统计失败: ${response.statusCode}');
  }

  /// 扫描书库
  Future<Map<String, dynamic>> scanLibrary(int libraryId) async {
    final response = await _apiClient.post('/api/libraries/$libraryId/scan', data: {});
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('扫描书库失败: ${response.statusCode}');
  }

  /// 设置书库公开状态
  Future<Map<String, dynamic>> setLibraryPublic(int libraryId, bool isPublic) async {
    final response = await _apiClient.put(
      '/api/admin/libraries/$libraryId/public?is_public=$isPublic',
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('设置书库状态失败: ${response.statusCode}');
  }

  /// 获取书库授权用户
  Future<Map<String, dynamic>> getLibraryUsers(int libraryId) async {
    final response = await _apiClient.get('/api/admin/libraries/$libraryId/users');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取书库用户失败: ${response.statusCode}');
  }

  // ===== 用户管理 =====

  /// 获取用户列表
  Future<List<Map<String, dynamic>>> getUsers({String? search, int page = 1, int limit = 50}) async {
    String url = '/api/admin/users?page=$page&limit=$limit';
    if (search != null && search.isNotEmpty) {
      url += '&search=$search';
    }
    final response = await _apiClient.get(url);
    if (response.statusCode == 200) {
      return (response.data as List<dynamic>).cast<Map<String, dynamic>>();
    }
    throw Exception('获取用户列表失败: ${response.statusCode}');
  }

  /// 获取用户详情
  Future<Map<String, dynamic>> getUser(int userId) async {
    final response = await _apiClient.get('/api/admin/users/$userId');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取用户详情失败: ${response.statusCode}');
  }

  /// 创建用户
  Future<Map<String, dynamic>> createUser({
    required String username,
    required String password,
    bool isAdmin = false,
    String ageRatingLimit = 'all',
  }) async {
    final response = await _apiClient.post(
      '/api/admin/users',
      data: {
        'username': username,
        'password': password,
        'is_admin': isAdmin,
        'age_rating_limit': ageRatingLimit,
      },
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('创建用户失败: ${response.statusCode}');
  }

  /// 更新用户
  Future<Map<String, dynamic>> updateUser(
    int userId, {
    String? username,
    bool? isAdmin,
    String? ageRatingLimit,
  }) async {
    final response = await _apiClient.put(
      '/api/admin/users/$userId',
      data: {
        if (username != null) 'username': username,
        if (isAdmin != null) 'is_admin': isAdmin,
        if (ageRatingLimit != null) 'age_rating_limit': ageRatingLimit,
      },
    );
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('更新用户失败: ${response.statusCode}');
  }

  /// 删除用户
  Future<void> deleteUser(int userId) async {
    final response = await _apiClient.delete('/api/admin/users/$userId');
    if (response.statusCode != 200) {
      throw Exception('删除用户失败: ${response.statusCode}');
    }
  }

  /// 重置用户密码
  Future<void> resetUserPassword(int userId, String newPassword) async {
    final response = await _apiClient.put(
      '/api/admin/users/$userId/password',
      data: {'new_password': newPassword},
    );
    if (response.statusCode != 200) {
      throw Exception('重置密码失败: ${response.statusCode}');
    }
  }

  /// 获取用户书库权限
  Future<Map<String, dynamic>> getUserLibraryAccess(int userId) async {
    final response = await _apiClient.get('/api/admin/users/$userId/library-access');
    if (response.statusCode == 200) {
      return response.data as Map<String, dynamic>;
    }
    throw Exception('获取用户权限失败: ${response.statusCode}');
  }

  /// 更新用户书库权限
  Future<void> updateUserLibraryAccess(int userId, List<int> libraryIds) async {
    final response = await _apiClient.put(
      '/api/admin/users/$userId/library-access',
      data: {'library_ids': libraryIds},
    );
    if (response.statusCode != 200) {
      throw Exception('更新用户权限失败: ${response.statusCode}');
    }
  }
}
