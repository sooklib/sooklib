/// 书库模型
class Library {
  final int id;
  final String name;
  final int bookCount;
  final String? coverUrl;

  Library({
    required this.id,
    required this.name,
    required this.bookCount,
    this.coverUrl,
  });

  factory Library.fromJson(Map<String, dynamic> json) {
    return Library(
      id: json['id'] as int,
      name: json['name'] as String,
      bookCount: json['book_count'] as int? ?? 0,
      coverUrl: json['cover_url'] as String?,
    );
  }
}

/// 继续阅读项
class ContinueReadingItem {
  final int id;
  final String title;
  final String? authorName;
  final String? coverUrl;
  final double progress;  // 0.0 - 1.0
  final DateTime lastReadAt;
  final int libraryId;
  final String libraryName;

  ContinueReadingItem({
    required this.id,
    required this.title,
    this.authorName,
    this.coverUrl,
    required this.progress,
    required this.lastReadAt,
    required this.libraryId,
    required this.libraryName,
  });

  factory ContinueReadingItem.fromJson(Map<String, dynamic> json) {
    return ContinueReadingItem(
      id: json['id'] as int,
      title: json['title'] as String,
      authorName: json['author_name'] as String?,
      coverUrl: json['cover_url'] as String?,
      progress: (json['progress'] as num?)?.toDouble() ?? 0.0,
      lastReadAt: DateTime.parse(json['last_read_at'] as String),
      libraryId: json['library_id'] as int,
      libraryName: json['library_name'] as String,
    );
  }
}

/// 书籍摘要（用于展示最新书籍等）
class BookSummary {
  final int id;
  final String title;
  final String? authorName;
  final String? coverUrl;
  final bool isNew;
  final DateTime? addedAt;
  final String? fileFormat;

  BookSummary({
    required this.id,
    required this.title,
    this.authorName,
    this.coverUrl,
    this.isNew = false,
    this.addedAt,
    this.fileFormat,
  });

  factory BookSummary.fromJson(Map<String, dynamic> json) {
    return BookSummary(
      id: json['id'] as int,
      title: json['title'] as String,
      authorName: json['author_name'] as String?,
      coverUrl: json['cover_url'] as String?,
      isNew: json['is_new'] as bool? ?? false,
      addedAt: json['added_at'] != null 
          ? DateTime.parse(json['added_at'] as String) 
          : null,
      fileFormat: json['file_format'] as String?,
    );
  }
}

/// 书库最新书籍
class LibraryLatest {
  final int libraryId;
  final String libraryName;
  final List<BookSummary> books;

  LibraryLatest({
    required this.libraryId,
    required this.libraryName,
    required this.books,
  });

  factory LibraryLatest.fromJson(Map<String, dynamic> json) {
    final booksJson = json['books'] as List<dynamic>? ?? [];
    return LibraryLatest(
      libraryId: json['library_id'] as int,
      libraryName: json['library_name'] as String,
      books: booksJson.map((e) => BookSummary.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}

/// Dashboard 数据
class DashboardData {
  final List<ContinueReadingItem> continueReading;
  final List<Library> libraries;
  final List<LibraryLatest> latestByLibrary;
  final int favoritesCount;

  DashboardData({
    required this.continueReading,
    required this.libraries,
    required this.latestByLibrary,
    this.favoritesCount = 0,
  });

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    final continueReadingJson = json['continue_reading'] as List<dynamic>? ?? [];
    final librariesJson = json['libraries'] as List<dynamic>? ?? [];
    final latestByLibraryJson = json['latest_by_library'] as List<dynamic>? ?? [];
    
    return DashboardData(
      continueReading: continueReadingJson
          .map((e) => ContinueReadingItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      libraries: librariesJson
          .map((e) => Library.fromJson(e as Map<String, dynamic>))
          .toList(),
      latestByLibrary: latestByLibraryJson
          .map((e) => LibraryLatest.fromJson(e as Map<String, dynamic>))
          .toList(),
      favoritesCount: json['favorites_count'] as int? ?? 0,
    );
  }
}
