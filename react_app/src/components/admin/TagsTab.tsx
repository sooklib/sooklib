import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  AutoAwesome as AutoIcon,
  LocalOffer as TagIcon,
  Info as InfoIcon,
  Download as ImportIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import api from '../../services/api';

interface TagCategory {
  name: string;
  tags: string[];
  color: string;
}

interface AutoTagDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AutoTagDialog: React.FC<AutoTagDialogProps> = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [libraryId, setLibraryId] = useState<string>('');
  const [reprocess, setReprocess] = useState(false);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadLibraries();
    }
  }, [open]);

  const loadLibraries = async () => {
    try {
      const response = await api.get('/api/libraries');
      setLibraries(response.data);
    } catch (err) {
      console.error('Failed to load libraries:', err);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      const payload: any = { reprocess };
      if (libraryId) {
        payload.library_id = parseInt(libraryId);
      }

      const response = await api.post('/api/admin/tags/auto-tag', payload);
      
      alert(`自动打标签完成！\n处理: ${response.data.processed_count}/${response.data.total_books} 本书\n添加标签: ${response.data.tagged_count} 个`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || '自动打标签失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>自动打标签</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          使用内置关键词库自动从书名、作者、文件名和内容中提取标签
        </Typography>

        <TextField
          select
          fullWidth
          label="书库"
          value={libraryId}
          onChange={(e) => setLibraryId(e.target.value)}
          SelectProps={{ native: true }}
          helperText="留空则处理所有书库"
          sx={{ mb: 2 }}
        >
          <option value="">全部书库</option>
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.name}
            </option>
          ))}
        </TextField>

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <input
            type="checkbox"
            checked={reprocess}
            onChange={(e) => setReprocess(e.target.checked)}
            id="reprocess-checkbox"
          />
          <label htmlFor="reprocess-checkbox" style={{ marginLeft: 8, cursor: 'pointer' }}>
            重新处理已有标签的书籍
          </label>
        </Box>

        <Alert severity="info" icon={<InfoIcon />}>
          此操作可能需要较长时间，特别是对于大型书库
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <AutoIcon />}
        >
          {loading ? '处理中...' : '开始'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const TagsTab: React.FC = () => {
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoTagDialogOpen, setAutoTagDialogOpen] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadKeywords();
  }, []);

  const loadKeywords = async () => {
    setLoading(true);
    try {
      // 模拟从后端加载关键词（实际应该有API端点）
      // 这里直接使用硬编码的分类
      const mockCategories: TagCategory[] = [
        {
          name: '题材分类',
          color: '#1976d2',
          tags: ['玄幻', '仙侠', '武侠', '都市', '历史', '军事', '科幻', '游戏', '竞技', '悬疑', '灵异', '同人'],
        },
        {
          name: '热门元素',
          color: '#d32f2f',
          tags: ['系统', '重生', '穿越', '末世', '无限流', '爽文', '升级流', '种田', '宫斗', '商战'],
        },
        {
          name: '风格特点',
          color: '#388e3c',
          tags: ['热血', '搞笑', '轻松', '虐文', '甜文', '爽文', '沙雕', '脑洞', '暗黑', '治愈'],
        },
        {
          name: '受众定位',
          color: '#f57c00',
          tags: ['男频', '女频', '少儿', '青春', '轻小说', 'BL', 'GL', '无CP'],
        },
        {
          name: '连载状态',
          color: '#7b1fa2',
          tags: ['连载', '完结', '断更', '太监', '日更', '周更'],
        },
        {
          name: '特殊标记',
          color: '#0288d1',
          tags: ['签约', '精品', '畅销', 'IP改编', '原创', '翻译', '授权'],
        },
      ];
      
      setCategories(mockCategories);
    } catch (err) {
      console.error('Failed to load keywords:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTotalTags = () => {
    return categories.reduce((sum, cat) => sum + cat.tags.length, 0);
  };

  const handleInitDefaultTags = async () => {
    if (!confirm('确定要导入预定义的系统标签吗？已存在的标签会自动跳过。')) {
      return;
    }
    
    setInitLoading(true);
    try {
      const response = await api.post('/api/tags/init-defaults');
      const { created_count, skipped_count, total_predefined } = response.data;
      alert(`导入完成！\n新创建: ${created_count} 个标签\n已存在: ${skipped_count} 个\n预定义总数: ${total_predefined} 个`);
      loadKeywords(); // 刷新列表
    } catch (err: any) {
      alert('导入失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setInitLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    
    setCreating(true);
    try {
      await api.post('/api/admin/tags', {
        name: newTagName.trim(),
        type: 'custom'
      });
      setCreateDialogOpen(false);
      setNewTagName('');
      loadKeywords(); // 刷新列表
      alert('标签创建成功');
    } catch (err: any) {
      alert('创建失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* 顶部操作栏 */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TagIcon />
          标签关键词管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadKeywords}
          >
            刷新
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={initLoading ? <CircularProgress size={20} /> : <ImportIcon />}
            onClick={handleInitDefaultTags}
            disabled={initLoading}
          >
            {initLoading ? '导入中...' : '导入预定义标签'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AutoIcon />}
            onClick={() => setAutoTagDialogOpen(true)}
          >
            自动打标签
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            新建标签
          </Button>
        </Box>
      </Box>

      {/* 统计卡片 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                分类总数
              </Typography>
              <Typography variant="h4">
                {categories.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                标签总数
              </Typography>
              <Typography variant="h4">
                {getTotalTags()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                覆盖范围
              </Typography>
              <Typography variant="h4">
                文件名+内容
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                提取方式
              </Typography>
              <Typography variant="h4">
                智能匹配
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 使用说明 */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          <strong>使用说明：</strong>
        </Typography>
        <Typography variant="body2">
          1. 扫描时自动：新书入库时自动从文件名和内容提取标签<br />
          2. 批量打标签：使用"自动打标签"功能为现有书籍批量添加标签<br />
          3. 关键词库：下方为内置的50+标签关键词，会自动匹配书名、作者、文件名和内容<br />
          4. 智能去重：自动去除重复标签，确保数据一致性
        </Typography>
      </Alert>

      {/* 关键词分类展示 */}
      {categories.map((category, index) => (
        <Paper key={index} sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box
              sx={{
                width: 4,
                height: 24,
                bgcolor: category.color,
                mr: 2,
                borderRadius: 1,
              }}
            />
            <Typography variant="h6">{category.name}</Typography>
            <Chip
              label={`${category.tags.length} 个标签`}
              size="small"
              sx={{ ml: 2 }}
            />
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {category.tags.map((tag, tagIndex) => (
              <Chip
                key={tagIndex}
                label={tag}
                size="medium"
                sx={{
                  bgcolor: `${category.color}15`,
                  color: category.color,
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        </Paper>
      ))}

      {/* 自动打标签对话框 */}
      <AutoTagDialog
        open={autoTagDialogOpen}
        onClose={() => setAutoTagDialogOpen(false)}
        onSuccess={loadKeywords}
      />

      {/* 新建标签对话框 */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>新建自定义标签</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="标签名称"
            fullWidth
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            disabled={creating}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button 
            onClick={handleCreateTag} 
            variant="contained" 
            disabled={creating || !newTagName.trim()}
          >
            {creating ? '创建中...' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TagsTab;
