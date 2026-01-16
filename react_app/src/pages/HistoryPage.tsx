import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Box,
  Paper,
  LinearProgress,
  Chip,
} from '@mui/material';
import { History as HistoryIcon, CheckCircle } from '@mui/icons-material';
import api from '../services/api';
import BookCard from '../components/BookCard';
import { formatDateShort, formatRelativeTime } from '../utils/dateUtils';

interface HistoryItem {
  book_id: number;
  book_title: string;
  author_name: string | null;
  progress: number;
  finished: boolean;
  last_read_at: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/user/reading-history');
      setHistory(response.data.history);
      setError(null);
    } catch (err: any) {
      console.error('获取阅读历史失败:', err);
      setError(err.response?.data?.detail || '获取阅读历史失败');
    } finally {
      setLoading(false);
    }
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
        <HistoryIcon color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h4" component="h1">
          阅读历史
        </Typography>
        <Typography variant="body2" color="text.secondary">
          ({history.length} 本书籍)
        </Typography>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 历史列表 */}
      {history.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            还没有阅读记录
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            开始阅读书籍后会在这里显示
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {history.map((item) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={item.book_id}>
              <Paper sx={{ p: 2 }}>
                {/* 书籍卡片 */}
                <BookCard
                  book={{
                    id: item.book_id,
                    title: item.book_title,
                    author_name: item.author_name,
                    file_format: '',
                    added_at: item.last_read_at,
                    cover_url: null,
                    is_new: false,
                  }}
                />

                {/* 阅读进度 */}
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      阅读进度
                    </Typography>
                    <Typography variant="caption" fontWeight="medium">
                      {Math.round(item.progress * 100)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={item.progress * 100}
                    sx={{ height: 6, borderRadius: 3 }}
                  />

                  {/* 状态标签 */}
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                    {item.finished && (
                      <Chip
                        icon={<CheckCircle />}
                        label="已读完"
                        size="small"
                        color="success"
                        sx={{ fontSize: '0.7rem', height: 22 }}
                      />
                    )}
                    <Typography variant="caption" color="text.secondary" title={formatDateShort(item.last_read_at)}>
                      {formatRelativeTime(item.last_read_at)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
