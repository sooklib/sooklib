// 作者
export interface Author {
  id: number
  name: string
  book_count: number
}

// 书籍摘要
export interface BookSummary {
  id: number
  title: string
  author_name: string | null
  cover_url: string | null
  is_new: boolean
  added_at: string | null
  file_format: string | null
}

// 书库摘要
export interface LibrarySummary {
  id: number
  name: string
  book_count: number
  cover_url: string | null
}

// 继续阅读项
export interface ContinueReadingItem {
  id: number
  title: string
  author_name: string | null
  cover_url: string | null
  progress: number
  last_read_at: string
  library_id: number
  library_name: string
}

// 书库最新书籍
export interface LibraryLatest {
  library_id: number
  library_name: string
  books: BookSummary[]
}

export interface DashboardStats {
  total_books: number
  total_libraries: number
  total_authors: number
  total_groups: number
  continue_reading: number
  favorites: number
  new_books_7d: number
  total_size: number
}

// Dashboard 响应
export interface DashboardResponse {
  continue_reading: ContinueReadingItem[]
  libraries: LibrarySummary[]
  latest_by_library: LibraryLatest[]
  favorites_count: number
  stats?: DashboardStats
}

// 书籍详情
export interface Book {
  id: number
  title: string
  author_name: string | null
  description: string | null
  cover_url: string | null
  file_format: string | null
  file_size: number | null
  library_id: number
  library_name: string | null
  added_at: string | null
  is_favorite: boolean
}

// 书籍列表响应
export interface BooksResponse {
  items: BookSummary[]
  total: number
  page: number
  page_size: number
}

// 用户信息
export interface User {
  id: number
  username: string
  email?: string
  is_admin: boolean
}

// 书籍组
export interface BookGroup {
  id: number
  name: string | null
  primary_book_id: number | null
  created_at: string
}

// 书籍组中的书籍信息
export interface GroupedBook {
  id: number
  title: string
  author_name: string | null
  cover_path: string | null
  version_count: number
  formats: string[]
  total_size: number
  is_primary: boolean
  is_current: boolean
}

// 重复书籍检测中的书籍信息
export interface DuplicateBook {
  id: number
  title: string
  author_name: string | null
  version_count: number
  formats: string[]
  total_size: number
  added_at: string
  group_id: number | null
  is_group_primary: boolean
}

// 重复书籍分组
export interface DuplicateGroup {
  key: string
  books: DuplicateBook[]
  suggested_primary_id: number
  reason: string
}

// 重复检测响应
export interface DetectDuplicatesResponse {
  library_id: number
  library_name: string
  duplicate_group_count: number
  duplicate_groups: DuplicateGroup[]
}

// 书籍组创建请求
export interface GroupBooksRequest {
  primary_book_id: number
  book_ids: number[]
  group_name?: string
}

// 书籍组创建响应
export interface GroupBooksResponse {
  status: string
  group_id: number
  group_name: string
  primary_book_id: number
  book_count: number
  added_count: number
}

// 获取书籍组响应
export interface GetBookGroupResponse {
  book_id: number
  book_title: string
  group_id: number | null
  grouped_books: GroupedBook[]
  is_grouped: boolean
}

// 批注/笔记
export interface Annotation {
  id: number
  user_id: number
  book_id: number
  chapter_index: number
  chapter_title: string | null
  start_offset: number
  end_offset: number
  selected_text: string
  note: string | null
  annotation_type: 'highlight' | 'note' | 'underline'
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple'
  created_at: string
  updated_at: string
}

// 创建批注请求
export interface AnnotationCreate {
  book_id: number
  chapter_index: number
  chapter_title?: string
  start_offset: number
  end_offset: number
  selected_text: string
  note?: string
  annotation_type?: 'highlight' | 'note' | 'underline'
  color?: 'yellow' | 'green' | 'blue' | 'red' | 'purple'
}

// 更新批注请求
export interface AnnotationUpdate {
  note?: string
  color?: string
  annotation_type?: string
}

// 批注导出
export interface AnnotationExport {
  book_title: string
  total_annotations: number
  annotations: Annotation[]
  exported_at: string
}

// 批注统计
export interface AnnotationStats {
  total_annotations: number
  by_type: Record<string, number>
  by_color: Record<string, number>
  books_with_annotations: number
}

// ===== 阅读统计相关类型 =====

// 阅读统计概览
export interface ReadingStatsOverview {
  total_duration_seconds: number
  total_duration_formatted: string
  total_sessions: number
  books_read: number
  finished_books: number
  today_duration_seconds: number
  today_duration_formatted: string
  week_duration_seconds: number
  week_duration_formatted: string
  month_duration_seconds: number
  month_duration_formatted: string
  avg_daily_seconds: number
  avg_daily_formatted: string
}

// 每日阅读统计项
export interface DailyReadingStat {
  date: string
  duration_seconds: number
  duration_formatted: string
  sessions: number
}

// 每日阅读统计响应
export interface DailyReadingStatsResponse {
  days: number
  start_date: string
  end_date: string
  daily_stats: DailyReadingStat[]
}

// 每小时阅读分布项
export interface HourlyReadingStat {
  hour: number
  hour_label: string
  duration_seconds: number
  duration_formatted: string
  sessions: number
}

// 每小时阅读分布响应
export interface HourlyReadingStatsResponse {
  days: number
  hourly_stats: HourlyReadingStat[]
}

// 书籍阅读统计项
export interface BookReadingStat {
  book_id: number
  title: string
  author_name: string | null
  total_duration_seconds: number
  total_duration_formatted: string
  session_count: number
  last_read: string | null
  progress: number
  finished: boolean
}

// 书籍阅读统计响应
export interface BookReadingStatsResponse {
  limit: number
  book_stats: BookReadingStat[]
}

// 作者阅读统计项
export interface AuthorReadingStat {
  author_id: number | null
  author_name: string
  total_duration_seconds: number
  total_duration_formatted: string
  session_count: number
  book_count: number
  last_read: string | null
}

// 作者阅读统计响应
export interface AuthorReadingStatsResponse {
  limit: number
  author_stats: AuthorReadingStat[]
}

// 书库阅读统计项
export interface LibraryReadingStat {
  library_id: number
  library_name: string
  total_duration_seconds: number
  total_duration_formatted: string
  session_count: number
  book_count: number
  last_read: string | null
}

// 书库阅读统计响应
export interface LibraryReadingStatsResponse {
  limit: number
  library_stats: LibraryReadingStat[]
}

// 格式阅读统计项
export interface FormatReadingStat {
  file_format: string
  total_duration_seconds: number
  total_duration_formatted: string
  session_count: number
  book_count: number
  last_read: string | null
}

// 格式阅读统计响应
export interface FormatReadingStatsResponse {
  limit: number
  format_stats: FormatReadingStat[]
}

// 标签阅读统计项
export interface TagReadingStat {
  tag_id: number
  tag_name: string
  tag_type: string
  total_duration_seconds: number
  total_duration_formatted: string
  session_count: number
  book_count: number
  last_read: string | null
}

// 标签阅读统计响应
export interface TagReadingStatsResponse {
  limit: number
  tag_stats: TagReadingStat[]
}

// 阅读会话记录
export interface ReadingSessionRecord {
  id: number
  book_id: number
  book_title: string
  author_name: string | null
  start_time: string | null
  end_time: string | null
  duration_seconds: number
  duration_formatted: string
  progress: number | null
  device_info: string | null
}

// 最近阅读会话响应
export interface RecentSessionsResponse {
  limit: number
  sessions: ReadingSessionRecord[]
}
