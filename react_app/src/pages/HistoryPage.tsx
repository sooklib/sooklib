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
import PageContainer from '../components/PageContainer';

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
      <PageContainer sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </PageContainer>
    );
  }

  return (
    <PageContainer sx={{ maxWidth: 1600, mx: 'auto' }}>
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
        <Grid container spacing={2}>
          {history.map((item) => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={item.book_id}>
              <Paper sx={{ p: 1.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 书籍卡片 */}
                <Box sx={{ flexGrow: 1 }}>
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
                </Box>

                {/* 阅读进度 */}
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      进度
                    </Typography>
                    <Typography variant="caption" fontWeight="medium" sx={{ fontSize: '0.7rem' }}>
                      {Math.round(item.progress * 100)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={item.progress * 100}
                    sx={{ height: 4, borderRadius: 2 }}
                  />

                  {/* 状态标签 */}
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {item.finished && (
                      <Chip
                        icon={<CheckCircle sx={{ fontSize: '0.9rem !important' }} />}
                        label="已读完"
                        size="small"
                        color="success"
                        sx={{ fontSize: '0.65rem', height: 20, '& .MuiChip-icon': { ml: 0.5 } }}
                      />
                    )}
                    <Typography variant="caption" color="text.secondary" title={formatDateShort(item.last_read_at)} noWrap sx={{ fontSize: '0.7rem', ml: 'auto' }}>
                      {formatRelativeTime(item.last_read_at)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </PageContainer>
  );
}
