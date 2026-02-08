import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Typography, Grid, Card, CardContent, Alert, Button, IconButton, Stack, LinearProgress, useMediaQuery } from '@mui/material'
import { MenuBook, LibraryBooks, Favorite, ChevronLeft, ChevronRight, Person, AutoAwesome, Storage } from '@mui/icons-material'
import api from '../services/api'
import { DashboardResponse, LibrarySummary, ContinueReadingItem, LibraryLatest } from '../types'
import BookCard from '../components/BookCard'
import ContinueReadingCard from '../components/ContinueReadingCard'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePrimaryColor } from '../stores/themeStore'
import { generateMorandiPalette } from '../utils/colorUtils'

export default function DashboardPage() {
  // 设置页面标题
  useDocumentTitle('首页')
  
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { coverSize } = useSettingsStore()
  const primaryColor = usePrimaryColor()
  const morandiPalette = useMemo(() => generateMorandiPalette(primaryColor), [primaryColor])
  const showScrollArrows = useMediaQuery('(hover: hover) and (pointer: fine)')
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [heroCoverError, setHeroCoverError] = useState(false)

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
  const stats = data?.stats
  const totalBooks = stats?.total_books ?? data?.libraries.reduce((sum, lib) => sum + lib.book_count, 0) ?? 0
  const totalLibraries = stats?.total_libraries ?? data?.libraries.length ?? 0
  const readingCount = stats?.continue_reading ?? data?.continue_reading.length ?? 0
  const favoritesCount = stats?.favorites ?? data?.favorites_count ?? 0
  const authorsCount = stats?.total_authors ?? 0
  const newBooksCount = stats?.new_books_7d ?? 0
  const totalSize = stats?.total_size ?? 0

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

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const heroReading = data?.continue_reading?.[0]
  const heroLatest = data?.latest_by_library?.[0]?.books?.[0]
  const heroItem = heroReading || heroLatest
  const heroCover = heroItem?.cover_url ? `/api${heroItem.cover_url}` : null

  const getColorIndex = (title: string): number => {
    let hash = 0
    const titleStr = String(title || '')
    for (let i = 0; i < titleStr.length; i++) {
      hash = ((hash << 5) - hash) + titleStr.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash) % 6
  }

  const heroCoverColor = morandiPalette[getColorIndex(heroItem?.title || '')]

  useEffect(() => {
    setHeroCoverError(false)
  }, [heroCover])

  const latestWall = useMemo(() => {
    if (!data?.latest_by_library) return []
    return data.latest_by_library.flatMap((lib) => lib.books).slice(0, 20)
  }, [data?.latest_by_library])

  const posterWidth = coverSize === 'small' ? 120 : coverSize === 'medium' ? 150 : 180
  const posterScrollStep = posterWidth * 4

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh', bgcolor: 'background.default' }}>
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

        {/* Hero */}
        <Card
          sx={{
            mb: 4,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'background.paper',
          }}
        >
          <Box sx={{ position: 'relative', p: { xs: 2.5, md: 3 }, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box
              sx={{
                width: { xs: 110, sm: 140, md: 170 },
                aspectRatio: '2/3',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'action.hover',
                border: '1px solid rgba(255,255,255,0.08)',
                flexShrink: 0,
              }}
            >
              {heroCover && !heroCoverError ? (
                <Box
                  component="img"
                  src={heroCover}
                  alt={heroItem?.title}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setHeroCoverError(true)}
                />
              ) : (
                <Box
                  sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: heroCoverColor,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 1.5,
                  }}
                >
                  <MenuBook sx={{ fontSize: 44, color: 'rgba(255,255,255,0.9)', mb: 1 }} />
                  <Typography
                    sx={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.95)',
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.3,
                    }}
                  >
                    {heroItem?.title || '暂无封面'}
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Typography variant="overline" color="text.secondary">
                {heroReading ? '继续阅读' : '最新加入'}
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, mb: 1 }}>
                {heroItem?.title || '欢迎回来'}
              </Typography>
              {heroItem?.author_name && (
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                  {heroItem.author_name}
                </Typography>
              )}

              {heroReading && (
                <Box sx={{ maxWidth: 360, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    阅读进度 {(heroReading.progress * 100).toFixed(0)}%
                  </Typography>
                  <LinearProgress variant="determinate" value={heroReading.progress * 100} sx={{ mt: 0.5 }} />
                </Box>
              )}

              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  onClick={() => heroItem && navigate(`/book/${heroItem.id}`)}
                >
                  {heroReading ? '继续阅读' : '查看详情'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/search')}>
                  去找书
                </Button>
              </Stack>
            </Box>
          </Box>
        </Card>

      {/* 统计卡片 - 移动端优化 */}
        <Grid container spacing={1.5} sx={{ mb: 4 }}>
          {[
            { label: '书籍总数', value: loading ? '-' : totalBooks, icon: MenuBook, accent: 'primary.main' },
            { label: '书库数量', value: loading ? '-' : totalLibraries, icon: LibraryBooks, accent: 'success.main' },
            { label: '作者数量', value: loading ? '-' : authorsCount, icon: Person, accent: 'warning.main' },
            { label: '近7天新增', value: loading ? '-' : newBooksCount, icon: AutoAwesome, accent: 'secondary.main' },
            { label: '正在阅读', value: loading ? '-' : readingCount, icon: MenuBook, accent: 'info.main' },
            { label: '总容量', value: loading ? '-' : formatBytes(totalSize), icon: Storage, accent: 'info.main' },
            { label: '收藏数', value: loading ? '-' : favoritesCount, icon: Favorite, accent: 'error.main' },
          ].map((item, idx) => {
            const Icon = item.icon
            return (
              <Grid item xs={6} md={3} lg={2.4} key={`${item.label}-${idx}`}>
                <Card
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Icon sx={{ fontSize: { xs: 24, sm: 30 }, color: item.accent }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.1 }}>
                        {item.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.label}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>

      {/* 继续阅读 */}
      {(loading || (data?.continue_reading && data.continue_reading.length > 0)) && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">继续阅读</Typography>
          </Box>
          {/* 使用水平滚动容器，类似 Emby */}
          <ScrollableRow
            showArrows={showScrollArrows}
            scrollStep={320}
          >
            {loading ? (
              [1, 2, 3].map((i) => (
                <Box key={i} sx={{ minWidth: 300, flexShrink: 0 }}>
                  <ContinueReadingCard loading />
                </Box>
              ))
            ) : (
              data?.continue_reading.slice(0, 10).map((item) => (
                <Box key={item.id} sx={{ minWidth: 300, flexShrink: 0 }}>
                  <ContinueReadingCard item={item} />
                </Box>
              ))
            )}
          </ScrollableRow>
        </Box>
      )}

      {/* 海报墙 - 最新入库 */}
      {(loading || latestWall.length > 0) && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">最新入库</Typography>
            <IconButton size="small" onClick={() => navigate('/library')} sx={{ ml: 1 }}>
              <ChevronRight />
            </IconButton>
          </Box>
          <ScrollableRow showArrows={showScrollArrows} scrollStep={posterScrollStep}>
            {loading
              ? Array.from({ length: 20 }).map((_, i) => (
                  <Box key={i} sx={{ width: posterWidth, flexShrink: 0 }}>
                    <BookCard loading />
                  </Box>
                ))
              : latestWall.map((book) => (
                  <Box key={`${book.id}-${book.title}`} sx={{ width: posterWidth, flexShrink: 0 }}>
                    <BookCard book={book} />
                  </Box>
                ))}
          </ScrollableRow>
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
          <ScrollableRow showArrows={showScrollArrows} scrollStep={posterScrollStep}>
            {loading
              ? Array.from({ length: 20 }).map((_, i) => (
                  <Box key={i} sx={{ width: posterWidth, flexShrink: 0 }}>
                    <BookCard loading />
                  </Box>
                ))
              : libraryLatest.books.map((book) => (
                  <Box key={book.id} sx={{ width: posterWidth, flexShrink: 0 }}>
                    <BookCard book={book} />
                  </Box>
                ))}
          </ScrollableRow>
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

function ScrollableRow({
  children,
  showArrows,
  scrollStep,
}: {
  children: ReactNode
  showArrows: boolean
  scrollStep: number
}) {
  const rowRef = useRef<HTMLDivElement | null>(null)

  const handleScroll = (direction: 'left' | 'right') => {
    const el = rowRef.current
    if (!el) return
    const base = Math.max(el.clientWidth * 0.9, scrollStep)
    const offset = direction === 'left' ? -base : base
    el.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {showArrows && (
        <>
          <IconButton
            onClick={() => handleScroll('left')}
            aria-label="向左滚动"
            sx={{
              position: 'absolute',
              left: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              bgcolor: 'rgba(0,0,0,0.45)',
              color: 'common.white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
            }}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            onClick={() => handleScroll('right')}
            aria-label="向右滚动"
            sx={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              bgcolor: 'rgba(0,0,0,0.45)',
              color: 'common.white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
            }}
          >
            <ChevronRight />
          </IconButton>
        </>
      )}
      <Box
        ref={rowRef}
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          pb: 2,
          mx: -2,
          px: 2,
          scrollBehavior: 'smooth',
          '::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
