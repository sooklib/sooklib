import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Typography, Grid, Card, CardContent, Alert, Button, IconButton } from '@mui/material'
import { MenuBook, LibraryBooks, Favorite, ChevronRight } from '@mui/icons-material'
import api from '../services/api'
import { DashboardResponse, LibrarySummary, ContinueReadingItem, LibraryLatest } from '../types'
import BookCard from '../components/BookCard'
import ContinueReadingCard from '../components/ContinueReadingCard'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function DashboardPage() {
  // 设置页面标题
  useDocumentTitle('首页')
  
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { coverSize } = useSettingsStore()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<DashboardResponse | null>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get<DashboardResponse>('/api/dashboard')
      setData(response.data)
    } catch (err: unknown) {
      console.error('加载仪表盘失败:', err)
      setError('加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }

  // 统计数据
  const totalBooks = data?.libraries.reduce((sum, lib) => sum + lib.book_count, 0) || 0
  const totalLibraries = data?.libraries.length || 0
  const readingCount = data?.continue_reading.length || 0
  const favoritesCount = data?.favorites_count || 0

  // 根据封面尺寸计算网格列数
  const getGridColumns = () => {
    switch (coverSize) {
      case 'small':
        return { xs: 4, sm: 3, md: 2.4, lg: 2, xl: 1.5 }
      case 'medium':
        return { xs: 6, sm: 4, md: 3, lg: 2, xl: 2 }
      case 'large':
        return { xs: 6, sm: 4, md: 3, lg: 2.4, xl: 2 }
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* 欢迎语 */}
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
        👋 你好，{user?.username || '用户'}
      </Typography>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
          <Button size="small" onClick={loadDashboard} sx={{ ml: 2 }}>
            重试
          </Button>
        </Alert>
      )}

      {/* 统计卡片 - 移动端优化 */}
      <Grid container spacing={1.5} sx={{ mb: 4 }}>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
            <CardContent sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: { xs: 1, sm: 2 },
              p: { xs: 1.5, sm: 2 },
              '&:last-child': { pb: { xs: 1.5, sm: 2 } }
            }}>
              <MenuBook sx={{ fontSize: { xs: 28, sm: 40 } }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                  {loading ? '-' : totalBooks}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  书籍总数
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'secondary.main', color: 'white' }}>
            <CardContent sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: { xs: 1, sm: 2 },
              p: { xs: 1.5, sm: 2 },
              '&:last-child': { pb: { xs: 1.5, sm: 2 } }
            }}>
              <LibraryBooks sx={{ fontSize: { xs: 28, sm: 40 } }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                  {loading ? '-' : totalLibraries}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  书库数
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'success.main', color: 'white' }}>
            <CardContent sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: { xs: 1, sm: 2 },
              p: { xs: 1.5, sm: 2 },
              '&:last-child': { pb: { xs: 1.5, sm: 2 } }
            }}>
              <MenuBook sx={{ fontSize: { xs: 28, sm: 40 } }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                  {loading ? '-' : readingCount}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  正在阅读
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
            <CardContent sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: { xs: 1, sm: 2 },
              p: { xs: 1.5, sm: 2 },
              '&:last-child': { pb: { xs: 1.5, sm: 2 } }
            }}>
              <Favorite sx={{ fontSize: { xs: 28, sm: 40 } }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                  {loading ? '-' : favoritesCount}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  收藏数
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 继续阅读 */}
      {(loading || (data?.continue_reading && data.continue_reading.length > 0)) && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">继续阅读</Typography>
          </Box>
          <Grid container spacing={2}>
            {loading ? (
              [1, 2, 3].map((i) => (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <ContinueReadingCard loading />
                </Grid>
              ))
            ) : (
              data?.continue_reading.slice(0, 6).map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.id}>
                  <ContinueReadingCard item={item} />
                </Grid>
              ))
            )}
          </Grid>
        </Box>
      )}

      {/* 书库浏览入口 */}
      {(loading || (data?.libraries && data.libraries.length > 0)) && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">我的书库</Typography>
            <IconButton size="small" onClick={() => navigate('/library')} sx={{ ml: 1 }}>
              <ChevronRight />
            </IconButton>
          </Box>
          <Grid container spacing={2}>
            {data?.libraries.map((library) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={library.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 3 },
                  }}
                  onClick={() => navigate(`/library/${library.id}`)}
                >
                  <Box sx={{ aspectRatio: '1', bgcolor: 'grey.800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LibraryBooks sx={{ fontSize: 48, color: 'grey.500' }} />
                  </Box>
                  <CardContent sx={{ p: 1.5 }}>
                    <Typography variant="body2" fontWeight="medium" noWrap>
                      {library.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {library.book_count} 本
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* 各书库最新书籍 */}
      {data?.latest_by_library.map((libraryLatest) => (
        <Box key={libraryLatest.library_id} sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{libraryLatest.library_name} - 最新添加</Typography>
            <IconButton
              size="small"
              onClick={() => navigate(`/library/${libraryLatest.library_id}`)}
              sx={{ ml: 1 }}
            >
              <ChevronRight />
            </IconButton>
          </Box>
          <Grid container spacing={2}>
            {loading
              ? [1, 2, 3, 4, 5, 6].map((i) => (
                  <Grid item {...getGridColumns()} key={i}>
                    <BookCard loading />
                  </Grid>
                ))
              : libraryLatest.books.slice(0, 6).map((book) => (
                  <Grid item {...getGridColumns()} key={book.id}>
                    <BookCard book={book} />
                  </Grid>
                ))}
          </Grid>
        </Box>
      ))}

      {/* 空状态 */}
      {!loading && !error && data?.libraries.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <LibraryBooks sx={{ fontSize: 64, color: 'grey.500', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            暂无可访问的书库
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            请联系管理员添加书库访问权限
          </Typography>
        </Box>
      )}
    </Box>
  )
}
