import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../providers/book_provider.dart';
import '../providers/dashboard_provider.dart';
import '../widgets/book_card.dart';

class LibraryScreen extends StatefulWidget {
  final int? libraryId;
  
  const LibraryScreen({super.key, this.libraryId});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    
    // 初始加载
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final bookProvider = context.read<BookProvider>();
      
      // 如果传入了 libraryId，设置筛选条件
      if (widget.libraryId != null) {
        bookProvider.setFilter(libraryId: widget.libraryId);
      } else {
        bookProvider.loadBooks();
      }
    });

    // 监听滚动，实现无限加载
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        context.read<BookProvider>().loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  // 根据屏幕宽度计算网格列数
  int _getCrossAxisCount(double width) {
    if (width < 400) return 2;       // 手机窄屏
    if (width < 600) return 3;       // 手机横屏
    if (width < 900) return 4;       // 平板
    if (width < 1200) return 5;      // 小桌面
    if (width < 1600) return 6;      // 中桌面
    return 8;                        // 大桌面
  }

  void _showFilterDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) {
        return Consumer<DashboardProvider>(
          builder: (context, dashboardProvider, child) {
            final libraries = dashboardProvider.libraries;
            final currentLibraryId = context.read<BookProvider>().libraryId;
            
            return Container(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '筛选书库',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  
                  // 全部选项
                  ListTile(
                    leading: Icon(
                      Icons.all_inclusive,
                      color: currentLibraryId == null ? Theme.of(context).primaryColor : null,
                    ),
                    title: const Text('全部书库'),
                    selected: currentLibraryId == null,
                    onTap: () {
                      context.read<BookProvider>().clearFilter();
                      Navigator.pop(ctx);
                    },
                  ),
                  
                  const Divider(),
                  
                  // 书库列表
                  if (libraries.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else
                    ...libraries.map((library) => ListTile(
                      leading: Icon(
                        Icons.folder,
                        color: currentLibraryId == library.id 
                            ? Theme.of(context).primaryColor 
                            : null,
                      ),
                      title: Text(library.name),
                      subtitle: Text('${library.bookCount ?? 0} 本书'),
                      selected: currentLibraryId == library.id,
                      onTap: () {
                        context.read<BookProvider>().setFilter(libraryId: library.id);
                        Navigator.pop(ctx);
                      },
                    )),
                  
                  const SizedBox(height: 16),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Consumer<BookProvider>(
          builder: (context, bookProvider, child) {
            if (bookProvider.libraryId != null) {
              return const Text('筛选中...');
            }
            return const Text('书库');
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              context.push('/search');
            },
          ),
          Consumer<BookProvider>(
            builder: (context, bookProvider, child) {
              final hasFilter = bookProvider.libraryId != null;
              return Stack(
                children: [
                  IconButton(
                    icon: const Icon(Icons.filter_list),
                    onPressed: () => _showFilterDialog(context),
                  ),
                  if (hasFilter)
                    Positioned(
                      right: 8,
                      top: 8,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
      body: Consumer<BookProvider>(
        builder: (context, bookProvider, child) {
          // 错误状态
          if (bookProvider.errorMessage != null && bookProvider.books.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 64,
                    color: Colors.red,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    bookProvider.errorMessage!,
                    style: const TextStyle(fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      bookProvider.clearError();
                      bookProvider.loadBooks(refresh: true);
                    },
                    child: const Text('重试'),
                  ),
                ],
              ),
            );
          }

          // 加载中且列表为空
          if (bookProvider.isLoading && bookProvider.books.isEmpty) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          // 空状态
          if (bookProvider.books.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.library_books_outlined,
                    size: 64,
                    color: Colors.grey[600],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    '暂无书籍',
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.grey[400],
                    ),
                  ),
                ],
              ),
            );
          }

          // 书籍网格 - 响应式
          return RefreshIndicator(
            onRefresh: () => bookProvider.refresh(),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final crossAxisCount = _getCrossAxisCount(constraints.maxWidth);
                
                return GridView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(12),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxisCount,
                    childAspectRatio: 0.65,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: bookProvider.books.length + 
                             (bookProvider.isLoadingMore ? 1 : 0),
                  itemBuilder: (context, index) {
                    // 加载更多指示器
                    if (index == bookProvider.books.length) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16.0),
                          child: CircularProgressIndicator(),
                        ),
                      );
                    }

                    final book = bookProvider.books[index];
                    final coverUrl = bookProvider.getCoverUrl(book.id);

                    return BookCard(
                      book: book,
                      coverUrl: coverUrl,
                      onTap: () {
                        context.push('/books/${book.id}');
                      },
                    );
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}
