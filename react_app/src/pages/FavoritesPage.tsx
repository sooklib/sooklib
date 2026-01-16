import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Box,
  Paper,
} from '@mui/material';
import { Favorite as FavoriteIcon } from '@mui/icons-material';
import api from '../services/api';
import BookCard from '../components/BookCard';

interface FavoriteItem {
  id: number;
  book_id: number;
  book_title: string;
  author_name: string | null;
  created_at: string;
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/user/favorites');
      setFavorites(response.data);
      setError(null);
    } catch (err: any) {
      console.error('获取收藏列表失败:', err);
      setError(err.response?.data?.detail || '获取收藏列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUnfavorite = (bookId: number) => {
    // 从列表中移除
    setFavorites(prev => prev.filter(f => f.book_id !== bookId));
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* 标题 */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <FavoriteIcon color="error" sx={{ fontSize: 32 }} />
        <Typography variant="h4" component="h1">
          我的收藏
        </Typography>
        <Typography variant="body2" color="text.secondary">
          ({favorites.length} 本书籍)
        </Typography>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 收藏列表 */}
      {favorites.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <FavoriteIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            还没有收藏任何书籍
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            在书籍详情页点击收藏按钮添加到这里
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {favorites.map((favorite) => (
            <Grid item xs={6} sm={4} md={3} lg={2.4} xl={2} key={favorite.id}>
              <BookCard
                book={{
                  id: favorite.book_id,
                  title: favorite.book_title,
                  author_name: favorite.author_name,
                  file_format: '',
                  added_at: favorite.created_at,
                  cover_url: null,
                  is_new: false,
                }}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
