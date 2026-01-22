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
  Edit, LocalOffer, Layers, Star, StarBorder, Delete,
  Link, LinkOff, Collections, Notes, FileDownload, Email
} from '@mui/icons-material'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { formatDateShort, formatDateTime, formatRelativeTime } from '../utils/dateUtils'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface TagInfo {
  id: number
  name: string
  type: string
  description?: string
}

interface BookVersion {
  id: number
  file_name: string
  file_format: string
  file_size: number
  quality: string | null
  source: string | null
  is_primary: boolean
  added_at: string
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
  // 多版本支持
  version_count?: number
  versions?: BookVersion[]
  available_formats?: string[]
}

interface ReadingProgress {
  progress: number
  position: string | null
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

// 书籍组中的书籍信息
interface GroupedBook {
  id: number
  title: string
  author_name: string | null
  cover_path: string | null
  version_count: number
  formats: string[]
  total_size: number
  is_primary: boolean
  is_current: boolean
}

// 书籍组信息
interface BookGroupInfo {
  book_id: number
  book_title: string
  group_id: number | null
  grouped_books: GroupedBook[]
  is_grouped: boolean
}

export default function BookDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, user } = useAuthStore()
  
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
  const [autoTagging, setAutoTagging] = useState(false)
  
  // 版本管理
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [settingPrimary, setSettingPrimary] = useState<number | null>(null)
  
  // 书籍组管理
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [bookGroupInfo, setBookGroupInfo] = useState<BookGroupInfo | null>(null)
  const [loadingGroup, setLoadingGroup] = useState(false)
  const [ungrouping, setUngrouping] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  // 批注相关
  const [annotationCount, setAnnotationCount] = useState(0)
  const [exportingAnnotations, setExportingAnnotations] = useState(false)
  const [kindleDialogOpen, setKindleDialogOpen] = useState(false)
  const [kindleEmail, setKindleEmail] = useState('')
  const [kindleTargetFormat, setKindleTargetFormat] = useState('azw3')
  const [kindleSending, setKindleSending] = useState(false)
  const [kindleError, setKindleError] = useState<string | null>(null)
  const [kindleSuccess, setKindleSuccess] = useState<string | null>(null)
  const [kindleLoading, setKindleLoading] = useState(false)

  // 设置页面标题 - 必须在条件return之前调用
  useDocumentTitle(book?.title || '书籍详情')

  useEffect(() => {
    if (id) {
      loadBook()
      checkFavoriteStatus()
      loadReadingProgress()
      loadAnnotationCount()
    }
  }, [id])

  useEffect(() => {
    loadAllTags()
  }, [])

  useEffect(() => {
    if (tagDialogOpen) {
      setSelectedTagIds(book?.tags?.map((tag) => tag.id) || [])
    }
  }, [tagDialogOpen, book])

  const loadBook = async () => {
    try {
      setLoading(true)
      setError('')
      setImageError(false)
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

  const loadAnnotationCount = async () => {
    try {
      const response = await api.get(`/api/annotations/book/${id}`)
      setAnnotationCount(response.data?.length || 0)
    } catch (err) {
      // 可能没有批注，不需要报错
      console.debug('没有批注')
    }
  }

  const handleExportAnnotations = async () => {
    try {
      setExportingAnnotations(true)
      const response = await api.get(`/api/annotations/book/${id}/export`)
      const data = response.data
      
      // 生成导出内容
      let content = `# ${data.book_title} - 批注导出\n\n`
      content += `导出时间: ${new Date(data.exported_at).toLocaleString()}\n`
      content += `批注总数: ${data.total_annotations}\n\n`
      content += `---\n\n`
      
      data.annotations.forEach((annotation: any, index: number) => {
        content += `## ${index + 1}. ${annotation.chapter_title || '未知章节'}\n\n`
        content += `> ${annotation.selected_text}\n\n`
        if (annotation.note) {
          content += `📝 **笔记**: ${annotation.note}\n\n`
        }
        content += `🏷️ 类型: ${annotation.annotation_type} | 颜色: ${annotation.color}\n`
        content += `📅 创建时间: ${new Date(annotation.created_at).toLocaleString()}\n\n`
        content += `---\n\n`
      })
      
      // 下载文件
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.book_title}-批注导出.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('导出批注失败:', err)
      alert(err.response?.data?.detail || '导出失败')
    } finally {
      setExportingAnnotations(false)
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

  const handleAutoTag = async () => {
    try {
      setAutoTagging(true)
      const response = await api.post(`/api/admin/books/${id}/auto-tag`)
      const newTags = response.data?.new_tags || []
      await loadBook()
      await loadAllTags()
      if (!newTags.length) {
        alert('未提取到新的标签')
        return
      }
      alert(`已添加 ${newTags.length} 个标签：${newTags.join('、')}`)
    } catch (err: any) {
      console.error('自动打标签失败:', err)
      alert(err.response?.data?.detail || '自动打标签失败')
    } finally {
      setAutoTagging(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const normalizeFormat = (value?: string | null) => (value || '').toLowerCase().trim()
  const extractExtension = (value?: string | null) => {
    const normalized = normalizeFormat(value)
    if (!normalized) return ''
    const match = normalized.match(/\.([a-z0-9]+)$/)
    if (match?.[1]) return match[1]
    return normalized.replace(/^\./, '')
  }
  const isTxtLike = (value?: string | null) => extractExtension(value) === 'txt'
  const getFormatCandidates = (target?: BookDetail | null) => {
    if (!target) return []
    const versionFormats = target.versions?.map((version) => version.file_format) || []
    const versionNames = target.versions?.map((version) => version.file_name) || []
    return [
      target.file_format,
      target.file_path,
      ...(target.available_formats || []),
      ...versionFormats,
      ...versionNames
    ]
  }
  const isTxtBook = (target?: BookDetail | null) => getFormatCandidates(target).some(isTxtLike)

  const handleRead = () => {
    if (!isTxtBook(book)) {
      alert('在线阅读仅支持 TXT 格式，请下载原文件')
      return
    }
    navigate(`/book/${id}/reader`)
  }

  const handleDownload = () => {
    if (!token) {
      alert('请先登录')
      return
    }
    window.open(`/api/books/${id}/download?token=${token}`, '_blank')
  }

  const handleOpenKindleDialog = async () => {
    if (!token) {
      alert('请先登录')
      return
    }
    setKindleDialogOpen(true)
    setKindleError(null)
    setKindleSuccess(null)

    const txtOnly = isTxtBook(book)
    setKindleTargetFormat(txtOnly ? 'txt' : 'azw3')

    if (!kindleEmail) {
      try {
        setKindleLoading(true)
        const res = await api.get('/api/user/settings')
        setKindleEmail(res.data?.kindle_email || '')
      } catch (err) {
        console.error('加载 Kindle 邮箱失败:', err)
      } finally {
        setKindleLoading(false)
      }
    }
  }

  const handleSendToKindle = async () => {
    try {
      setKindleSending(true)
      setKindleError(null)
      setKindleSuccess(null)
      const payload = {
        target_format: kindleTargetFormat,
        to_email: kindleEmail.trim() ? kindleEmail.trim() : undefined,
        wait_for_conversion: true,
      }
      const response = await api.post(`/api/books/${id}/send-to-kindle`, payload)
      if (response.data?.status === 'converting') {
        setKindleSuccess('格式转换中，请稍后重试发送')
      } else {
        setKindleSuccess(`已发送到 ${response.data?.to_email || kindleEmail}`)
      }
    } catch (err: any) {
      console.error('发送到 Kindle 失败:', err)
      setKindleError(err.response?.data?.detail || '发送失败，请检查 Kindle 设置')
    } finally {
      setKindleSending(false)
    }
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

  const handleSetPrimaryVersion = async (versionId: number) => {
    try {
      setSettingPrimary(versionId)
      await api.post(`/api/books/${id}/versions/${versionId}/set-primary`)
      await loadBook()
    } catch (err: any) {
      console.error('设置主版本失败:', err)
      alert(err.response?.data?.detail || '设置失败')
    } finally {
      setSettingPrimary(null)
    }
  }

  // 加载书籍组信息
  const loadBookGroupInfo = async () => {
    try {
      setLoadingGroup(true)
      const response = await api.get<BookGroupInfo>(`/api/admin/books/${id}/group`)
      setBookGroupInfo(response.data)
    } catch (err: any) {
      console.error('加载书籍组信息失败:', err)
      // 如果没有组信息，设置为空
      setBookGroupInfo(null)
    } finally {
      setLoadingGroup(false)
    }
  }

  // 打开书籍组对话框
  const handleOpenGroupDialog = async () => {
    setGroupDialogOpen(true)
    await loadBookGroupInfo()
  }

  // 从组中移除当前书籍
  const handleUngroupBook = async () => {
    if (!confirm('确定要将此书籍从组中移除吗？')) {
      return
    }
    try {
      setUngrouping(true)
      await api.delete(`/api/admin/books/${id}/group`)
      await loadBookGroupInfo()
    } catch (err: any) {
      console.error('移除书籍组失败:', err)
      alert(err.response?.data?.detail || '移除失败')
    } finally {
      setUngrouping(false)
    }
  }

  // 设置组主书籍
  const handleSetGroupPrimary = async (bookId: number) => {
    if (!bookGroupInfo?.group_id) return
    try {
      await api.put(`/api/admin/book-groups/${bookGroupInfo.group_id}/primary`, {
        book_id: bookId
      })
      await loadBookGroupInfo()
    } catch (err: any) {
      console.error('设置主书籍失败:', err)
      alert(err.response?.data?.detail || '设置失败')
    }
  }

  // 跳转到组内其他书籍
  const navigateToBook = (bookId: number) => {
    setGroupDialogOpen(false)
    navigate(`/book/${bookId}`)
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
  const isTxtFormat = isTxtBook(book)
  const primaryFormat = extractExtension(book.file_format || book.versions?.find(v => v.is_primary)?.file_format || book.versions?.[0]?.file_format || '')
  const kindleInputSupported = ['epub', 'mobi', 'azw3', 'txt'].includes(primaryFormat)
  const kindleFormatOptions = primaryFormat === 'txt' ? ['txt'] : ['azw3', 'mobi', 'epub']

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
              {!imageError ? (
                <Box
                  component="img"
                  src={`/api/books/${book.id}/cover`}
                  alt={book.title}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  onError={() => setImageError(true)}
                />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '64px' }}>
                  📖
                </Box>
              )}
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
              label={(book.file_format || 'UNKNOWN').toUpperCase()}
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
            {isTxtFormat ? (
              <Button
                variant="contained"
                size="large"
                startIcon={hasProgress ? <PlayArrow /> : <MenuBook />}
                onClick={handleRead}
                sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: 180 }}
              >
                {hasProgress ? '继续阅读' : '开始阅读'}
              </Button>
            ) : (
              <Button
                variant="outlined"
                size="large"
                startIcon={<MenuBook />}
                disabled
                sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: 180 }}
              >
                仅TXT在线阅读
              </Button>
            )}
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
              startIcon={<Email />}
              onClick={handleOpenKindleDialog}
              disabled={!token || !kindleInputSupported}
            >
              发送到 Kindle
            </Button>
            {user?.isAdmin && (
              <>
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
                {book.versions && book.versions.length > 1 && (
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<Layers />}
                    onClick={() => setVersionDialogOpen(true)}
                  >
                    版本 ({book.versions.length})
                  </Button>
                )}
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<Collections />}
                  onClick={handleOpenGroupDialog}
                >
                  书籍组
                </Button>
              </>
            )}
            {annotationCount > 0 && (
              <Button
                variant="outlined"
                size="large"
                startIcon={exportingAnnotations ? <CircularProgress size={20} /> : <Notes />}
                onClick={handleExportAnnotations}
                disabled={exportingAnnotations}
              >
                导出批注 ({annotationCount})
              </Button>
            )}
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
                    原文件名
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {book.versions?.[0]?.file_name || '未知'}
                  </Typography>
                </Grid>
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

      {/* 发送到 Kindle 对话框 */}
      <Dialog open={kindleDialogOpen} onClose={() => setKindleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>发送到 Kindle</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            通过邮件发送书籍到 Kindle。请确保已在 Kindle 设置中添加此发件邮箱到“已认可的发件人”。
          </Typography>

          {!kindleInputSupported && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              当前主版本格式不支持 Kindle 推送，请尝试下载原文件。
            </Alert>
          )}

          {kindleLoading ? (
            <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">加载中...</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Kindle 邮箱"
                value={kindleEmail}
                onChange={(e) => setKindleEmail(e.target.value)}
                placeholder="yourname@kindle.com"
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>发送格式</InputLabel>
                <Select
                  value={kindleTargetFormat}
                  label="发送格式"
                  onChange={(e) => setKindleTargetFormat(e.target.value)}
                >
                  {kindleFormatOptions.map((format) => (
                    <MenuItem key={format} value={format}>
                      {format.toUpperCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {kindleError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {kindleError}
            </Alert>
          )}

          {kindleSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {kindleSuccess}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKindleDialogOpen(false)}>关闭</Button>
          <Button
            variant="contained"
            onClick={handleSendToKindle}
            disabled={kindleSending || !kindleInputSupported}
          >
            {kindleSending ? '发送中...' : '发送'}
          </Button>
        </DialogActions>
      </Dialog>

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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleAutoTag}
              disabled={autoTagging}
            >
              {autoTagging ? '智能分析中...' : '智能建议'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              基于书名、作者、文件名与内容关键词
            </Typography>
          </Box>
          
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

      {/* 版本管理对话框 */}
      <Dialog open={versionDialogOpen} onClose={() => setVersionDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Layers />
          书籍版本管理
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            此书籍有 {book.versions?.length || 0} 个版本。主版本将用于阅读和下载。
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {book.versions?.map((version) => (
              <Paper 
                key={version.id} 
                variant="outlined" 
                sx={{ 
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  bgcolor: version.is_primary ? 'action.selected' : 'transparent',
                  borderColor: version.is_primary ? 'primary.main' : 'divider'
                }}
              >
                {/* 格式图标 */}
                <Chip 
                  label={(version.file_format || '').toUpperCase()} 
                  size="small" 
                  color={version.is_primary ? 'primary' : 'default'}
                />
                
                {/* 版本信息 */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={version.file_name}>
                    {version.file_name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(version.file_size)}
                    </Typography>
                    {version.quality && (
                      <Typography variant="caption" color="text.secondary">
                        品质: {version.quality}
                      </Typography>
                    )}
                    {version.source && (
                      <Typography variant="caption" color="text.secondary">
                        来源: {version.source}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      添加于 {formatDateShort(version.added_at)}
                    </Typography>
                  </Box>
                </Box>
                
                {/* 主版本标记 */}
                {version.is_primary && (
                  <Chip 
                    icon={<Star sx={{ fontSize: 16 }} />}
                    label="主版本" 
                    size="small" 
                    color="warning"
                  />
                )}
                
                {/* 操作按钮 */}
                {!version.is_primary && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={settingPrimary === version.id ? <CircularProgress size={16} /> : <StarBorder />}
                    onClick={() => handleSetPrimaryVersion(version.id)}
                    disabled={settingPrimary !== null}
                  >
                    设为主版本
                  </Button>
                )}
              </Paper>
            ))}
          </Box>
          
          {book.available_formats && book.available_formats.length > 1 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              此书籍有多种格式可用: {book.available_formats.map(f => (f || '').toUpperCase()).join(', ')}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 书籍组管理对话框 */}
      <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Collections />
          书籍组管理
        </DialogTitle>
        <DialogContent>
          {loadingGroup ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : bookGroupInfo?.is_grouped ? (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                此书籍属于一个书籍组，共 {bookGroupInfo.grouped_books.length} 本书籍。
                组内书籍代表同一本书的不同版本或来源，可以统一显示和管理。
              </Alert>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {bookGroupInfo.grouped_books.map((groupedBook) => (
                  <Paper 
                    key={groupedBook.id} 
                    variant="outlined" 
                    sx={{ 
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      bgcolor: groupedBook.is_current ? 'action.selected' : 'transparent',
                      borderColor: groupedBook.is_primary ? 'warning.main' : groupedBook.is_current ? 'primary.main' : 'divider',
                      borderWidth: groupedBook.is_primary || groupedBook.is_current ? 2 : 1,
                      cursor: groupedBook.is_current ? 'default' : 'pointer',
                      '&:hover': groupedBook.is_current ? {} : { bgcolor: 'action.hover' }
                    }}
                    onClick={() => !groupedBook.is_current && navigateToBook(groupedBook.id)}
                  >
                    {/* 封面缩略图 */}
                    <Box
                      sx={{
                        width: 50,
                        height: 70,
                        bgcolor: 'grey.800',
                        borderRadius: 1,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <Box
                        component="img"
                        src={`/api/books/${groupedBook.id}/cover`}
                        alt={groupedBook.title}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </Box>
                    
                    {/* 书籍信息 */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body1" fontWeight={groupedBook.is_current ? 'bold' : 'normal'} noWrap>
                        {groupedBook.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {groupedBook.author_name || '未知作者'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        {groupedBook.formats.map((format) => (
                          <Chip 
                            key={format} 
                            label={(format || '').toUpperCase()} 
                            size="small" 
                            variant="outlined"
                          />
                        ))}
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(groupedBook.total_size)}
                        </Typography>
                        {groupedBook.version_count > 1 && (
                          <Typography variant="caption" color="text.secondary">
                            • {groupedBook.version_count} 个版本
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    
                    {/* 标记 */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      {groupedBook.is_primary && (
                        <Chip 
                          icon={<Star sx={{ fontSize: 16 }} />}
                          label="主书籍" 
                          size="small" 
                          color="warning"
                        />
                      )}
                      {groupedBook.is_current && (
                        <Chip 
                          label="当前" 
                          size="small" 
                          color="primary"
                        />
                      )}
                    </Box>
                    
                    {/* 操作按钮 */}
                    {!groupedBook.is_primary && !groupedBook.is_current && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<StarBorder />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSetGroupPrimary(groupedBook.id)
                        }}
                      >
                        设为主书籍
                      </Button>
                    )}
                  </Paper>
                ))}
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={ungrouping ? <CircularProgress size={16} /> : <LinkOff />}
                  onClick={handleUngroupBook}
                  disabled={ungrouping}
                >
                  从组中移除此书籍
                </Button>
              </Box>
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Collections sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                此书籍尚未加入任何书籍组
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                书籍组功能用于将同一本书的不同版本或来源关联在一起。
                您可以在管理后台的"书库管理"中使用"检测重复书籍"功能来创建书籍组。
              </Typography>
              <Alert severity="info" sx={{ textAlign: 'left' }}>
                <Typography variant="body2">
                  <strong>如何创建书籍组：</strong>
                </Typography>
                <Typography variant="body2" component="ol" sx={{ pl: 2, mb: 0 }}>
                  <li>进入管理后台 → 书库管理</li>
                  <li>选择一个书库，点击"检测重复书籍"</li>
                  <li>系统会自动识别可能的重复书籍</li>
                  <li>选择要合并的书籍，创建书籍组</li>
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
