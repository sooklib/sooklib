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
      initialLocation: authProvider.isAuthenticated ? '/home' : '/login',
      redirect: (context, state) {
        final isAuth = authProvider.isAuthenticated;
        final isLoggingIn = state.matchedLocation == '/login';

        if (!isAuth && !isLoggingIn) {
          return '/login';
        }

        if (isAuth && isLoggingIn) {
          return '/home';
        }

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
          builder: (context, state) => const LibraryScreen(),
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
      ],
    );
  }
}
