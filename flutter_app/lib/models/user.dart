class User {
  final int id;
  final String username;
  final String? email;
  final bool isAdmin;
  final String ageRatingLimit; // 'all', 'teen', 'adult'
  final int? telegramId;
  final DateTime createdAt;

  User({
    required this.id,
    required this.username,
    this.email,
    required this.isAdmin,
    required this.ageRatingLimit,
    this.telegramId,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as int,
      username: json['username'] as String,
      email: json['email'] as String?,
      isAdmin: json['is_admin'] as bool,
      ageRatingLimit: json['age_rating_limit'] as String? ?? 'all',
      telegramId: json['telegram_id'] as int?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'email': email,
      'is_admin': isAdmin,
      'age_rating_limit': ageRatingLimit,
      'telegram_id': telegramId,
      'created_at': createdAt.toIso8601String(),
    };
  }

  User copyWith({
    int? id,
    String? username,
    String? email,
    bool? isAdmin,
    String? ageRatingLimit,
    int? telegramId,
    DateTime? createdAt,
  }) {
    return User(
      id: id ?? this.id,
      username: username ?? this.username,
      email: email ?? this.email,
      isAdmin: isAdmin ?? this.isAdmin,
      ageRatingLimit: ageRatingLimit ?? this.ageRatingLimit,
      telegramId: telegramId ?? this.telegramId,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
