import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/theme_provider.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
      ),
      body: ListView(
        children: [
          // 主题设置
          _buildSectionHeader('外观'),
          _buildThemeModeSelector(context),
          _buildThemeColorSelector(context),
          
          const Divider(height: 32),
          
          // 关于
          _buildSectionHeader('关于'),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('版本'),
            subtitle: const Text('1.0.0'),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: Colors.grey,
        ),
      ),
    );
  }

  Widget _buildThemeModeSelector(BuildContext context) {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, child) {
        return ListTile(
          leading: Icon(
            themeProvider.isDarkMode ? Icons.dark_mode : Icons.light_mode,
          ),
          title: const Text('主题模式'),
          subtitle: Text(themeProvider.isDarkMode ? '深色模式' : '浅色模式'),
          trailing: Switch(
            value: themeProvider.isDarkMode,
            onChanged: (value) {
              themeProvider.setThemeMode(
                value ? ThemeMode.dark : ThemeMode.light,
              );
            },
          ),
        );
      },
    );
  }

  Widget _buildThemeColorSelector(BuildContext context) {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, child) {
        return ListTile(
          leading: Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: themeProvider.seedColor,
              shape: BoxShape.circle,
            ),
          ),
          title: const Text('主题色'),
          subtitle: const Text('点击选择颜色'),
          onTap: () => _showColorPicker(context, themeProvider),
        );
      },
    );
  }

  void _showColorPicker(BuildContext context, ThemeProvider themeProvider) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) {
          return Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 标题
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      '选择主题色',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                
                const SizedBox(height: 8),
                const Text(
                  '预设颜色',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey,
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // 预设颜色网格
                Expanded(
                  child: GridView.builder(
                    controller: scrollController,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 5,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                    ),
                    itemCount: ThemeProvider.presetColors.length,
                    itemBuilder: (context, index) {
                      final preset = ThemeProvider.presetColors[index];
                      final isSelected = themeProvider.seedColor.value == preset.color.value;
                      
                      return InkWell(
                        onTap: () {
                          themeProvider.setSeedColor(preset.color);
                          Navigator.pop(context);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          decoration: BoxDecoration(
                            color: preset.color,
                            borderRadius: BorderRadius.circular(12),
                            border: isSelected
                                ? Border.all(color: Colors.white, width: 3)
                                : null,
                            boxShadow: isSelected
                                ? [
                                    BoxShadow(
                                      color: preset.color.withOpacity(0.5),
                                      blurRadius: 8,
                                      spreadRadius: 2,
                                    ),
                                  ]
                                : null,
                          ),
                          child: isSelected
                              ? const Icon(
                                  Icons.check,
                                  color: Colors.white,
                                )
                              : null,
                        ),
                      );
                    },
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // 从图片提取按钮
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _pickImageAndExtractColor(context, themeProvider),
                    icon: const Icon(Icons.image),
                    label: const Text('从图片提取颜色'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // 颜色预览
                _buildColorPreview(themeProvider),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildColorPreview(ThemeProvider themeProvider) {
    final lightScheme = ColorScheme.fromSeed(
      seedColor: themeProvider.seedColor,
      brightness: Brightness.light,
    );
    final darkScheme = ColorScheme.fromSeed(
      seedColor: themeProvider.seedColor,
      brightness: Brightness.dark,
    );

    return Row(
      children: [
        // 浅色预览
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: lightScheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey.withOpacity(0.3)),
            ),
            child: Column(
              children: [
                const Text(
                  '浅色',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _colorDot(lightScheme.primary),
                    _colorDot(lightScheme.secondary),
                    _colorDot(lightScheme.tertiary),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        // 深色预览
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: darkScheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey.withOpacity(0.3)),
            ),
            child: Column(
              children: [
                const Text(
                  '深色',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _colorDot(darkScheme.primary),
                    _colorDot(darkScheme.secondary),
                    _colorDot(darkScheme.tertiary),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _colorDot(Color color) {
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }

  Future<void> _pickImageAndExtractColor(
    BuildContext context,
    ThemeProvider themeProvider,
  ) async {
    // 显示提示
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Web 暂不支持图片选择，请使用预设颜色'),
        duration: Duration(seconds: 2),
      ),
    );
    
    // TODO: 实现图片选择功能
    // 在 Web 上可以使用 file_picker 包
    // 在移动端可以使用 image_picker 包
  }
}
