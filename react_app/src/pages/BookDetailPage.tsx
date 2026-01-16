import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Card, CardContent, Button, Chip, Grid,
  CircularProgress, Alert, IconButton, Divider
} from '@mui/material'
import {
  ArrowBack, MenuBook, Download, Favorite, FavoriteBorder,
  AccessTime, Storage
} from '@mui/icons-material'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

interface BookDetail {
  id: number
  title: string
  author_name: string | null
  file_path: string
  file_format: string
  file_size: number
  description: string | null
  publisher: string | null
  age_rating: string | null
  content_warning: string | null
  added_at: string
}

export default function BookDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [book, setBook] = useState<BookDetail | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    if (id) {
      loadBook()
      checkFavoriteStatus()
    }
  }, [id])

  const loadBook = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get<BookDetail>(`/api/books/${id}`)
      setBook(response.data)
    } catch (err) {
      console.error('加载书籍失败:', err)
      setError('加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }

  const checkFavoriteStatus = async () => {
    try {
      const response = await api.get(`/api/user/favorites/${id}/check`)
      setIsFavorite(response.data.is_favorite)
    } catch (err) {
      console.error('检查收藏状态失败:', err)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const handleRead = () => {
    navigate(`/book/${id}/reader`)
  }

  const handleDownload = () => {
    if (!token) {
      alert('请先登录')
      return
    }
    window.open(`/api/books/${id}/download?token=${token}`, '_blank')
  }

  const toggleFavorite = async () => {
    try {
      if (isFavorite) {
        await api.delete(`/api/user/favorites/${id}`)
        setIsFavorite(false)
      } else {
        await api.post(`/api/user/favorites/${id}`)
        setIsFavorite(true)
      }
    } catch (err: any) {
      console.error('切换收藏失败:', err)
      const errorMsg = err.response?.data?.detail || err.message || '操作失败，请重试'
      alert(errorMsg)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !book) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || '书籍不存在'}</Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mt: 2 }}>
          返回
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* 返回按钮 */}
      <IconButton onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        <ArrowBack />
      </IconButton>

      <Grid container spacing={4}>
        {/* 封面 */}
        <Grid item xs={12} md={4} lg={3}>
          <Card
            sx={{
              maxWidth: { xs: 280, sm: 320, md: 240 },
              mx: 'auto',
            }}
          >
            <Box
              sx={{
                aspectRatio: '2/3',
                bgcolor: 'grey.800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Box
                component="img"
                src={`/api/books/${book.id}/cover`}
                alt={book.title}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.parentElement!.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:64px">📖</div>'
                }}
              />
            </Box>
          </Card>
        </Grid>

        {/* 详情 */}
        <Grid item xs={12} md={8} lg={9}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            {book.title}
          </Typography>

          {book.author_name && (
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {book.author_name}
            </Typography>
          )}

          {/* 标签 */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            <Chip
              label={book.file_format.toUpperCase()}
              color="primary"
              size="small"
            />
            <Chip
              icon={<Storage sx={{ fontSize: 16 }} />}
              label={formatFileSize(book.file_size)}
              size="small"
              variant="outlined"
            />
            <Chip
              icon={<AccessTime sx={{ fontSize: 16 }} />}
              label={`添加于 ${formatDate(book.added_at)}`}
              size="small"
              variant="outlined"
            />
            {book.age_rating && (
              <Chip
                label={book.age_rating}
                color="warning"
                size="small"
              />
            )}
          </Box>

          {/* 操作按钮 */}
          <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<MenuBook />}
              onClick={handleRead}
              sx={{ flex: 1, maxWidth: 200 }}
            >
              开始阅读
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<Download />}
              onClick={handleDownload}
            >
              下载
            </Button>
            <IconButton
              onClick={toggleFavorite}
              color={isFavorite ? 'error' : 'default'}
              sx={{ border: 1, borderColor: 'divider' }}
            >
              {isFavorite ? <Favorite /> : <FavoriteBorder />}
            </IconButton>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* 简介 */}
          {book.description ? (
            <>
              <Typography variant="h6" gutterBottom>
                简介
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3, whiteSpace: 'pre-line' }}>
                {book.description}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              暂无简介
            </Typography>
          )}

          {/* 更多信息 */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                详细信息
              </Typography>
              <Grid container spacing={2}>
                {book.publisher && (
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      出版社
                    </Typography>
                    <Typography variant="body2">{book.publisher}</Typography>
                  </Grid>
                )}
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    文件格式
                  </Typography>
                  <Typography variant="body2">{book.file_format.toUpperCase()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    文件大小
                  </Typography>
                  <Typography variant="body2">{formatFileSize(book.file_size)}</Typography>
                </Grid>
              </Grid>
              {book.content_warning && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {book.content_warning}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
