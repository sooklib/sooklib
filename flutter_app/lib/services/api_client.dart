import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'api_config.dart';
import 'storage_service.dart';

class ApiClient {
  late final Dio _dio;
  final StorageService _storage;

  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: ApiConfig.connectTimeout,
      receiveTimeout: ApiConfig.receiveTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    ));

    // 请求拦截器
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        // 添加认证token
        final token = await _storage.getToken();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
          debugPrint('🔑 Token: present (${token.length} chars)');
        } else {
          debugPrint('⚠️ Token: null or empty');
        }
        
        // 构建完整URL用于调试
        final fullUrl = '${options.baseUrl}${options.path}';
        debugPrint('🌐 Request: ${options.method} $fullUrl');
        if (options.queryParameters.isNotEmpty) {
          debugPrint('📝 Query: ${options.queryParameters}');
        }
        
        return handler.next(options);
      },
      onResponse: (response, handler) {
        debugPrint('✅ Response: ${response.statusCode} ${response.requestOptions.path}');
        if (kDebugMode) {
          // 只在调试模式下打印响应体概要
          final data = response.data;
          if (data is List) {
            debugPrint('📦 Data: List with ${data.length} items');
          } else if (data is Map) {
            debugPrint('📦 Data: Map with ${data.keys.take(5).toList()} keys');
          }
        }
        return handler.next(response);
      },
      onError: (error, handler) {
        debugPrint('❌ Error: ${error.response?.statusCode ?? "no status"} ${error.requestOptions.path}');
        debugPrint('❌ Error type: ${error.type}');
        debugPrint('❌ Error message: ${error.message}');
        if (error.response != null) {
          debugPrint('❌ Response body: ${error.response?.data}');
        }
        return handler.next(error);
      },
    ));
  }

  // 通用GET请求
  Future<Response> get(String path, {Map<String, dynamic>? queryParameters}) async {
    try {
      return await _dio.get(path, queryParameters: queryParameters);
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  // 通用POST请求
  Future<Response> post(String path, {dynamic data}) async {
    try {
      return await _dio.post(path, data: data);
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  // 通用PUT请求
  Future<Response> put(String path, {dynamic data}) async {
    try {
      return await _dio.put(path, data: data);
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  // 通用DELETE请求
  Future<Response> delete(String path) async {
    try {
      return await _dio.delete(path);
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  // 文件下载
  Future<void> download(
    String urlPath,
    String savePath, {
    ProgressCallback? onReceiveProgress,
  }) async {
    try {
      await _dio.download(
        urlPath,
        savePath,
        onReceiveProgress: onReceiveProgress,
      );
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  // 错误处理
  void _handleError(dynamic error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
          debugPrint('⏱️ 连接超时');
          break;
        case DioExceptionType.sendTimeout:
          debugPrint('⏱️ 发送超时');
          break;
        case DioExceptionType.receiveTimeout:
          debugPrint('⏱️ 接收超时');
          break;
        case DioExceptionType.badResponse:
          debugPrint('🚫 服务器返回错误: ${error.response?.statusCode}');
          if (error.response?.statusCode == 401) {
            debugPrint('🔐 认证失败 - Token可能已过期或无效');
          } else if (error.response?.statusCode == 403) {
            debugPrint('🚷 权限不足');
          }
          break;
        case DioExceptionType.cancel:
          debugPrint('🚫 请求被取消');
          break;
        case DioExceptionType.connectionError:
          debugPrint('🌐 连接错误 - 请检查网络或服务器状态');
          break;
        case DioExceptionType.badCertificate:
          debugPrint('🔒 证书错误');
          break;
        case DioExceptionType.unknown:
        default:
          debugPrint('❓ 未知错误: ${error.message}');
      }
    }
  }
}
