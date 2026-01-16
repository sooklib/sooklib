import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../providers/dashboard_provider.dart';
import '../models/library.dart';
import '../services/api_config.dart';
import '../widgets/shimmer_loading.dart';
import '../utils/responsive.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().loadDashboard();
    });
  }

  void _onItemTapped(int index) {
    setState(() => _selectedIndex = index);
    switch (index) {
      case 0:
        break; // 已在首页
      case 1:
        context.go('/library');
        break;
      case 2:
        context.go('/profile');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<DashboardProvider>(
        builder: (context, provider, _) {
          if (provider.isLoading && provider.dashboardData == null) {
            return const DashboardSkeleton();
          }

          if (provider.errorMessage != null && provider.dashboardData == null) {
            return _buildErrorState(provider);
          }

          return RefreshIndicator(
            onRefresh: () => provider.refresh(),
            child: CustomScrollView(
              slivers: [
                // AppBar
                _buildSliverAppBar(),
                
                // 继续阅读
                if (provider.continueReading.isNotEmpty) ...[
                  _buildSectionHeader('▶ 继续阅读'),
                  SliverToBoxAdapter(
                    child: _buildContinueReadingRow(provider.continueReading),
                  ),
                ],
                
                // 我的书库
                if (provider.libraries.isNotEmpty) ...[
                  _buildSectionHeader('📖 我的书库'),
                  SliverToBoxAdapter(
                    child: _buildLibrariesRow(provider.libraries),
                  ),
                ],
                
                // 各书库最新
                for (var libraryLatest in provider.latestByLibrary) ...[
                  _buildSectionHeaderWithAction(
                    '📕 最新${libraryLatest.libraryName}',
                    onSeeAll: () => context.push('/library?id=${libraryLatest.libraryId}'),
                  ),
                  SliverToBoxAdapter(
                    child: _buildBooksRow(libraryLatest.books),
                  ),
                ],
                
                // 底部间距
                const SliverPadding(padding: EdgeInsets.only(bottom: 100)),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: '首页'),
          BottomNavigationBarItem(icon: Icon(Icons.library_books), label: '书库'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: '我的'),
        ],
        onTap: _onItemTapped,
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      floating: true,
      title: const Text('小说书库'),
      actions: [
        IconButton(
          icon: const Icon(Icons.search),
          onPressed: () => context.push('/search'),
        ),
        Consumer<AuthProvider>(
          builder: (context, auth, _) => Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => context.push('/profile'),
              child: CircleAvatar(
                radius: 16,
                backgroundColor: Theme.of(context).primaryColor,
                child: Text(
                  auth.currentUser?.username.substring(0, 1).toUpperCase() ?? 'U',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorState(DashboardProvider provider) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(provider.errorMessage!, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () {
              provider.clearError();
              provider.loadDashboard(forceRefresh: true);
            },
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
        child: Text(
          title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  Widget _buildSectionHeaderWithAction(String title, {VoidCallback? onSeeAll}) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 24, 8, 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            if (onSeeAll != null)
              TextButton(
                onPressed: onSeeAll,
                child: const Text('查看全部 >'),
              ),
          ],
        ),
      ),
    );
  }

  /// 继续阅读行 - 横向滚动，带进度条
  Widget _buildContinueReadingRow(List<ContinueReadingItem> items) {
    return SizedBox(
      height: 180,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          return _ContinueReadingCard(item: item);
        },
      ),
    );
  }

  /// 书库入口行
  Widget _buildLibrariesRow(List<Library> libraries) {
    return SizedBox(
      height: 130,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: libraries.length,
        itemBuilder: (context, index) {
          final library = libraries[index];
          return _LibraryCard(library: library);
        },
      ),
    );
  }

  /// 书籍横向行
  Widget _buildBooksRow(List<BookSummary> books) {
    return SizedBox(
      height: 200,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: books.length,
        itemBuilder: (context, index) {
          final book = books[index];
          return _BookPosterCard(book: book);
        },
      ),
    );
  }
}

/// 继续阅读卡片
class _ContinueReadingCard extends StatelessWidget {
  final ContinueReadingItem item;

  const _ContinueReadingCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final coverUrl = '${ApiConfig.baseUrl}${item.coverUrl ?? ''}';
    
    return Container(
      width: 260,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/books/${item.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 封面（16:9 宽幅）
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      coverUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.grey[800],
                        child: const Icon(Icons.menu_book, size: 48, color: Colors.grey),
                      ),
                    ),
                    // 渐变遮罩
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 60,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Colors.black.withOpacity(0.8)],
                          ),
                        ),
                      ),
                    ),
                    // 书名和进度
                    Positioned(
                      bottom: 8,
                      left: 8,
                      right: 8,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${(item.progress * 100).toInt()}%',
                            style: TextStyle(color: Colors.grey[300], fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // 进度条
              LinearProgressIndicator(
                value: item.progress,
                backgroundColor: Colors.grey[800],
                valueColor: AlwaysStoppedAnimation<Color>(Theme.of(context).primaryColor),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 书库入口卡片
class _LibraryCard extends StatelessWidget {
  final Library library;

  const _LibraryCard({required this.library});

  @override
  Widget build(BuildContext context) {
    final coverUrl = library.coverUrl != null 
        ? '${ApiConfig.baseUrl}${library.coverUrl}'
        : '';

    return Container(
      width: 160,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/library?id=${library.id}'),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 模糊背景
              if (coverUrl.isNotEmpty)
                ImageFiltered(
                  imageFilter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
                  child: Image.network(
                    coverUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(color: Colors.grey[800]),
                  ),
                )
              else
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Colors.blue[800]!, Colors.purple[800]!],
                    ),
                  ),
                ),
              // 遮罩
              Container(color: Colors.black.withOpacity(0.4)),
              // 书库数量角标
              Positioned(
                top: 8,
                left: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${library.bookCount}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
              // 书库名称
              Positioned(
                bottom: 12,
                left: 12,
                right: 12,
                child: Text(
                  library.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    shadows: [Shadow(blurRadius: 4, color: Colors.black)],
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 书籍海报卡片
class _BookPosterCard extends StatelessWidget {
  final BookSummary book;

  const _BookPosterCard({required this.book});

  @override
  Widget build(BuildContext context) {
    final coverUrl = '${ApiConfig.baseUrl}${book.coverUrl ?? ''}';

    return Container(
      width: 120,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/books/${book.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 封面（2:3 比例）
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      coverUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.grey[800],
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.menu_book, size: 32, color: Colors.grey),
                            const SizedBox(height: 4),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: Text(
                                book.title,
                                style: TextStyle(color: Colors.grey[500], fontSize: 10),
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    // "新"角标
                    if (book.isNew)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          child: const Text(
                            '新',
                            style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                    // 格式标签
                    if (book.fileFormat != null)
                      Positioned(
                        top: 4,
                        left: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.circular(2),
                          ),
                          child: Text(
                            book.fileFormat!.toUpperCase(),
                            style: const TextStyle(color: Colors.white, fontSize: 8),
                          ),
                        ),
                      ),
                    // 书名渐变
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Colors.black.withOpacity(0.8)],
                          ),
                        ),
                        padding: const EdgeInsets.all(6),
                        child: Text(
                          book.title,
                          style: const TextStyle(color: Colors.white, fontSize: 11),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
