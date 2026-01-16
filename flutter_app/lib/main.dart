import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';

import 'providers/auth_provider.dart';
import 'providers/theme_provider.dart';
import 'providers/book_provider.dart';
import 'providers/dashboard_provider.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/home_screen.dart';
import 'screens/library_screen.dart';
import 'screens/book_detail_screen.dart';
import 'screens/reader_screen.dart';
import 'screens/search_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/settings_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => BookProvider()),
        ChangeNotifierProvider(create: (_) => DashboardProvider()),
      ],
      child: Consumer2<AuthProvider, ThemeProvider>(
        builder: (context, authProvider, themeProvider, _) {
          return MaterialApp.router(
            title: '小说书库',
            theme: themeProvider.lightTheme,
            darkTheme: themeProvider.darkTheme,
            themeMode: themeProvider.themeMode,
            routerConfig: _router(authProvider),
            debugShowCheckedModeBanner: false,
          );
        },
      ),
    );
  }

  GoRouter _router(AuthProvider authProvider) {
    return GoRouter(
      // 监听认证状态变化，当状态变化时重新评估路由
      refreshListenable: authProvider,
      redirect: (context, state) {
        final currentPath = state.matchedLocation;
        
        // 如果还在初始化，不做任何重定向，保持当前URL
        // 这样刷新页面时不会跳转
        if (!authProvider.isInitialized) {
          return null;
        }
        
        final isAuth = authProvider.isAuthenticated;
        final isLoggingIn = currentPath == '/login';
        
        // 未登录且不在登录页 -> 跳转登录
        if (!isAuth && !isLoggingIn) {
          return '/login';
        }

        // 已登录在登录页 -> 跳转首页
        if (isAuth && isLoggingIn) {
          return '/home';
        }
        
        // 已登录访问根路径 -> 跳转首页
        if (isAuth && (currentPath == '/' || currentPath.isEmpty)) {
          return '/home';
        }

        // 其他情况保持当前路由（这是关键！）
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
        ),
        GoRoute(
          path: '/home',
          builder: (context, state) => const DashboardScreen(),  // 使用 Emby 风格首页
        ),
        GoRoute(
          path: '/home-old',  // 保留旧版首页
          builder: (context, state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/library',
          builder: (context, state) {
            // 支持通过 query 参数筛选书库
            final libraryIdStr = state.uri.queryParameters['libraryId'];
            final libraryId = libraryIdStr != null ? int.tryParse(libraryIdStr) : null;
            return LibraryScreen(libraryId: libraryId);
          },
        ),
        GoRoute(
          path: '/books/:id',
          builder: (context, state) {
            final id = int.parse(state.pathParameters['id']!);
            return BookDetailScreen(bookId: id);
          },
        ),
        GoRoute(
          path: '/reader/:id',
          builder: (context, state) {
            final id = int.parse(state.pathParameters['id']!);
            return ReaderScreen(bookId: id);
          },
        ),
        GoRoute(
          path: '/search',
          builder: (context, state) => const SearchScreen(),
        ),
        GoRoute(
          path: '/profile',
          builder: (context, state) => const ProfileScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
    );
  }
}
