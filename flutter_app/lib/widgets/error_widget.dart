import 'package:flutter/material.dart';

/// 网络错误类型
enum NetworkErrorType {
  noConnection,
  timeout,
  serverError,
  unauthorized,
  forbidden,
  notFound,
  unknown,
}

/// 错误状态组件
class ErrorStateWidget extends StatelessWidget {
  final String? message;
  final NetworkErrorType? errorType;
  final VoidCallback? onRetry;
  final String? retryButtonText;
  final bool showIcon;
  final bool compact;

  const ErrorStateWidget({
    super.key,
    this.message,
    this.errorType,
    this.onRetry,
    this.retryButtonText,
    this.showIcon = true,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final errorInfo = _getErrorInfo();
    
    if (compact) {
      return _buildCompactError(context, errorInfo);
    }
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showIcon) ...[
              Icon(
                errorInfo.icon,
                size: 80,
                color: errorInfo.color,
              ),
              const SizedBox(height: 24),
            ],
            Text(
              errorInfo.title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              message ?? errorInfo.message,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[500],
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: Text(retryButtonText ?? '重试'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 32,
                    vertical: 12,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCompactError(BuildContext context, _ErrorInfo errorInfo) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: errorInfo.color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(errorInfo.icon, color: errorInfo.color, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  errorInfo.title,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(
                  message ?? errorInfo.message,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              child: Text(retryButtonText ?? '重试'),
            ),
        ],
      ),
    );
  }

  _ErrorInfo _getErrorInfo() {
    switch (errorType) {
      case NetworkErrorType.noConnection:
        return _ErrorInfo(
          icon: Icons.wifi_off,
          color: Colors.orange,
          title: '网络连接失败',
          message: '请检查您的网络连接后重试',
        );
      case NetworkErrorType.timeout:
        return _ErrorInfo(
          icon: Icons.access_time,
          color: Colors.amber,
          title: '请求超时',
          message: '服务器响应缓慢，请稍后重试',
        );
      case NetworkErrorType.serverError:
        return _ErrorInfo(
          icon: Icons.cloud_off,
          color: Colors.red,
          title: '服务器错误',
          message: '服务器出现问题，请稍后重试',
        );
      case NetworkErrorType.unauthorized:
        return _ErrorInfo(
          icon: Icons.lock_outline,
          color: Colors.red,
          title: '登录已过期',
          message: '请重新登录',
        );
      case NetworkErrorType.forbidden:
        return _ErrorInfo(
          icon: Icons.block,
          color: Colors.red,
          title: '权限不足',
          message: '您没有权限访问此内容',
        );
      case NetworkErrorType.notFound:
        return _ErrorInfo(
          icon: Icons.search_off,
          color: Colors.grey,
          title: '内容不存在',
          message: '您查找的内容已被删除或不存在',
        );
      default:
        return _ErrorInfo(
          icon: Icons.error_outline,
          color: Colors.red,
          title: '出错了',
          message: '发生了未知错误，请稍后重试',
        );
    }
  }
}

class _ErrorInfo {
  final IconData icon;
  final Color color;
  final String title;
  final String message;

  _ErrorInfo({
    required this.icon,
    required this.color,
    required this.title,
    required this.message,
  });
}

/// 空状态组件
class EmptyStateWidget extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  const EmptyStateWidget({
    super.key,
    this.icon = Icons.inbox,
    required this.title,
    this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 80,
              color: Colors.grey[600],
            ),
            const SizedBox(height: 24),
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: 12),
              Text(
                message!,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[500],
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 24),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// 网络错误 SnackBar
void showErrorSnackBar(
  BuildContext context,
  String message, {
  Duration duration = const Duration(seconds: 3),
  VoidCallback? onRetry,
}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      duration: duration,
      action: onRetry != null
          ? SnackBarAction(
              label: '重试',
              onPressed: onRetry,
            )
          : null,
    ),
  );
}

/// 连接错误对话框
Future<bool?> showConnectionErrorDialog(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.wifi_off, color: Colors.orange),
          SizedBox(width: 12),
          Text('网络连接失败'),
        ],
      ),
      content: const Text('无法连接到服务器，请检查您的网络连接后重试。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('取消'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('重试'),
        ),
      ],
    ),
  );
}

/// 从错误对象解析错误类型
NetworkErrorType parseErrorType(dynamic error) {
  final errorString = error.toString().toLowerCase();
  
  if (errorString.contains('socketexception') ||
      errorString.contains('failed host lookup') ||
      errorString.contains('connection refused') ||
      errorString.contains('connection error')) {
    return NetworkErrorType.noConnection;
  }
  
  if (errorString.contains('timeout')) {
    return NetworkErrorType.timeout;
  }
  
  if (errorString.contains('401')) {
    return NetworkErrorType.unauthorized;
  }
  
  if (errorString.contains('403')) {
    return NetworkErrorType.forbidden;
  }
  
  if (errorString.contains('404')) {
    return NetworkErrorType.notFound;
  }
  
  if (errorString.contains('500') ||
      errorString.contains('502') ||
      errorString.contains('503')) {
    return NetworkErrorType.serverError;
  }
  
  return NetworkErrorType.unknown;
}

/// 获取友好的错误消息
String getErrorMessage(dynamic error, {NetworkErrorType? type}) {
  type ??= parseErrorType(error);
  
  switch (type) {
    case NetworkErrorType.noConnection:
      return '网络连接失败，请检查网络设置';
    case NetworkErrorType.timeout:
      return '请求超时，请稍后重试';
    case NetworkErrorType.serverError:
      return '服务器错误，请稍后重试';
    case NetworkErrorType.unauthorized:
      return '登录已过期，请重新登录';
    case NetworkErrorType.forbidden:
      return '没有权限访问此内容';
    case NetworkErrorType.notFound:
      return '内容不存在';
    default:
      return '发生了错误: ${error.toString().substring(0, 50)}...';
  }
}
