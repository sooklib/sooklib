import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material'
import {
  AccessTime as TimeIcon,
  MenuBook as BookIcon,
  CalendarMonth as CalendarIcon,
  TrendingUp as TrendingIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  DevicesOther as DeviceIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { useSettingsStore } from '../stores/settingsStore'
import PageContainer from '../components/PageContainer'
import type {
  ReadingStatsOverview,
  DailyReadingStatsResponse,
  HourlyReadingStatsResponse,
  BookReadingStatsResponse,
  AuthorReadingStatsResponse,
  LibraryReadingStatsResponse,
  FormatReadingStatsResponse,
  TagReadingStatsResponse,
  RecentSessionsResponse,
} from '../types'

export default function ReadingStatsPage() {
  const navigate = useNavigate()
  const { rankingsEnabled, serverSettingsLoaded, loadServerSettings } = useSettingsStore()
  
  // 数据状态
  const [overview, setOverview] = useState<ReadingStatsOverview | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyReadingStatsResponse | null>(null)
  const [hourlyStats, setHourlyStats] = useState<HourlyReadingStatsResponse | null>(null)
  const [bookStats, setBookStats] = useState<BookReadingStatsResponse | null>(null)
  const [authorStats, setAuthorStats] = useState<AuthorReadingStatsResponse | null>(null)
  const [libraryStats, setLibraryStats] = useState<LibraryReadingStatsResponse | null>(null)
  const [formatStats, setFormatStats] = useState<FormatReadingStatsResponse | null>(null)
  const [tagStats, setTagStats] = useState<TagReadingStatsResponse | null>(null)
  const [recentSessions, setRecentSessions] = useState<RecentSessionsResponse | null>(null)
  
  // UI状态
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dailyDays, setDailyDays] = useState<number>(30)
  const [hourlyDays, setHourlyDays] = useState<number>(30)

  // 加载数据
  useEffect(() => {
    loadServerSettings()
  }, [loadServerSettings])

  useEffect(() => {
    if (serverSettingsLoaded) {
      loadAllStats()
    }
  }, [serverSettingsLoaded, rankingsEnabled])

  useEffect(() => {
    if (serverSettingsLoaded) {
      loadDailyStats()
    }
  }, [dailyDays, serverSettingsLoaded])

  useEffect(() => {
    if (serverSettingsLoaded) {
      loadHourlyStats()
    }
  }, [hourlyDays, serverSettingsLoaded])

  const loadAllStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const baseRequests = [
        api.get('/api/stats/reading/overview'),
        api.get(`/api/stats/reading/daily?days=${dailyDays}`),
        api.get(`/api/stats/reading/hourly?days=${hourlyDays}`),
        api.get('/api/stats/reading/recent-sessions?limit=10'),
      ]
      const rankingRequests = rankingsEnabled
        ? [
            api.get('/api/stats/reading/books?limit=10'),
            api.get('/api/stats/reading/authors?limit=10'),
            api.get('/api/stats/reading/libraries?limit=10'),
            api.get('/api/stats/reading/formats?limit=10'),
            api.get('/api/stats/reading/tags?limit=10'),
          ]
        : []
      const results = await Promise.all([...baseRequests, ...rankingRequests])
      const [overviewRes, dailyRes, hourlyRes, sessionRes] = results
      setOverview(overviewRes.data)
      setDailyStats(dailyRes.data)
      setHourlyStats(hourlyRes.data)
      setRecentSessions(sessionRes.data)
      if (rankingsEnabled) {
        const [bookRes, authorRes, libraryRes, formatRes, tagRes] = results.slice(4)
        setBookStats(bookRes.data)
        setAuthorStats(authorRes.data)
        setLibraryStats(libraryRes.data)
        setFormatStats(formatRes.data)
        setTagStats(tagRes.data)
      } else {
        setBookStats(null)
        setAuthorStats(null)
        setLibraryStats(null)
        setFormatStats(null)
        setTagStats(null)
      }
    } catch (err: any) {
      console.error('加载阅读统计失败:', err)
      setError(err.response?.data?.detail || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadDailyStats = async () => {
    try {
      const res = await api.get(`/api/stats/reading/daily?days=${dailyDays}`)
      setDailyStats(res.data)
    } catch (err) {
      console.error('加载每日统计失败:', err)
    }
  }

  const loadHourlyStats = async () => {
    try {
      const res = await api.get(`/api/stats/reading/hourly?days=${hourlyDays}`)
      setHourlyStats(res.data)
    } catch (err) {
      console.error('加载每小时统计失败:', err)
    }
  }

  // 格式化时间
  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return '-'
    const date = new Date(isoString)
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 获取每小时统计的最大值用于归一化
  const getMaxHourlyDuration = () => {
    if (!hourlyStats) return 1
    return Math.max(...hourlyStats.hourly_stats.map(h => h.duration_seconds), 1)
  }

  const getTagTypeLabel = (type: string) => {
    switch (type) {
      case 'genre':
        return '类型'
      case 'age_rating':
        return '分级'
      case 'custom':
      default:
        return '标签'
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>加载阅读统计中...</Typography>
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer>
        <Alert severity="error">{error}</Alert>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TrendingIcon />
        阅读统计
      </Typography>

      {/* 概览卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <TimeIcon color="primary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h6" color="primary">
                {overview?.total_duration_formatted || '0分钟'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                总阅读时长
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CalendarIcon color="success" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h6" color="success.main">
                {overview?.today_duration_formatted || '0分钟'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                今日阅读
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <ScheduleIcon color="info" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h6" color="info.main">
                {overview?.week_duration_formatted || '0分钟'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                本周阅读
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <BookIcon color="warning" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h6" color="warning.main">
                {overview?.books_read || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                阅读书籍
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CheckIcon color="success" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h6" color="success.main">
                {overview?.finished_books || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                已读完
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <TrendingIcon color="secondary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h6" color="secondary.main">
                {overview?.avg_daily_formatted || '0分钟'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                日均阅读
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* 每日阅读时长 */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">每日阅读时长</Typography>
              <ToggleButtonGroup
                size="small"
                value={dailyDays}
                exclusive
                onChange={(_, v) => v && setDailyDays(v)}
              >
                <ToggleButton value={7}>7天</ToggleButton>
                <ToggleButton value={30}>30天</ToggleButton>
                <ToggleButton value={90}>90天</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {dailyStats && (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end', height: 200, overflowX: 'auto' }}>
                {dailyStats.daily_stats.map((day, index) => {
                  const maxDuration = Math.max(...dailyStats.daily_stats.map(d => d.duration_seconds), 1)
                  const height = (day.duration_seconds / maxDuration) * 160
                  return (
                    <Tooltip
                      key={day.date}
                      title={`${day.date}: ${day.duration_formatted} (${day.sessions}次)`}
                    >
                      <Box
                        sx={{
                          minWidth: dailyDays <= 30 ? 16 : 8,
                          height: Math.max(height, 4),
                          bgcolor: day.duration_seconds > 0 ? 'primary.main' : 'grey.300',
                          borderRadius: '2px 2px 0 0',
                          transition: 'height 0.3s',
                          '&:hover': {
                            bgcolor: 'primary.dark',
                          },
                        }}
                      />
                    </Tooltip>
                  )
                })}
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {dailyStats?.start_date}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dailyStats?.end_date}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* 阅读习惯（每小时分布） */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">阅读习惯</Typography>
              <ToggleButtonGroup
                size="small"
                value={hourlyDays}
                exclusive
                onChange={(_, v) => v && setHourlyDays(v)}
              >
                <ToggleButton value={7}>7天</ToggleButton>
                <ToggleButton value={30}>30天</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {hourlyStats && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {hourlyStats.hourly_stats.map((hour) => {
                  const maxDuration = getMaxHourlyDuration()
                  const intensity = hour.duration_seconds / maxDuration
                  return (
                    <Tooltip
                      key={hour.hour}
                      title={`${hour.hour_label}: ${hour.duration_formatted}`}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: hour.duration_seconds > 0
                            ? `rgba(25, 118, 210, ${0.1 + intensity * 0.9})`
                            : 'grey.100',
                          borderRadius: 1,
                          fontSize: 12,
                          color: intensity > 0.5 ? 'white' : 'text.secondary',
                        }}
                      >
                        {hour.hour}
                      </Box>
                    </Tooltip>
                  )
                })}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              颜色深浅表示该时段阅读时长
            </Typography>
          </Paper>
        </Grid>

        {/* 书籍阅读排行 */}
        {rankingsEnabled ? (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                阅读时长排行
              </Typography>
              {bookStats && bookStats.book_stats.length > 0 ? (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>书名</TableCell>
                        <TableCell align="right">时长</TableCell>
                        <TableCell align="right">进度</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bookStats.book_stats.map((book, index) => (
                        <TableRow
                          key={book.book_id}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/books/${book.book_id}`)}
                        >
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                sx={{
                                  width: 24,
                                  height: 24,
                                  fontSize: 12,
                                  bgcolor: index < 3 ? 'primary.main' : 'grey.400',
                                }}
                              >
                                {index + 1}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                  {book.title}
                                </Typography>
                                {book.author_name && (
                                  <Typography variant="caption" color="text.secondary">
                                    {book.author_name}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {book.total_duration_formatted}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={book.progress * 100}
                                sx={{ width: 60 }}
                              />
                              {book.finished && (
                                <CheckIcon color="success" sx={{ fontSize: 16 }} />
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无阅读记录
                </Typography>
              )}
            </Paper>
          </Grid>
        ) : (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                阅读时长排行
              </Typography>
              <Alert severity="info">排行榜功能已关闭</Alert>
            </Paper>
          </Grid>
        )}

        {/* 最近阅读会话 */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              最近阅读记录
            </Typography>
            {recentSessions && recentSessions.sessions.length > 0 ? (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>书名</TableCell>
                      <TableCell align="right">时间</TableCell>
                      <TableCell align="right">时长</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentSessions.sessions.map((session) => (
                      <TableRow
                        key={session.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/books/${session.book_id}`)}
                      >
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                            {session.book_title}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">
                            {formatDateTime(session.start_time)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={session.duration_formatted}
                            size="small"
                            color={session.duration_seconds > 1800 ? 'primary' : 'default'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                暂无阅读记录
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* 作者阅读排行 */}
        {rankingsEnabled && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                作者阅读排行
              </Typography>
              {authorStats && authorStats.author_stats.length > 0 ? (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>作者</TableCell>
                        <TableCell align="right">时长</TableCell>
                        <TableCell align="right">书籍数</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {authorStats.author_stats.map((author, index) => (
                        <TableRow key={`${author.author_id ?? 'unknown'}-${index}`} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                sx={{
                                  width: 24,
                                  height: 24,
                                  fontSize: 12,
                                  bgcolor: index < 3 ? 'primary.main' : 'grey.400',
                                }}
                              >
                                {index + 1}
                              </Avatar>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {author.author_name}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {author.total_duration_formatted}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {author.book_count}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无阅读记录
                </Typography>
              )}
            </Paper>
          </Grid>
        )}

        {/* 书库阅读排行 */}
        {rankingsEnabled && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                书库阅读排行
              </Typography>
              {libraryStats && libraryStats.library_stats.length > 0 ? (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>书库</TableCell>
                        <TableCell align="right">时长</TableCell>
                        <TableCell align="right">书籍数</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {libraryStats.library_stats.map((library, index) => (
                        <TableRow key={`${library.library_id}-${index}`} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                sx={{
                                  width: 24,
                                  height: 24,
                                  fontSize: 12,
                                  bgcolor: index < 3 ? 'primary.main' : 'grey.400',
                                }}
                              >
                                {index + 1}
                              </Avatar>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {library.library_name}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {library.total_duration_formatted}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {library.book_count}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无阅读记录
                </Typography>
              )}
            </Paper>
          </Grid>
        )}

        {/* 格式阅读排行 */}
        {rankingsEnabled && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                格式阅读排行
              </Typography>
              {formatStats && formatStats.format_stats.length > 0 ? (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>格式</TableCell>
                        <TableCell align="right">时长</TableCell>
                        <TableCell align="right">书籍数</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {formatStats.format_stats.map((format, index) => (
                        <TableRow key={`${format.file_format}-${index}`} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                sx={{
                                  width: 24,
                                  height: 24,
                                  fontSize: 12,
                                  bgcolor: index < 3 ? 'primary.main' : 'grey.400',
                                }}
                              >
                                {index + 1}
                              </Avatar>
                              <Chip size="small" label={format.file_format} />
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {format.total_duration_formatted}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {format.book_count}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无阅读记录
                </Typography>
              )}
            </Paper>
          </Grid>
        )}

        {/* 标签阅读排行 */}
        {rankingsEnabled && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                标签阅读排行
              </Typography>
              {tagStats && tagStats.tag_stats.length > 0 ? (
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>标签</TableCell>
                        <TableCell align="right">时长</TableCell>
                        <TableCell align="right">书籍数</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tagStats.tag_stats.map((tag, index) => (
                        <TableRow key={`${tag.tag_id}-${index}`} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                sx={{
                                  width: 24,
                                  height: 24,
                                  fontSize: 12,
                                  bgcolor: index < 3 ? 'primary.main' : 'grey.400',
                                }}
                              >
                                {index + 1}
                              </Avatar>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                                  {tag.tag_name}
                                </Typography>
                                <Chip size="small" label={getTagTypeLabel(tag.tag_type)} />
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {tag.total_duration_formatted}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {tag.book_count}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无阅读记录
                </Typography>
              )}
            </Paper>
          </Grid>
        )}
      </Grid>
    </PageContainer>
  )
}
