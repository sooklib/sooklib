import 'dart:html' as html;
import 'dart:ui_web' as ui_web;
import 'package:flutter/material.dart';
import '../services/api_config.dart';
import '../services/storage_service.dart';

class ReaderScreen extends StatefulWidget {
  final int bookId;

  const ReaderScreen({super.key, required this.bookId});

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  late StorageService _storage;
  bool _isLoading = true;
  String? _errorMessage;
  late String _viewType;
  bool _iframeRegistered = false;

  @override
  void initState() {
    super.initState();
    _viewType = 'reader-iframe-${widget.bookId}-${DateTime.now().millisecondsSinceEpoch}';
    _initReader();
  }

  Future<void> _initReader() async {
    try {
      _storage = StorageService();
      await _storage.init();
      
      // 获取 token
      final token = await _storage.getToken();
      if (token == null) {
        setState(() {
          _errorMessage = '未登录，请先登录';
          _isLoading = false;
        });
        return;
      }

      // 注册 iframe 视图
      _registerIframeView(token);
      
      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = '加载阅读器失败: $e';
        _isLoading = false;
      });
    }
  }

  void _registerIframeView(String token) {
    if (_iframeRegistered) return;
    
    // 构建阅读器 URL（带 token）
    final readerUrl = '${ApiConfig.baseUrl}/reader/${widget.bookId}?token=$token';
    
    // 创建 iframe 元素
    final iframe = html.IFrameElement()
      ..src = readerUrl
      ..style.border = 'none'
      ..style.width = '100%'
      ..style.height = '100%'
      ..allowFullscreen = true;
    
    // 注册平台视图
    ui_web.platformViewRegistry.registerViewFactory(
      _viewType,
      (int viewId) => iframe,
    );
    
    _iframeRegistered = true;
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('阅读器'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_errorMessage != null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('阅读器'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text(_errorMessage!),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _initReader,
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }

    // 使用 HtmlElementView 嵌入 iframe
    return Scaffold(
      appBar: AppBar(
        title: const Text('阅读器'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.open_in_new),
            onPressed: () {
              // 在新标签页打开阅读器
              _storage.getToken().then((token) {
                final url = '${ApiConfig.baseUrl}/reader/${widget.bookId}?token=$token';
                html.window.open(url, '_blank');
              });
            },
            tooltip: '在新窗口打开',
          ),
        ],
      ),
      body: HtmlElementView(viewType: _viewType),
    );
  }
}
