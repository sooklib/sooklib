import { Box, Typography, Card, CardContent, TextField, Button, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert, Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText, IconButton, Chip, Stack, Pagination, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar } from '@mui/material'
import { ExpandMore, Edit, Delete, FileDownload, MenuBook } from '@mui/icons-material'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import PageContainer from '../components/PageContainer'

type AnnotationItem = {
  id: number
  book_id: number
  book_title: string
  chapter_index: number
  chapter_title: string | null
  selected_text: string
  note: string | null
  annotation_type: string
  color: string
  updated_at: string
}

type AnnotationGroup = {
  book_id: number
  book_title: string
  items: AnnotationItem[]
}

export default function AnnotationsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AnnotationItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [filters, setFilters] = useState({ keyword: '', type: '', color: '' })
  const [applied, setApplied] = useState({ keyword: '', type: '', color: '' })
  const [error, setError] = useState('')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  })
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AnnotationItem | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editColor, setEditColor] = useState('yellow')
  const [saving, setSaving] = useState(false)

  const fetchAnnotations = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await api.get('/api/annotations/my', {
        params: {
          page,
          limit: 50,
          keyword: applied.keyword || undefined,
          annotation_type: applied.type || undefined,
          color: applied.color || undefined
        }
      })
      setItems(res.data.items || [])
      setTotalPages(res.data.total_pages || 0)
    } catch (err) {
      console.error('加载批注失败:', err)
      setError('加载批注失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnnotations()
  }, [page, applied])

  const grouped = useMemo<AnnotationGroup[]>(() => {
    const map = new Map<number, AnnotationGroup>()
    items.forEach((item) => {
      if (!map.has(item.book_id)) {
        map.set(item.book_id, {
          book_id: item.book_id,
          book_title: item.book_title,
          items: []
        })
      }
      map.get(item.book_id)!.items.push(item)
    })
    return Array.from(map.values())
  }, [items])

  const handleApplyFilters = () => {
    setApplied(filters)
    setPage(1)
  }

  const handleExport = async (bookId: number, bookTitle: string) => {
    try {
      const res = await api.get(`/api/annotations/book/${bookId}/export`)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${bookTitle}-annotations.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出失败:', err)
      setSnackbar({ open: true, message: '导出失败', severity: 'error' })
    }
  }

  const handleDeleteAll = async (bookId: number) => {
    if (!window.confirm('确定要删除该书籍的所有批注吗？')) return
    try {
      await api.delete(`/api/annotations/book/${bookId}/all`)
      setSnackbar({ open: true, message: '已删除该书籍的全部批注', severity: 'success' })
      fetchAnnotations()
    } catch (err) {
      console.error('删除失败:', err)
      setSnackbar({ open: true, message: '删除失败', severity: 'error' })
    }
  }

  const handleOpenEdit = (item: AnnotationItem) => {
    setEditTarget(item)
    setEditNote(item.note || '')
    setEditColor(item.color || 'yellow')
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    try {
      setSaving(true)
      await api.put(`/api/annotations/${editTarget.id}`, {
        note: editNote,
        color: editColor
      })
      setSnackbar({ open: true, message: '批注已更新', severity: 'success' })
      setEditDialogOpen(false)
      fetchAnnotations()
    } catch (err) {
      console.error('更新失败:', err)
      setSnackbar({ open: true, message: '更新失败', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: AnnotationItem) => {
    if (!window.confirm('确定要删除这条批注吗？')) return
    try {
      await api.delete(`/api/annotations/${item.id}`)
      setSnackbar({ open: true, message: '批注已删除', severity: 'success' })
      fetchAnnotations()
    } catch (err) {
      console.error('删除失败:', err)
      setSnackbar({ open: true, message: '删除失败', severity: 'error' })
    }
  }

  return (
    <PageContainer>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 2 }}>
        批注管理
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }}>
            <TextField
              label="搜索内容/书名/笔记"
              value={filters.keyword}
              onChange={(event) => setFilters(prev => ({ ...prev, keyword: event.target.value }))}
              size="small"
              fullWidth
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>类型</InputLabel>
              <Select
                label="类型"
                value={filters.type}
                onChange={(event) => setFilters(prev => ({ ...prev, type: event.target.value }))}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="highlight">高亮</MenuItem>
                <MenuItem value="note">笔记</MenuItem>
                <MenuItem value="underline">下划线</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>颜色</InputLabel>
              <Select
                label="颜色"
                value={filters.color}
                onChange={(event) => setFilters(prev => ({ ...prev, color: event.target.value }))}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="yellow">黄色</MenuItem>
                <MenuItem value="green">绿色</MenuItem>
                <MenuItem value="blue">蓝色</MenuItem>
                <MenuItem value="red">红色</MenuItem>
                <MenuItem value="purple">紫色</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleApplyFilters}>
              应用筛选
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" alignItems="center" gap={1}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">加载中...</Typography>
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : grouped.length === 0 ? (
        <Alert severity="info">暂无批注记录</Alert>
      ) : (
        grouped.map((group) => (
          <Accordion key={group.book_id} defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation()
                    navigate(`/book/${group.book_id}`)
                  }}
                >
                  <MenuBook fontSize="small" />
                </IconButton>
                <Typography fontWeight="bold" sx={{ flex: 1 }}>
                  {group.book_title}
                </Typography>
                <Chip size="small" label={`${group.items.length} 条`} />
                <Button
                  size="small"
                  startIcon={<FileDownload />}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleExport(group.book_id, group.book_title)
                  }}
                >
                  导出
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDeleteAll(group.book_id)
                  }}
                >
                  清空
                </Button>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <List disablePadding>
                {group.items.map((item) => (
                  <ListItem
                    key={item.id}
                    divider
                    sx={{
                      borderLeft: 3,
                      borderColor: item.color === 'yellow' ? '#FFC107' :
                                   item.color === 'green' ? '#4CAF50' :
                                   item.color === 'blue' ? '#2196F3' :
                                   item.color === 'red' ? '#F44336' :
                                   item.color === 'purple' ? '#9C27B0' : 'grey.400'
                    }}
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={() => handleOpenEdit(item)}>
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(item)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                          "{item.selected_text}"
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          {item.note && (
                            <Typography variant="caption" component="div">
                              备注: {item.note}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {item.chapter_title ? `${item.chapter_title} · ` : ''}
                            第 {item.chapter_index + 1} 章 · {new Date(item.updated_at).toLocaleString()}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        ))
      )}

      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" sx={{ mt: 3 }}>
          <Pagination page={page} count={totalPages} onChange={(_, value) => setPage(value)} />
        </Box>
      )}

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>编辑批注</DialogTitle>
        <DialogContent>
          <TextField
            label="备注"
            fullWidth
            multiline
            minRows={3}
            margin="dense"
            value={editNote}
            onChange={(event) => setEditNote(event.target.value)}
          />
          <FormControl fullWidth margin="dense" size="small">
            <InputLabel>颜色</InputLabel>
            <Select
              label="颜色"
              value={editColor}
              onChange={(event) => setEditColor(event.target.value)}
            >
              <MenuItem value="yellow">黄色</MenuItem>
              <MenuItem value="green">绿色</MenuItem>
              <MenuItem value="blue">蓝色</MenuItem>
              <MenuItem value="red">红色</MenuItem>
              <MenuItem value="purple">紫色</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSaveEdit} variant="contained" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </PageContainer>
  )
}
