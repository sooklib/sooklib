import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Box,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
} from '@mui/material';
import { Favorite as FavoriteIcon, Share as ShareIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import api from '../services/api';
import BookCard from '../components/BookCard';
import PageContainer from '../components/PageContainer';
import { copyToClipboard } from '../utils/clipboard';

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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

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

  const handleShareFavorites = async () => {
    try {
      setShareLoading(true);
      const response = await api.post('/api/share/favorites');
      setShareLink(response.data.url);
      setShareExpiresAt(response.data.expires_at || null);
      setShareDialogOpen(true);
    } catch (err: any) {
      console.error('生成分享链接失败:', err);
      setSnackbar({ open: true, message: err.response?.data?.detail || '生成分享链接失败' });
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(shareLink);
    if (ok) {
      setSnackbar({ open: true, message: '已复制分享链接' });
    } else {
      setSnackbar({ open: true, message: '复制失败，请手动复制' });
    }
  };

  if (loading) {
    return (
      <PageContainer sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </PageContainer>
    );
  }

  return (
    <PageContainer sx={{ maxWidth: 1600, mx: 'auto' }}>
      {/* 标题 */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FavoriteIcon color="error" sx={{ fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            我的收藏
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ({favorites.length} 本书籍)
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ShareIcon />}
          onClick={handleShareFavorites}
          disabled={shareLoading || favorites.length === 0}
        >
          分享收藏
        </Button>
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

      <Dialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>收藏夹分享链接</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            该链接可公开访问你的收藏列表，请谨慎分享。
          </Typography>
          <TextField
            fullWidth
            value={shareLink}
            label="分享链接"
            InputProps={{ readOnly: true }}
          />
          {shareExpiresAt && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              过期时间：{new Date(shareExpiresAt).toLocaleString()}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDialogOpen(false)}>关闭</Button>
          <Button variant="contained" startIcon={<CopyIcon />} onClick={handleCopyLink} disabled={!shareLink}>
            复制链接
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
      />
    </PageContainer>
  );
}
