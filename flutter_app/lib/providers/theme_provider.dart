import 'package:flutter/material.dart';
import '../services/storage_service.dart';

class ThemeProvider extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.dark;
  late final StorageService _storage;

  ThemeProvider() {
    _storage = StorageService();
    _init();
  }

  Future<void> _init() async {
    await _storage.init();
    await _loadTheme();
  }

  ThemeMode get themeMode => _themeMode;
  bool get isDarkMode => _themeMode == ThemeMode.dark;

  // 加载保存的主题
  Future<void> _loadTheme() async {
    final savedMode = await _storage.getThemeMode();
    if (savedMode != null) {
      _themeMode = ThemeMode.values.firstWhere(
        (mode) => mode.toString() == savedMode,
        orElse: () => ThemeMode.dark,
      );
      notifyListeners();
    }
  }

  // 切换主题
  Future<void> toggleTheme() async {
    _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await _storage.saveThemeMode(_themeMode.toString());
    notifyListeners();
  }

  // 设置主题
  Future<void> setTheme(ThemeMode mode) async {
    _themeMode = mode;
    await _storage.saveThemeMode(_themeMode.toString());
    notifyListeners();
  }

  // 设置主题模式（别名）
  Future<void> setThemeMode(ThemeMode mode) async {
    await setTheme(mode);
  }

  // 亮色主题
  ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Colors.blue,
        brightness: Brightness.light,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  // 暗色主题 (Emby风格)
  ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF00A4DC), // Emby蓝色
        brightness: Brightness.dark,
        background: const Color(0xFF101010), // 深色背景
        surface: const Color(0xFF1A1A1A),
      ),
      scaffoldBackgroundColor: const Color(0xFF101010),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: Color(0xFF1A1A1A),
      ),
      cardTheme: CardTheme(
        elevation: 2,
        color: const Color(0xFF1A1A1A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Color(0xFF1A1A1A),
        selectedItemColor: Color(0xFF00A4DC),
        unselectedItemColor: Colors.grey,
      ),
    );
  }
}
