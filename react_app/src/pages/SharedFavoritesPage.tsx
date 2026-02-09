import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Grid,
  Paper,
  Button,
} from '@mui/material'
import { Favorite as FavoriteIcon, Login as LoginIcon } from '@mui/icons-material'
import BookCard from '../components/BookCard'
import PageContainer from '../components/PageContainer'

type SharedFavoriteItem = {
  id: number
  book_id: number
  title: string
  author_name: string | null
  cover_url: string | null
  added_at: string | null
  file_format: string | null
}

type SharedFavoritesResponse = {
  owner: string
  total: number
  items: SharedFavoriteItem[]
  expires_at?: string | null
}

export default function SharedFavoritesPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SharedFavoritesResponse | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('分享链接缺少 Token')
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await axios.get('/api/share/favorites', {
          params: { token }
        })
        setData(res.data)
      } catch (err: any) {
        console.error('加载分享收藏失败:', err)
        setError(err.response?.data?.detail || '分享链接无效或已过期')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [searchParams])

  if (loading) {
    return (
      <PageContainer sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </PageContainer>
    )
  }

  return (
    <PageContainer sx={{ maxWidth: 1600, mx: 'auto' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FavoriteIcon color="error" sx={{ fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            收藏分享
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<LoginIcon />} onClick={() => navigate('/login')}>
          登录后查看详情
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {data && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1">
            分享者：{data.owner}（{data.total} 本）
          </Typography>
          {data.expires_at && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              过期时间：{new Date(data.expires_at).toLocaleString()}
            </Typography>
          )}
        </Box>
      )}

      {data?.items?.length ? (
        <Grid container spacing={3}>
          {data.items.map((item) => (
            <Grid item xs={6} sm={4} md={3} lg={2.4} xl={2} key={item.id}>
              <BookCard
                book={{
                  id: item.book_id,
                  title: item.title,
                  author_name: item.author_name,
                  file_format: item.file_format,
                  added_at: item.added_at,
                  cover_url: item.cover_url,
                  is_new: false,
                }}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <FavoriteIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            暂无收藏内容
          </Typography>
        </Paper>
      )}
    </PageContainer>
  )
}
