import 'package:flutter/material.dart';
import 'package:palette_generator/palette_generator.dart';
import '../services/storage_service.dart';

/// 预设主题色
class PresetThemeColor {
  final String name;
  final Color color;
  
  const PresetThemeColor(this.name, this.color);
}

class ThemeProvider extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.dark;
  Color _seedColor = const Color(0xFF00A4DC); // 默认 Emby 蓝
  late final StorageService _storage;
  bool _initialized = false;

  // 预设主题色列表
  static const List<PresetThemeColor> presetColors = [
    PresetThemeColor('Emby 蓝', Color(0xFF00A4DC)),
    PresetThemeColor('翡翠绿', Color(0xFF00C896)),
    PresetThemeColor('日落橙', Color(0xFFFF6B35)),
    PresetThemeColor('薰衣草', Color(0xFF9B72AA)),
    PresetThemeColor('樱花粉', Color(0xFFFF8FAB)),
    PresetThemeColor('深海蓝', Color(0xFF1A365D)),
    PresetThemeColor('琥珀金', Color(0xFFFFB300)),
    PresetThemeColor('森林绿', Color(0xFF2D5A3D)),
    PresetThemeColor('玫瑰红', Color(0xFFE74C3C)),
    PresetThemeColor('靛蓝紫', Color(0xFF6366F1)),
  ];

  ThemeProvider() {
    _storage = StorageService();
    _init();
  }

  Future<void> _init() async {
    await _storage.init();
    await _loadSettings();
    _initialized = true;
  }

  // Getters
  ThemeMode get themeMode => _themeMode;
  bool get isDarkMode => _themeMode == ThemeMode.dark;
  Color get seedColor => _seedColor;
  bool get isInitialized => _initialized;

  /// 加载保存的设置
  Future<void> _loadSettings() async {
    // 加载主题模式
    final savedMode = await _storage.getThemeMode();
    if (savedMode != null) {
      _themeMode = ThemeMode.values.firstWhere(
        (mode) => mode.toString() == savedMode,
        orElse: () => ThemeMode.dark,
      );
    }
    
    // 加载主题色
    final savedColor = await _storage.getSeedColor();
    if (savedColor != null) {
      _seedColor = Color(savedColor);
    }
    
    notifyListeners();
  }

  /// 切换日/夜主题
  Future<void> toggleTheme() async {
    _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await _storage.saveThemeMode(_themeMode.toString());
    notifyListeners();
  }

  /// 设置主题模式
  Future<void> setThemeMode(ThemeMode mode) async {
    _themeMode = mode;
    await _storage.saveThemeMode(_themeMode.toString());
    notifyListeners();
  }

  /// 设置主题色
  Future<void> setSeedColor(Color color) async {
    _seedColor = color;
    await _storage.saveSeedColor(color.value);
    notifyListeners();
  }

  /// 从图片提取主色调
  Future<Color?> extractColorFromImage(ImageProvider imageProvider) async {
    try {
      final paletteGenerator = await PaletteGenerator.fromImageProvider(
        imageProvider,
        size: const Size(100, 100), // 缩小加快处理
        maximumColorCount: 16,
      );
      
      // 优先返回 vibrant 色，其次 dominant
      return paletteGenerator.vibrantColor?.color ??
             paletteGenerator.dominantColor?.color;
    } catch (e) {
      debugPrint('提取颜色失败: $e');
      return null;
    }
  }

  /// 从图片设置主题色
  Future<bool> setColorFromImage(ImageProvider imageProvider) async {
    final color = await extractColorFromImage(imageProvider);
    if (color != null) {
      await setSeedColor(color);
      return true;
    }
    return false;
  }

  /// 生成亮色配色方案
  ColorScheme _generateLightScheme(Color seed) {
    return ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
    );
  }

  /// 生成暗色配色方案
  ColorScheme _generateDarkScheme(Color seed) {
    return ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.dark,
      surface: const Color(0xFF1A1A1A),
    );
  }

  /// 亮色主题
  ThemeData get lightTheme {
    final colorScheme = _generateLightScheme(_seedColor);
    
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      appBarTheme: AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  /// 暗色主题
  ThemeData get darkTheme {
    final colorScheme = _generateDarkScheme(_seedColor);
    
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFF101010),
      appBarTheme: AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: colorScheme.onSurface,
      ),
      cardTheme: CardTheme(
        elevation: 2,
        color: const Color(0xFF1A1A1A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: const Color(0xFF1A1A1A),
        selectedItemColor: colorScheme.primary,
        unselectedItemColor: Colors.grey,
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: const Color(0xFF1A1A1A),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      dialogTheme: const DialogTheme(
        backgroundColor: Color(0xFF1A1A1A),
      ),
    );
  }
}
