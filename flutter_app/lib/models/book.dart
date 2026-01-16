import 'package:flutter/foundation.dart';

class Book {
  final int id;
  final String title;
  final String? authorName;
  final int? authorId;
  final String fileFormat;
  final int fileSize;
  final String? description;
  final String? publisher;
  final String ageRating; // 'general', 'teen', 'adult'
  final List<String>? contentWarning;
  final List<String> tags;
  final DateTime addedAt;

  Book({
    required this.id,
    required this.title,
    this.authorName,
    this.authorId,
    required this.fileFormat,
    required this.fileSize,
    this.description,
    this.publisher,
    this.ageRating = 'general',  // 默认值
    this.contentWarning,
    this.tags = const [],
    required this.addedAt,
  });

  factory Book.fromJson(Map<String, dynamic> json) {
    try {
      return Book(
        id: json['id'] as int,
        title: json['title'] as String? ?? '未知标题',
        authorName: json['author_name'] as String?,
        authorId: json['author_id'] as int?,
        fileFormat: json['file_format'] as String? ?? 'unknown',
        fileSize: json['file_size'] as int? ?? 0,
        description: json['description'] as String?,
        publisher: json['publisher'] as String?,
        ageRating: json['age_rating'] as String? ?? 'general',
        contentWarning: json['content_warning'] != null 
            ? (json['content_warning'] is String 
                ? (json['content_warning'] as String).split(',').map((e) => e.trim()).toList()
                : List<String>.from(json['content_warning'] as List))
            : null,
        tags: json['tags'] != null
            ? List<String>.from(json['tags'] as List)
            : [],
        addedAt: json['added_at'] != null 
            ? DateTime.parse(json['added_at'] as String)
            : DateTime.now(),
      );
    } catch (e) {
      debugPrint('❌ Error parsing Book from JSON: $e');
      debugPrint('📦 JSON data: $json');
      rethrow;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'author_name': authorName,
      'author_id': authorId,
      'file_format': fileFormat,
      'file_size': fileSize,
      'description': description,
      'publisher': publisher,
      'age_rating': ageRating,
      'content_warning': contentWarning?.join(','),
      'tags': tags,
      'added_at': addedAt.toIso8601String(),
    };
  }

  String get coverUrl => '/books/$id/cover?size=thumbnail';
  
  String get formatFileSize {
    if (fileSize < 1024) return '$fileSize B';
    if (fileSize < 1024 * 1024) {
      return '${(fileSize / 1024).toStringAsFixed(2)} KB';
    }
    if (fileSize < 1024 * 1024 * 1024) {
      return '${(fileSize / (1024 * 1024)).toStringAsFixed(2)} MB';
    }
    return '${(fileSize / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  String get ageRatingDisplay {
    switch (ageRating) {
      case 'general':
        return '全年龄';
      case 'teen':
        return '青少年';
      case 'adult':
        return '成人 🔞';
      default:
        return '全年龄';
    }
  }

  String get formattedCreatedAt {
    final now = DateTime.now();
    final difference = now.difference(addedAt);
    
    if (difference.inDays > 365) {
      return '${(difference.inDays / 365).floor()} 年前';
    } else if (difference.inDays > 30) {
      return '${(difference.inDays / 30).floor()} 月前';
    } else if (difference.inDays > 0) {
      return '${difference.inDays} 天前';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} 小时前';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} 分钟前';
    } else {
      return '刚刚';
    }
  }
  
  @override
  String toString() {
    return 'Book(id: $id, title: $title, author: $authorName)';
  }
}
