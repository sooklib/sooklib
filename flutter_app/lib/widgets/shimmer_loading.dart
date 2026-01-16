import 'package:flutter/material.dart';

/// Shimmer 效果动画
class ShimmerLoading extends StatefulWidget {
  final Widget child;
  final bool isLoading;
  
  const ShimmerLoading({
    super.key,
    required this.child,
    required this.isLoading,
  });

  @override
  State<ShimmerLoading> createState() => _ShimmerLoadingState();
}

class _ShimmerLoadingState extends State<ShimmerLoading>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
    
    _animation = Tween<double>(begin: -2, end: 2).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isLoading) return widget.child;
    
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return ShaderMask(
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.grey[800]!,
                Colors.grey[600]!,
                Colors.grey[800]!,
              ],
              stops: [
                0.0,
                (_animation.value + 2) / 4,
                1.0,
              ],
            ).createShader(bounds);
          },
          child: widget.child,
        );
      },
    );
  }
}

/// 书籍卡片骨架屏
class BookCardSkeleton extends StatelessWidget {
  const BookCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 封面骨架
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: Colors.grey[800],
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        const SizedBox(height: 8),
        // 标题骨架
        Container(
          height: 14,
          width: double.infinity,
          decoration: BoxDecoration(
            color: Colors.grey[800],
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(height: 4),
        // 作者骨架
        Container(
          height: 12,
          width: 100,
          decoration: BoxDecoration(
            color: Colors.grey[800],
            borderRadius: BorderRadius.circular(4),
          ),
        ),
      ],
    );
  }
}

/// 书籍网格骨架屏
class BookGridSkeleton extends StatefulWidget {
  final int itemCount;
  final int crossAxisCount;
  
  const BookGridSkeleton({
    super.key,
    this.itemCount = 12,
    this.crossAxisCount = 5,
  });

  @override
  State<BookGridSkeleton> createState() => _BookGridSkeletonState();
}

class _BookGridSkeletonState extends State<BookGridSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: widget.crossAxisCount,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: 0.65,
          ),
          itemCount: widget.itemCount,
          itemBuilder: (context, index) {
            return _ShimmerCard(animation: _controller, delay: index * 0.1);
          },
        );
      },
    );
  }
}

class _ShimmerCard extends StatelessWidget {
  final AnimationController animation;
  final double delay;
  
  const _ShimmerCard({
    required this.animation,
    required this.delay,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, child) {
        final value = (animation.value + delay) % 1.0;
        
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment(-1 + value * 3, -1),
              end: Alignment(1 + value * 3, 1),
              colors: [
                Colors.grey[850]!,
                Colors.grey[700]!,
                Colors.grey[850]!,
              ],
            ),
            borderRadius: BorderRadius.circular(8),
          ),
        );
      },
    );
  }
}

/// 列表项骨架屏
class ListItemSkeleton extends StatelessWidget {
  const ListItemSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      child: Row(
        children: [
          // 头像/图标骨架
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.grey[800],
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 16,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.grey[800],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  height: 12,
                  width: 150,
                  decoration: BoxDecoration(
                    color: Colors.grey[800],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 列表骨架屏
class ListSkeleton extends StatefulWidget {
  final int itemCount;
  
  const ListSkeleton({
    super.key,
    this.itemCount = 8,
  });

  @override
  State<ListSkeleton> createState() => _ListSkeletonState();
}

class _ListSkeletonState extends State<ListSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: widget.itemCount,
          itemBuilder: (context, index) {
            final value = (_controller.value + index * 0.1) % 1.0;
            
            return Container(
              margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment(-1 + value * 3, 0),
                  end: Alignment(1 + value * 3, 0),
                  colors: [
                    Colors.grey[850]!,
                    Colors.grey[700]!,
                    Colors.grey[850]!,
                  ],
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  SizedBox(width: 60, height: 80),
                  SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(height: 16),
                        SizedBox(height: 8),
                        SizedBox(height: 12),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

/// Dashboard 骨架屏
class DashboardSkeleton extends StatefulWidget {
  const DashboardSkeleton({super.key});

  @override
  State<DashboardSkeleton> createState() => _DashboardSkeletonState();
}

class _DashboardSkeletonState extends State<DashboardSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 统计卡片骨架
              Row(
                children: List.generate(3, (index) {
                  final value = (_controller.value + index * 0.1) % 1.0;
                  return Expanded(
                    child: Container(
                      margin: EdgeInsets.only(right: index < 2 ? 16 : 0),
                      height: 100,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment(-1 + value * 3, 0),
                          end: Alignment(1 + value * 3, 0),
                          colors: [
                            Colors.grey[850]!,
                            Colors.grey[700]!,
                            Colors.grey[850]!,
                          ],
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 32),
              
              // 最近阅读标题骨架
              Container(
                height: 24,
                width: 120,
                decoration: BoxDecoration(
                  color: Colors.grey[800],
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 16),
              
              // 书籍网格骨架
              const BookGridSkeleton(itemCount: 5, crossAxisCount: 5),
              const SizedBox(height: 32),
              
              // 最近添加标题骨架
              Container(
                height: 24,
                width: 120,
                decoration: BoxDecoration(
                  color: Colors.grey[800],
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 16),
              
              // 书籍网格骨架
              const BookGridSkeleton(itemCount: 10, crossAxisCount: 5),
            ],
          ),
        );
      },
    );
  }
}
