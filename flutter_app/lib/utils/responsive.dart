import 'package:flutter/material.dart';

/// 响应式布局工具类
class Responsive {
  /// 断点
  static const double mobileBreakpoint = 600;
  static const double tabletBreakpoint = 900;
  static const double desktopBreakpoint = 1200;

  /// 判断设备类型
  static bool isMobile(BuildContext context) =>
      MediaQuery.of(context).size.width < mobileBreakpoint;

  static bool isTablet(BuildContext context) =>
      MediaQuery.of(context).size.width >= mobileBreakpoint &&
      MediaQuery.of(context).size.width < tabletBreakpoint;

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= tabletBreakpoint;

  static bool isWideDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= desktopBreakpoint;

  /// 获取屏幕宽度
  static double screenWidth(BuildContext context) =>
      MediaQuery.of(context).size.width;

  /// 获取屏幕高度
  static double screenHeight(BuildContext context) =>
      MediaQuery.of(context).size.height;

  /// 根据屏幕宽度返回合适的值
  static T value<T>(
    BuildContext context, {
    required T mobile,
    T? tablet,
    T? desktop,
  }) {
    if (isDesktop(context)) {
      return desktop ?? tablet ?? mobile;
    }
    if (isTablet(context)) {
      return tablet ?? mobile;
    }
    return mobile;
  }

  /// 获取网格列数
  static int getGridCrossAxisCount(BuildContext context) {
    final width = screenWidth(context);
    if (width >= 1400) return 7;
    if (width >= 1200) return 6;
    if (width >= 900) return 5;
    if (width >= 600) return 4;
    if (width >= 400) return 3;
    return 2;
  }

  /// 获取内容区域最大宽度
  static double getContentMaxWidth(BuildContext context) {
    if (isWideDesktop(context)) return 1400;
    if (isDesktop(context)) return 1200;
    return double.infinity;
  }

  /// 获取边距
  static EdgeInsets getPadding(BuildContext context) {
    if (isDesktop(context)) {
      return const EdgeInsets.symmetric(horizontal: 32, vertical: 24);
    }
    if (isTablet(context)) {
      return const EdgeInsets.symmetric(horizontal: 24, vertical: 20);
    }
    return const EdgeInsets.symmetric(horizontal: 16, vertical: 16);
  }

  /// 获取卡片宽高比
  static double getBookCardAspectRatio(BuildContext context) {
    if (isDesktop(context)) return 0.65;
    if (isTablet(context)) return 0.62;
    return 0.6;
  }
}

/// 响应式 Builder Widget
class ResponsiveBuilder extends StatelessWidget {
  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;

  const ResponsiveBuilder({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  @override
  Widget build(BuildContext context) {
    if (Responsive.isDesktop(context)) {
      return desktop ?? tablet ?? mobile;
    }
    if (Responsive.isTablet(context)) {
      return tablet ?? mobile;
    }
    return mobile;
  }
}

/// 自适应布局 Widget
class AdaptiveLayout extends StatelessWidget {
  final Widget child;
  final double? maxWidth;
  final EdgeInsetsGeometry? padding;

  const AdaptiveLayout({
    super.key,
    required this.child,
    this.maxWidth,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: maxWidth ?? Responsive.getContentMaxWidth(context),
        ),
        child: Padding(
          padding: padding ?? Responsive.getPadding(context),
          child: child,
        ),
      ),
    );
  }
}

/// 自适应网格 Widget
class AdaptiveGrid extends StatelessWidget {
  final List<Widget> children;
  final int? crossAxisCount;
  final double crossAxisSpacing;
  final double mainAxisSpacing;
  final double childAspectRatio;
  final bool shrinkWrap;
  final ScrollPhysics? physics;

  const AdaptiveGrid({
    super.key,
    required this.children,
    this.crossAxisCount,
    this.crossAxisSpacing = 16,
    this.mainAxisSpacing = 16,
    this.childAspectRatio = 0.65,
    this.shrinkWrap = false,
    this.physics,
  });

  @override
  Widget build(BuildContext context) {
    final count = crossAxisCount ?? Responsive.getGridCrossAxisCount(context);
    final aspectRatio = Responsive.getBookCardAspectRatio(context);

    return GridView.builder(
      shrinkWrap: shrinkWrap,
      physics: physics,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: count,
        crossAxisSpacing: crossAxisSpacing,
        mainAxisSpacing: mainAxisSpacing,
        childAspectRatio: aspectRatio,
      ),
      itemCount: children.length,
      itemBuilder: (context, index) => children[index],
    );
  }
}

/// 带侧边栏的自适应布局
class AdaptiveSidebarLayout extends StatelessWidget {
  final Widget sidebar;
  final Widget body;
  final double sidebarWidth;
  final bool showSidebarOnMobile;

  const AdaptiveSidebarLayout({
    super.key,
    required this.sidebar,
    required this.body,
    this.sidebarWidth = 280,
    this.showSidebarOnMobile = false,
  });

  @override
  Widget build(BuildContext context) {
    if (Responsive.isMobile(context) && !showSidebarOnMobile) {
      return body;
    }

    return Row(
      children: [
        SizedBox(
          width: sidebarWidth,
          child: sidebar,
        ),
        Expanded(child: body),
      ],
    );
  }
}
