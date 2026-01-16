/// 管理中心主页面
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_service.dart';
import '../../services/api_client.dart';
import '../../services/storage_service.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  late AdminService _adminService;
  bool _isLoading = true;
  String? _errorMessage;
  
  // 统计数据
  Map<String, dynamic>? _backupStats;
  Map<String, dynamic>? _coverStats;
  Map<String, dynamic>? _schedulerStatus;

  @override
  void initState() {
    super.initState();
    _initService();
  }

  Future<void> _initService() async {
    final storage = StorageService();
    await storage.init();
    final apiClient = ApiClient(storage);
    _adminService = AdminService(apiClient);
    await _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final results = await Future.wait([
        _adminService.getBackupStats().catchError((_) => <String, dynamic>{}),
        _adminService.getCoverStats().catchError((_) => <String, dynamic>{}),
        _adminService.getSchedulerStatus().catchError((_) => <String, dynamic>{}),
      ]);
      
      setState(() {
        _backupStats = results[0];
        _coverStats = results[1];
        _schedulerStatus = results[2];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = '加载失败: $e';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('管理中心'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/profile'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadStats,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? _buildErrorView()
              : RefreshIndicator(
                  onRefresh: _loadStats,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildOverviewSection(),
                      const SizedBox(height: 24),
                      _buildMenuSection(),
                    ],
                  ),
                ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(_errorMessage!),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadStats,
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildOverviewSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '系统概览',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildStatCard(
                icon: Icons.backup,
                label: '备份数量',
                value: _backupStats?['total_backups']?.toString() ?? '0',
                color: Colors.blue,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildStatCard(
                icon: Icons.image,
                label: '封面总数',
                value: _coverStats?['total_covers']?.toString() ?? '0',
                color: Colors.green,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildStatCard(
                icon: Icons.schedule,
                label: '自动备份',
                value: _schedulerStatus?['auto_backup_enabled'] == true ? '已启用' : '已禁用',
                color: _schedulerStatus?['auto_backup_enabled'] == true
                    ? Colors.green
                    : Colors.grey,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildStatCard(
                icon: Icons.storage,
                label: '备份大小',
                value: _formatSize(_backupStats?['total_size'] ?? 0),
                color: Colors.orange,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(fontSize: 12, color: Colors.grey[400]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '管理功能',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        _buildMenuCard(
          icon: Icons.backup,
          title: '备份管理',
          subtitle: '创建、恢复和管理数据库备份',
          color: Colors.blue,
          onTap: () => context.push('/admin/backup'),
        ),
        _buildMenuCard(
          icon: Icons.image,
          title: '封面管理',
          subtitle: '批量提取封面、清理孤立文件',
          color: Colors.green,
          onTap: () => context.push('/admin/covers'),
        ),
        _buildMenuCard(
          icon: Icons.library_books,
          title: '书库管理',
          subtitle: '扫描书库、管理书籍文件',
          color: Colors.purple,
          onTap: () => context.push('/admin/libraries'),
        ),
        _buildMenuCard(
          icon: Icons.text_fields,
          title: '文件名规则',
          subtitle: '配置文件名解析规则',
          color: Colors.orange,
          onTap: () => context.push('/admin/patterns'),
        ),
        _buildMenuCard(
          icon: Icons.people,
          title: '用户管理',
          subtitle: '管理用户账号和权限',
          color: Colors.teal,
          onTap: () => context.push('/admin/users'),
        ),
      ],
    );
  }

  Widget _buildMenuCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withOpacity(0.2),
          child: Icon(icon, color: color),
        ),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }

  String _formatSize(dynamic bytes) {
    if (bytes == null || bytes == 0) return '0 B';
    final size = bytes is int ? bytes : int.tryParse(bytes.toString()) ?? 0;
    const suffixes = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    double s = size.toDouble();
    while (s >= 1024 && i < suffixes.length - 1) {
      s /= 1024;
      i++;
    }
    return '${s.toStringAsFixed(1)} ${suffixes[i]}';
  }
}
