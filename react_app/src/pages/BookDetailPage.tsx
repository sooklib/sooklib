import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Card, CardContent, Button, Chip, Grid,
  CircularProgress, Alert, IconButton, Divider, LinearProgress, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material'
import {
  ArrowBack, MenuBook, Download, Favorite, FavoriteBorder,
  AccessTime, Storage, PlayArrow, CheckCircle, Schedule,
  Edit, LocalOffer
} from '@mui/icons-material'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { formatDateShort, formatDateTime, formatRelativeTime } from '../utils/dateUtils'

interface TagInfo {
  id: number
  name: string
  type: string
  description?: string
}

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
  tags?: TagInfo[]
}

interface ReadingProgress {
  progress: number
  position: number | null
  chapter: string | null
  last_read_at: string | null
  finished: boolean
}

interface EditFormData {
  title: string
  author_name: string
  description: string
  publisher: string
  age_rating: string
  content_warning: string
}

export default function BookDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [book, setBook] = useState<BookDetail | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null)
  
  // 编辑模式
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditFormData>({
    title: '',
    author_name: '',
    description: '',
    publisher: '',
    age_rating: 'general',
    content_warning: ''
  })
  const [saving, setSaving] = useState(false)
  
  // 标签管理
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [allTags, setAllTags] = useState<TagInfo[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [savingTags, setSavingTags] = useState(false)

  useEffect(() => {
    if (id) {
      loadBook()
      checkFavoriteStatus()
      loadReadingProgress()
    }
  }, [id])

  useEffect(() => {
    loadAllTags()
  }, [])

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

  const loadReadingProgress = async () => {
    try {
      const response = await api.get(`/api/progress/${id}`)
      setReadingProgress(response.data)
    } catch (err) {
      // 可能没有阅读记录，不需要报错
      console.debug('没有阅读进度')
    }
  }

  const loadAllTags = async () => {
    try {
      const response = await api.get<TagInfo[]>('/api/tags')
      setAllTags(response.data)
    } catch (err) {
      console.error('加载标签列表失败:', err)
    }
  }

  const handleOpenEditDialog = () => {
    if (book) {
      setEditForm({
        title: book.title,
        author_name: book.author_name || '',
        description: book.description || '',
        publisher: book.publisher || '',
        age_rating: book.age_rating || 'general',
        content_warning: book.content_warning || ''
      })
      setEditDialogOpen(true)
    }
  }

  const handleSaveBook = async () => {
    try {
      setSaving(true)
      await api.put(`/api/books/${id}`, editForm)
      setEditDialogOpen(false)
      loadBook() // 重新加载书籍信息
    } catch (err: any) {
      console.error('保存失败:', err)
      alert(err.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenTagDialog = () => {
    if (book) {
      setSelectedTagIds(book.tags?.map(t => t.id) || [])
      setTagDialogOpen(true)
    }
  }

  const handleSaveTags = async () => {
    try {
      setSavingTags(true)
      await api.put(`/api/books/${id}/tags`, { tag_ids: selectedTagIds })
      setTagDialogOpen(false)
      loadBook() // 重新加载书籍信息
    } catch (err: any) {
      console.error('保存标签失败:', err)
      alert(err.response?.data?.detail || '保存标签失败')
    } finally {
      setSavingTags(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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

  const hasProgress = readingProgress && readingProgress.progress > 0
  const progressPercent = readingProgress ? Math.round(readingProgress.progress * 100) : 0

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
              label={`添加于 ${formatDateShort(book.added_at)}`}
              size="small"
              variant="outlined"
            />
            {book.age_rating && book.age_rating !== 'general' && (
              <Chip
                label={book.age_rating}
                color="warning"
                size="small"
              />
            )}
            {book.tags?.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.name}
                size="small"
                sx={{ bgcolor: 'primary.dark', color: 'white' }}
              />
            ))}
          </Box>

          {/* 阅读进度卡片 */}
          {hasProgress && (
            <Paper 
              elevation={0} 
              sx={{ 
                p: 2, 
                mb: 3, 
                bgcolor: 'action.hover',
                borderRadius: 2,
                border: 1,
                borderColor: 'divider'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {readingProgress?.finished ? (
                    <>
                      <CheckCircle color="success" sx={{ fontSize: 18 }} />
                      已读完
                    </>
                  ) : (
                    <>
                      <Schedule color="primary" sx={{ fontSize: 18 }} />
                      阅读中
                    </>
                  )}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {progressPercent}%
                </Typography>
              </Box>
              
              <LinearProgress 
                variant="determinate" 
                value={progressPercent} 
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  mb: 1,
                  bgcolor: 'action.selected',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    bgcolor: readingProgress?.finished ? 'success.main' : 'primary.main'
                  }
                }} 
              />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {readingProgress?.chapter && `${readingProgress.chapter}`}
                </Typography>
                {readingProgress?.last_read_at && (
                  <Typography variant="caption" color="text.secondary">
                    最近阅读：{formatRelativeTime(readingProgress.last_read_at)}
                  </Typography>
                )}
              </Box>
            </Paper>
          )}

          {/* 操作按钮 */}
          <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={hasProgress ? <PlayArrow /> : <MenuBook />}
              onClick={handleRead}
              sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: 180 }}
            >
              {hasProgress ? '继续阅读' : '开始阅读'}
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<Download />}
              onClick={handleDownload}
            >
              下载
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<Edit />}
              onClick={handleOpenEditDialog}
            >
              编辑
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<LocalOffer />}
              onClick={handleOpenTagDialog}
            >
              标签
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
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      出版社
                    </Typography>
                    <Typography variant="body2">{book.publisher}</Typography>
                  </Grid>
                )}
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    文件格式
                  </Typography>
                  <Typography variant="body2">{book.file_format.toUpperCase()}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    文件大小
                  </Typography>
                  <Typography variant="body2">{formatFileSize(book.file_size)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    添加日期
                  </Typography>
                  <Typography variant="body2">{formatDateShort(book.added_at)}</Typography>
                </Grid>
                {readingProgress?.last_read_at && (
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      最近阅读
                    </Typography>
                    <Typography variant="body2">{formatDateTime(readingProgress.last_read_at)}</Typography>
                  </Grid>
                )}
                {hasProgress && (
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      阅读进度
                    </Typography>
                    <Typography variant="body2">{progressPercent}%</Typography>
                  </Grid>
                )}
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

      {/* 编辑书籍对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑书籍信息</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="书名"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="作者"
              value={editForm.author_name}
              onChange={(e) => setEditForm({ ...editForm, author_name: e.target.value })}
              fullWidth
            />
            <TextField
              label="简介"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
              multiline
              rows={4}
            />
            <TextField
              label="出版社"
              value={editForm.publisher}
              onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>年龄分级</InputLabel>
              <Select
                value={editForm.age_rating}
                label="年龄分级"
                onChange={(e) => setEditForm({ ...editForm, age_rating: e.target.value })}
              >
                <MenuItem value="general">一般</MenuItem>
                <MenuItem value="teen">青少年</MenuItem>
                <MenuItem value="mature">成人</MenuItem>
                <MenuItem value="adult">18+</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="内容警告"
              value={editForm.content_warning}
              onChange={(e) => setEditForm({ ...editForm, content_warning: e.target.value })}
              fullWidth
              placeholder="例如：暴力、恐怖等"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveBook} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 标签管理对话框 */}
      <Dialog open={tagDialogOpen} onClose={() => setTagDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>管理书籍标签</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            选择要应用到此书籍的标签
          </Typography>
          
          {allTags.length === 0 ? (
            <Alert severity="info">暂无可用标签，请先在管理后台创建标签。</Alert>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allTags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  onClick={() => {
                    if (selectedTagIds.includes(tag.id)) {
                      setSelectedTagIds(prev => prev.filter(id => id !== tag.id))
                    } else {
                      setSelectedTagIds(prev => [...prev, tag.id])
                    }
                  }}
                  color={selectedTagIds.includes(tag.id) ? 'primary' : 'default'}
                  variant={selectedTagIds.includes(tag.id) ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          )}
          
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              已选择 {selectedTagIds.length} 个标签
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveTags} disabled={savingTags}>
            {savingTags ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
