import { useState, useEffect } from 'react'
import {
  Box, Typography, Button, IconButton, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, CircularProgress,
  Card, CardContent, Grid, LinearProgress, List, ListItem, ListItemText,
  ListItemSecondaryAction, Switch, Divider, Collapse, Stack, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material'
import {
  Add, Edit, Delete, Refresh, FolderOpen, ExpandMore, ExpandLess,
  PlayArrow, Stop, CheckCircle, Error as ErrorIcon, Schedule,
  Folder, DeleteOutline, AddCircle, LocalOffer, Sync, Warning,
  Psychology, Code, Preview, MergeType, Search as SearchIcon,
  AutoFixHigh
} from '@mui/icons-material'
import api from '../../services/api'

interface Library {
  id: number
  name: string
  path: string
  last_scan: string | null
  is_public?: boolean
  book_count?: number
}

interface LibraryPath {
  id: number
  path: string
  enabled: boolean
  created_at: string
}

interface ScanTask {
  id: number
  library_id: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  total_files: number
  processed_files: number
  added_books: number
  skipped_books: number
  error_count: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface ScanErrorLog {
  file: string
  error: string
  type: string
}

interface ScanErrorData {
  main_error?: string
  file_errors?: ScanErrorLog[]
}

interface TagInfo {
  id: number
  name: string
  type: string
  description?: string
}

interface ExtractChange {
  book_id: number
  filename: string
  pattern_name?: string
  current: {
    title: string
    author: string | null
    description?: string
  }
  extracted: {
    title: string | null
    author: string | null
    description?: string
    tags?: string[]
  }
}

interface ExtractResult {
  success: boolean
  error?: string
  library_id: number
  library_name: string
  total_books: number
  sampled_count?: number
  matched_count?: number
  patterns_used?: number
  changes: ExtractChange[]
}

interface DuplicateBook {
  id: number
  title: string
  author_name: string | null
  version_count: number
  formats: string[]
  total_size: number
  added_at: string
}

interface DuplicateGroup {
  key: string
  books: DuplicateBook[]
  suggested_primary_id: number
  reason: string
}

interface DuplicateResult {
  library_id: number
  library_name: string
  duplicate_group_count: number
  duplicate_groups: DuplicateGroup[]
}

export default function LibrariesTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [libraries, setLibraries] = useState<Library[]>([])
  
  // 展开状态
  const [expandedLibrary, setExpandedLibrary] = useState<number | null>(null)
  
  // 路径管理
  const [paths, setPaths] = useState<Record<number, LibraryPath[]>>({})
  const [pathDialogOpen, setPathDialogOpen] = useState(false)
  const [pathDialogMode, setPathDialogMode] = useState<'add' | 'edit'>('add')
  const [selectedLibraryForPath, setSelectedLibraryForPath] = useState<number | null>(null)
  const [editingPath, setEditingPath] = useState<LibraryPath | null>(null)
  const [newPath, setNewPath] = useState('')
  
  // 扫描任务
  const [activeTasks, setActiveTasks] = useState<Record<number, ScanTask>>({})
  const [taskHistories, setTaskHistories] = useState<Record<number, ScanTask[]>>({})
  
  // 书库标签
  const [libraryTags, setLibraryTags] = useState<Record<number, TagInfo[]>>({})
  const [allTags, setAllTags] = useState<TagInfo[]>([])
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [selectedLibraryForTag, setSelectedLibraryForTag] = useState<number | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [applyingTags, setApplyingTags] = useState<number | null>(null)
  
  // 内容分级
  const [contentRatings, setContentRatings] = useState<Record<number, string>>({})
  const [applyingContentRating, setApplyingContentRating] = useState<number | null>(null)
  
  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<'create' | 'edit'>('create')
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null)
  
  // AI/规则提取
  const [extractDialogOpen, setExtractDialogOpen] = useState(false)
  const [extractType, setExtractType] = useState<'ai' | 'pattern'>('ai')
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(new Set())
  const [applyingExtract, setApplyingExtract] = useState(false)
  const [applyingAllPatterns, setApplyingAllPatterns] = useState<number | null>(null)
  
  // 提取任务状态（显示进度条）
  interface ExtractTask {
    libraryId: number
    type: 'ai' | 'pattern'
    status: 'running' | 'completed' | 'failed'
    total: number
    applied: number
    completedAt?: string
    error?: string
  }
  const [extractTasks, setExtractTasks] = useState<Record<number, ExtractTask>>({})
  const [lastExtractTime, setLastExtractTime] = useState<Record<number, string>>({})
  
  // 重复书籍检测和合并
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null)
  const [detectingDuplicates, setDetectingDuplicates] = useState<number | null>(null)
  const [mergingDuplicates, setMergingDuplicates] = useState(false)
  const [selectedMergeGroups, setSelectedMergeGroups] = useState<Set<number>>(new Set())
  
  // 批量AI分析
  interface BatchAnalyzeResult {
    success: boolean
    error?: string
    total_filenames: number
    recognized_count: number
    recognized_books: Array<{
      filename: string
      title: string
      author: string | null
      has_review: boolean
      review_text: string | null
    }>
    patterns: Array<{
      name: string
      regex: string
      title_group: number
      author_group: number
      match_count: number
    }>
    patterns_created: string[]
    applied_count: number
    reviews_added: number
    books_truncated?: boolean
  }
  const [batchAnalyzeDialogOpen, setBatchAnalyzeDialogOpen] = useState(false)
  const [batchAnalyzeLoading, setBatchAnalyzeLoading] = useState(false)
  const [batchAnalyzeResult, setBatchAnalyzeResult] = useState<BatchAnalyzeResult | null>(null)
  const [batchAnalyzeLibraryId, setBatchAnalyzeLibraryId] = useState<number | null>(null)
  const [batchAnalyzeApplyResults, setBatchAnalyzeApplyResults] = useState(false)
  
  // 扫描错误详情
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogTask, setErrorDialogTask] = useState<ScanTask | null>(null)
  const [parsedErrors, setParsedErrors] = useState<ScanErrorLog[] | null>(null)
  const [mainError, setMainError] = useState<string | null>(null)
  
  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    paths: [''] // 支持多路径创建
  })

  useEffect(() => {
    loadLibraries()
    loadAllTags()
  }, [])

  const loadAllTags = async () => {
    try {
      const response = await api.get<TagInfo[]>('/api/tags')
      setAllTags(response.data)
    } catch (err) {
      console.error('加载标签列表失败:', err)
    }
  }

  const loadLibraryTags = async (libraryId: number) => {
    try {
      const response = await api.get<{ tags: TagInfo[] }>(`/api/admin/libraries/${libraryId}/tags`)
      setLibraryTags(prev => ({ ...prev, [libraryId]: response.data.tags }))
    } catch (err) {
      console.error('加载书库标签失败:', err)
    }
  }

  const loadContentRating = async (libraryId: number) => {
    try {
      const response = await api.get<{ content_rating: string }>(`/api/admin/libraries/${libraryId}/content-rating`)
      setContentRatings(prev => ({ ...prev, [libraryId]: response.data.content_rating }))
    } catch (err) {
      console.error('加载内容分级失败:', err)
    }
  }

  const handleContentRatingChange = async (libraryId: number, rating: string) => {
    try {
      await api.put(`/api/admin/libraries/${libraryId}/content-rating`, {
        content_rating: rating
      })
      setContentRatings(prev => ({ ...prev, [libraryId]: rating }))
    } catch (err: any) {
      console.error('更新内容分级失败:', err)
      setError(err.response?.data?.detail || '更新内容分级失败')
    }
  }

  // AI提取
  const handleAIExtract = async (libraryId: number) => {
    setExtractType('ai')
    setExtractLoading(true)
    setExtractResult(null)
    setSelectedChanges(new Set())
    setExtractDialogOpen(true)
    
    try {
      const response = await api.post(`/api/admin/ai/libraries/${libraryId}/ai-extract`)
      if (response.data.success) {
        setExtractResult(response.data)
        // 默认全选
        setSelectedChanges(new Set(response.data.changes.map((c: ExtractChange) => c.book_id)))
      } else {
        setError(response.data.error || 'AI提取失败')
        setExtractDialogOpen(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'AI提取失败')
      setExtractDialogOpen(false)
    } finally {
      setExtractLoading(false)
    }
  }
  
  // 规则提取
  const handlePatternExtract = async (libraryId: number) => {
    setExtractType('pattern')
    setExtractLoading(true)
    setExtractResult(null)
    setSelectedChanges(new Set())
    setExtractDialogOpen(true)
    
    try {
      const response = await api.post(`/api/admin/ai/libraries/${libraryId}/pattern-extract`)
      if (response.data.success) {
        setExtractResult(response.data)
        // 默认全选
        setSelectedChanges(new Set(response.data.changes.map((c: ExtractChange) => c.book_id)))
      } else {
        setError(response.data.error || '规则提取失败')
        setExtractDialogOpen(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '规则提取失败')
      setExtractDialogOpen(false)
    } finally {
      setExtractLoading(false)
    }
  }
  
  // 直接批量应用规则到所有匹配书籍（不预览）
  const handleApplyAllPatterns = async (libraryId: number) => {
    const library = libraries.find(l => l.id === libraryId)
    if (!confirm(`确定要使用文件名规则批量更新书库"${library?.name || libraryId}"中所有匹配的书籍吗？\n\n这将直接更新书名和作者，无需预览。此操作不可撤销！`)) {
      return
    }
    
    // 设置任务状态为运行中
    setExtractTasks(prev => ({
      ...prev,
      [libraryId]: {
        libraryId,
        type: 'pattern',
        status: 'running',
        total: 0,
        applied: 0
      }
    }))
    
    try {
      const response = await api.post(`/api/admin/ai/libraries/${libraryId}/pattern-extract/apply-all`)
      
      if (response.data.success) {
        // 更新任务状态为完成
        const now = new Date().toISOString()
        setExtractTasks(prev => ({
          ...prev,
          [libraryId]: {
            libraryId,
            type: 'pattern',
            status: 'completed',
            total: response.data.matched_count,
            applied: response.data.applied_count,
            completedAt: now
          }
        }))
        setLastExtractTime(prev => ({ ...prev, [libraryId]: now }))
        loadLibraries()
        
        // 5秒后清除完成状态
        setTimeout(() => {
          setExtractTasks(prev => {
            const newTasks = { ...prev }
            if (newTasks[libraryId]?.status === 'completed') {
              delete newTasks[libraryId]
            }
            return newTasks
          })
        }, 5000)
      } else {
        setExtractTasks(prev => ({
          ...prev,
          [libraryId]: {
            ...prev[libraryId],
            status: 'failed',
            error: response.data.error
          }
        }))
        setError(response.data.error || '批量应用失败')
      }
    } catch (err: any) {
      setExtractTasks(prev => ({
        ...prev,
        [libraryId]: {
          ...prev[libraryId],
          status: 'failed',
          error: err.response?.data?.detail || '批量应用失败'
        }
      }))
      setError(err.response?.data?.detail || '批量应用失败')
    } finally {
      setApplyingAllPatterns(null)
    }
  }
  
  // 应用提取结果（异步执行，立即关闭对话框，显示进度条）
  const handleApplyExtract = async () => {
    if (!extractResult) return
    
    const changesToApply = extractResult.changes.filter(c => selectedChanges.has(c.book_id))
    if (changesToApply.length === 0) {
      alert('请至少选择一项变更')
      return
    }
    
    const count = changesToApply.length
    const libraryId = extractResult.library_id
    const type = extractType
    
    // 立即关闭对话框
    setExtractDialogOpen(false)
    
    // 设置任务状态为运行中
    setExtractTasks(prev => ({
      ...prev,
      [libraryId]: {
        libraryId,
        type,
        status: 'running',
        total: count,
        applied: 0
      }
    }))
    
    // 后台执行应用
    try {
      const endpoint = type === 'ai' 
        ? `/api/admin/ai/libraries/${libraryId}/ai-extract/apply`
        : `/api/admin/ai/libraries/${libraryId}/pattern-extract/apply`
      
      const response = await api.post(endpoint, { changes: changesToApply })
      
      // 更新任务状态为完成
      const now = new Date().toISOString()
      setExtractTasks(prev => ({
        ...prev,
        [libraryId]: {
          libraryId,
          type,
          status: 'completed',
          total: count,
          applied: response.data.applied_count,
          completedAt: now
        }
      }))
      setLastExtractTime(prev => ({ ...prev, [libraryId]: now }))
      loadLibraries()
      
      // 5秒后清除完成状态
      setTimeout(() => {
        setExtractTasks(prev => {
          const newTasks = { ...prev }
          if (newTasks[libraryId]?.status === 'completed') {
            delete newTasks[libraryId]
          }
          return newTasks
        })
      }, 5000)
    } catch (err: any) {
      setExtractTasks(prev => ({
        ...prev,
        [libraryId]: {
          ...prev[libraryId],
          status: 'failed',
          error: err.response?.data?.detail || `应用失败`
        }
      }))
      setError(err.response?.data?.detail || `应用 ${count} 项变更失败`)
    } finally {
      setApplyingExtract(false)
    }
  }
  
  const toggleChangeSelection = (bookId: number) => {
    setSelectedChanges(prev => {
      const newSet = new Set(prev)
      if (newSet.has(bookId)) {
        newSet.delete(bookId)
      } else {
        newSet.add(bookId)
      }
      return newSet
    })
  }
  
  const toggleAllChanges = () => {
    if (!extractResult) return
    if (selectedChanges.size === extractResult.changes.length) {
      setSelectedChanges(new Set())
    } else {
      setSelectedChanges(new Set(extractResult.changes.map(c => c.book_id)))
    }
  }

  // 检测重复书籍
  const handleDetectDuplicates = async (libraryId: number) => {
    setDetectingDuplicates(libraryId)
    try {
      const response = await api.get<DuplicateResult>(`/api/admin/libraries/${libraryId}/detect-duplicates`)
      setDuplicateResult(response.data)
      setSelectedMergeGroups(new Set(response.data.duplicate_groups.map((_, i) => i)))
      setDuplicateDialogOpen(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || '检测重复书籍失败')
    } finally {
      setDetectingDuplicates(null)
    }
  }
  
  // 合并选中的重复书籍
  const handleMergeDuplicates = async () => {
    if (!duplicateResult || selectedMergeGroups.size === 0) return
    
    const mergeGroups = duplicateResult.duplicate_groups
      .filter((_, i) => selectedMergeGroups.has(i))
      .map(group => ({
        keep_id: group.suggested_primary_id,
        merge_ids: group.books.filter(b => b.id !== group.suggested_primary_id).map(b => b.id)
      }))
    
    setMergingDuplicates(true)
    try {
      const response = await api.post(`/api/admin/libraries/${duplicateResult.library_id}/merge-duplicates`, {
        merge_groups: mergeGroups
      })
      
      alert(`合并完成！\n- 处理 ${response.data.merge_group_count} 组\n- 转移 ${response.data.total_merged_versions} 个版本\n- 跳过 ${response.data.total_skipped_duplicates} 个重复文件`)
      
      setDuplicateDialogOpen(false)
      setDuplicateResult(null)
      loadLibraries()
    } catch (err: any) {
      setError(err.response?.data?.detail || '合并失败')
    } finally {
      setMergingDuplicates(false)
    }
  }
  
  // 批量AI分析文件名
  const handleBatchAnalyze = async (libraryId: number, applyResults: boolean = false) => {
    setBatchAnalyzeLibraryId(libraryId)
    setBatchAnalyzeLoading(true)
    setBatchAnalyzeResult(null)
    setBatchAnalyzeApplyResults(applyResults)
    setBatchAnalyzeDialogOpen(true)
    
    try {
      const response = await api.post(`/api/admin/ai/patterns/batch-analyze-library/${libraryId}`, null, {
        params: {
          batch_size: 1000,
          apply_results: applyResults
        }
      })
      
      if (response.data.success) {
        setBatchAnalyzeResult(response.data)
        if (applyResults && response.data.applied_count > 0) {
          loadLibraries()
        }
      } else {
        setError(response.data.error || '批量AI分析失败')
        setBatchAnalyzeDialogOpen(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '批量AI分析失败')
      setBatchAnalyzeDialogOpen(false)
    } finally {
      setBatchAnalyzeLoading(false)
    }
  }

  // 自动合并所有重复书籍
  const handleAutoMergeDuplicates = async (libraryId: number) => {
    const library = libraries.find(l => l.id === libraryId)
    if (!confirm(`确定要自动检测并合并书库"${library?.name}"中的所有重复书籍吗？\n\n此操作会将同名同作者的书籍合并为一本，保留所有格式版本。\n⚠️ 此操作不可撤销！`)) {
      return
    }
    
    setDetectingDuplicates(libraryId)
    try {
      const response = await api.post(`/api/admin/libraries/${libraryId}/auto-merge-duplicates`)
      
      if (response.data.detected_groups === 0) {
        alert('没有发现重复书籍')
      } else {
        alert(`自动合并完成！\n- 检测到 ${response.data.detected_groups} 组重复\n- 成功合并 ${response.data.merged_groups} 组\n- 转移 ${response.data.total_merged_versions} 个版本\n- 跳过 ${response.data.total_skipped_duplicates} 个重复文件`)
        loadLibraries()
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '自动合并失败')
    } finally {
      setDetectingDuplicates(null)
    }
  }
  
  const toggleMergeGroupSelection = (index: number) => {
    setSelectedMergeGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }
  
  const toggleAllMergeGroups = () => {
    if (!duplicateResult) return
    if (selectedMergeGroups.size === duplicateResult.duplicate_groups.length) {
      setSelectedMergeGroups(new Set())
    } else {
      setSelectedMergeGroups(new Set(duplicateResult.duplicate_groups.map((_, i) => i)))
    }
  }
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleApplyContentRating = async (libraryId: number) => {
    if (!confirm('确定要将书库的内容分级应用到该书库所有书籍吗？这将覆盖现有书籍的分级设置。')) return
    
    try {
      setApplyingContentRating(libraryId)
      const response = await api.post(`/api/admin/libraries/${libraryId}/apply-content-rating`)
      alert(`成功应用内容分级！已更新 ${response.data.updated_count} 本书的分级为 "${getContentRatingLabel(response.data.content_rating)}"。`)
    } catch (err: any) {
      console.error('应用内容分级失败:', err)
      setError(err.response?.data?.detail || '应用内容分级失败')
    } finally {
      setApplyingContentRating(null)
    }
  }

  const getContentRatingLabel = (rating: string) => {
    const labels: Record<string, string> = {
      'general': '全年龄',
      'teen': '青少年 (13+)',
      'adult': '成人 (18+)',
      'r18': 'R18'
    }
    return labels[rating] || rating
  }

  const getContentRatingColor = (rating: string) => {
    const colors: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
      'general': 'success',
      'teen': 'info',
      'adult': 'warning',
      'r18': 'error'
    }
    return colors[rating] || 'default'
  }

  // WebSocket 连接和轮询活动任务
  useEffect(() => {
    // 建立 WebSocket 连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'scan_progress') {
            const task = message as ScanTask & { type: string };
            const libraryId = task.library_id;
            
            // 更新活动任务状态
            setActiveTasks(prev => {
              if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
                // 任务完成，移除活动任务并刷新历史
                const newTasks = { ...prev };
                delete newTasks[libraryId];
                
                // 延迟一点刷新历史，确保后端数据已提交
                setTimeout(() => {
                  loadLibraries();
                  loadTaskHistory(libraryId);
                }, 500);
                
                return newTasks;
              }
              return { ...prev, [libraryId]: task };
            });
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 5s...');
        reconnectTimeout = setTimeout(connectWs, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws?.close();
      };
    };

    connectWs();

    // 依然保留轮询作为后备，但频率降低
    const hasActiveTasks = Object.values(activeTasks).some(
      task => task.status === 'running' || task.status === 'pending'
    );
    
    let interval: any = null;
    if (hasActiveTasks) {
      interval = setInterval(() => {
        updateActiveTasks();
      }, 10000); // 每10秒轮询一次作为后备
    }
    
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (interval) clearInterval(interval);
    };
  }, [activeTasks]) // 依赖 activeTasks 以便在任务状态变化时更新轮询逻辑

  const loadLibraries = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get<Library[]>('/api/libraries')
      
      // 加载每个书库的详细信息
      const detailedLibraries = await Promise.all(
        response.data.map(async (lib) => {
          try {
            const detailRes = await api.get(`/api/libraries/${lib.id}`)
            return { ...lib, book_count: detailRes.data.book_count }
          } catch {
            return lib
          }
        })
      )
      
      setLibraries(detailedLibraries)
    } catch (err) {
      console.error('加载书库列表失败:', err)
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadLibraryPaths = async (libraryId: number) => {
    try {
      const response = await api.get<LibraryPath[]>(`/api/admin/libraries/${libraryId}/paths`)
      setPaths(prev => ({ ...prev, [libraryId]: response.data }))
    } catch (err) {
      console.error('加载路径失败:', err)
    }
  }

  const loadTaskHistory = async (libraryId: number) => {
    try {
      const response = await api.get<ScanTask[]>(`/api/admin/libraries/${libraryId}/scan-tasks?limit=5`)
      setTaskHistories(prev => ({ ...prev, [libraryId]: response.data }))
      
      // 检查是否有活动任务
      const activeTask = response.data.find(t => t.status === 'running' || t.status === 'pending')
      if (activeTask) {
        setActiveTasks(prev => ({ ...prev, [libraryId]: activeTask }))
      }
    } catch (err) {
      console.error('加载任务历史失败:', err)
    }
  }

  const updateActiveTasks = async () => {
    const taskIds = Object.values(activeTasks).map(t => t.id)
    
    for (const taskId of taskIds) {
      try {
        const response = await api.get<ScanTask>(`/api/admin/scan-tasks/${taskId}`)
        const task = response.data
        
        setActiveTasks(prev => {
          const libraryId = task.library_id
          if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
            // 任务完成，移除活动任务并刷新
            const newTasks = { ...prev }
            delete newTasks[libraryId]
            loadLibraries()
            loadTaskHistory(libraryId)
            return newTasks
          }
          return { ...prev, [libraryId]: task }
        })
      } catch (err) {
        console.error('更新任务状态失败:', err)
      }
    }
  }

  const handleExpandLibrary = async (libraryId: number) => {
    if (expandedLibrary === libraryId) {
      setExpandedLibrary(null)
    } else {
      setExpandedLibrary(libraryId)
      if (!paths[libraryId]) {
        await loadLibraryPaths(libraryId)
      }
      if (!taskHistories[libraryId]) {
        await loadTaskHistory(libraryId)
      }
      if (!libraryTags[libraryId]) {
        await loadLibraryTags(libraryId)
      }
      if (contentRatings[libraryId] === undefined) {
        await loadContentRating(libraryId)
      }
    }
  }

  const handleCreate = () => {
    setDialogType('create')
    setSelectedLibrary(null)
    setFormData({ name: '', paths: [''] })
    setDialogOpen(true)
  }

  const handleEdit = (library: Library) => {
    setDialogType('edit')
    setSelectedLibrary(library)
    setFormData({ name: library.name, paths: [] })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    try {
      if (dialogType === 'create') {
        // 创建书库时只使用第一个路径
        const createData = {
          name: formData.name,
          path: formData.paths[0]
        }
        const response = await api.post<Library>('/api/libraries', createData)
        
        // 如果有多个路径，逐个添加
        if (formData.paths.length > 1 && response.data.id) {
          for (let i = 1; i < formData.paths.length; i++) {
            if (formData.paths[i].trim()) {
              await api.post(`/api/admin/libraries/${response.data.id}/paths`, {
                path: formData.paths[i]
              })
            }
          }
        }
      } else if (dialogType === 'edit' && selectedLibrary) {
        // 编辑时只更新名称，路径在扫描路径区域管理
        await api.put(`/api/libraries/${selectedLibrary.id}`, {
          name: formData.name
        })
      }
      setDialogOpen(false)
      loadLibraries()
    } catch (err) {
      console.error('操作失败:', err)
      setError('操作失败')
    }
  }

  const handleDelete = async (library: Library) => {
    if (!confirm(`确定要删除书库 "${library.name}" 吗？这将删除所有关联的书籍记录。`)) return
    try {
      await api.delete(`/api/libraries/${library.id}`)
      loadLibraries()
    } catch (err) {
      console.error('删除失败:', err)
      setError('删除失败')
    }
  }

  const handleAddPath = (libraryId: number) => {
    setSelectedLibraryForPath(libraryId)
    setPathDialogMode('add')
    setEditingPath(null)
    setNewPath('')
    setPathDialogOpen(true)
  }

  const handleEditPath = (libraryId: number, path: LibraryPath) => {
    setSelectedLibraryForPath(libraryId)
    setPathDialogMode('edit')
    setEditingPath(path)
    setNewPath(path.path)
    setPathDialogOpen(true)
  }

  const handleSubmitPath = async () => {
    if (!selectedLibraryForPath || !newPath.trim()) return
    
    try {
      if (pathDialogMode === 'edit' && editingPath) {
        // 编辑模式
        await api.put(`/api/admin/libraries/${selectedLibraryForPath}/paths/${editingPath.id}`, {
          path: newPath
        })
      } else {
        // 添加模式
        await api.post(`/api/admin/libraries/${selectedLibraryForPath}/paths`, {
          path: newPath
        })
      }
      setPathDialogOpen(false)
      await loadLibraryPaths(selectedLibraryForPath)
    } catch (err: any) {
      console.error(pathDialogMode === 'edit' ? '编辑路径失败:' : '添加路径失败:', err)
      setError(err.response?.data?.detail || (pathDialogMode === 'edit' ? '编辑路径失败' : '添加路径失败'))
    }
  }

  const handleDeletePath = async (libraryId: number, pathId: number) => {
    if (!confirm('确定要删除此路径吗？')) return
    
    try {
      await api.delete(`/api/admin/libraries/${libraryId}/paths/${pathId}`)
      await loadLibraryPaths(libraryId)
    } catch (err: any) {
      console.error('删除路径失败:', err)
      setError(err.response?.data?.detail || '删除路径失败')
    }
  }

  const handleTogglePath = async (libraryId: number, pathId: number, enabled: boolean) => {
    try {
      await api.put(`/api/admin/libraries/${libraryId}/paths/${pathId}/toggle?enabled=${enabled}`)
      await loadLibraryPaths(libraryId)
    } catch (err: any) {
      console.error('切换路径状态失败:', err)
      setError(err.response?.data?.detail || '操作失败')
    }
  }

  const handleStartScan = async (libraryId: number) => {
    try {
      const response = await api.post(`/api/admin/libraries/${libraryId}/scan`)
      const taskId = response.data.task_id
      
      // 开始轮询任务状态
      const taskResponse = await api.get<ScanTask>(`/api/admin/scan-tasks/${taskId}`)
      setActiveTasks(prev => ({ ...prev, [libraryId]: taskResponse.data }))
      
      // 展开库以显示进度
      setExpandedLibrary(libraryId)
      await loadTaskHistory(libraryId)
    } catch (err: any) {
      console.error('启动扫描失败:', err)
      setError(err.response?.data?.detail || '启动扫描失败')
    }
  }

  const handleOpenTagDialog = (libraryId: number) => {
    const currentTags = libraryTags[libraryId] || []
    setSelectedLibraryForTag(libraryId)
    setSelectedTagIds(currentTags.map(t => t.id))
    setTagDialogOpen(true)
  }

  const handleSaveLibraryTags = async () => {
    if (!selectedLibraryForTag) return
    
    try {
      await api.put(`/api/admin/libraries/${selectedLibraryForTag}/tags`, {
        tag_ids: selectedTagIds
      })
      setTagDialogOpen(false)
      await loadLibraryTags(selectedLibraryForTag)
    } catch (err) {
      console.error('保存书库标签失败:', err)
      setError('保存标签失败')
    }
  }

  const handleApplyTagsToBooks = async (libraryId: number) => {
    if (!confirm('确定要将书库默认标签应用到该书库所有书籍吗？已有相同标签的书籍将跳过。')) return
    
    try {
      setApplyingTags(libraryId)
      const response = await api.post(`/api/admin/libraries/${libraryId}/apply-tags`)
      alert(`成功应用标签！共处理 ${response.data.books_count} 本书，添加 ${response.data.applied_count} 个标签关联。`)
    } catch (err: any) {
      console.error('应用标签失败:', err)
      setError(err.response?.data?.detail || '应用标签失败')
    } finally {
      setApplyingTags(null)
    }
  }

  const handleCancelScan = async (taskId: number, libraryId: number) => {
    if (!confirm('确定要取消正在运行的扫描任务吗？')) return
    
    try {
      await api.post(`/api/admin/scan-tasks/${taskId}/cancel`)
      await loadTaskHistory(libraryId)
      setActiveTasks(prev => {
        const newTasks = { ...prev }
        delete newTasks[libraryId]
        return newTasks
      })
    } catch (err) {
      console.error('取消任务失败:', err)
      setError('取消任务失败')
    }
  }

  // 查看错误详情
  const handleViewErrors = (task: ScanTask) => {
    setErrorDialogTask(task)
    
    // 解析 error_message JSON
    if (task.error_message) {
      try {
        const data = JSON.parse(task.error_message)
        // 判断是任务失败（有 main_error）还是部分文件错误（数组）
        if (data.main_error) {
          setMainError(data.main_error)
          setParsedErrors(data.file_errors || [])
        } else if (Array.isArray(data)) {
          setMainError(null)
          setParsedErrors(data)
        } else {
          setMainError(null)
          setParsedErrors(null)
        }
      } catch {
        // 不是 JSON，直接显示为主错误
        setMainError(task.error_message)
        setParsedErrors(null)
      }
    } else {
      setMainError(null)
      setParsedErrors(null)
    }
    
    setErrorDialogOpen(true)
  }

  const getStatusChip = (status: ScanTask['status']) => {
    const statusConfig: Record<ScanTask['status'], { label: string; color: any; icon: any }> = {
      pending: { label: '等待中', color: 'default', icon: <Schedule fontSize="small" /> },
      running: { label: '扫描中', color: 'primary', icon: <CircularProgress size={16} /> },
      completed: { label: '完成', color: 'success', icon: <CheckCircle fontSize="small" /> },
      failed: { label: '失败', color: 'error', icon: <ErrorIcon fontSize="small" /> },
      cancelled: { label: '已取消', color: 'warning', icon: <Stop fontSize="small" /> }
    }
    
    const config = statusConfig[status]
    return <Chip label={config.label} color={config.color} size="small" icon={config.icon} />
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const addPathField = () => {
    setFormData(prev => ({ ...prev, paths: [...prev.paths, ''] }))
  }

  const removePathField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      paths: prev.paths.filter((_, i) => i !== index)
    }))
  }

  const updatePathField = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      paths: prev.paths.map((p, i) => i === index ? value : p)
    }))
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">书库管理</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={handleCreate}>
          添加书库
        </Button>
      </Box>

      <Grid container spacing={2}>
        {libraries.map((library) => {
          const activeTask = activeTasks[library.id]
          const isExpanded = expandedLibrary === library.id
          const libraryPaths = paths[library.id] || []
          const history = taskHistories[library.id] || []
          
          const extractTask = extractTasks[library.id]
          const lastExtract = lastExtractTime[library.id]
          
          return (
            <Grid item xs={12} key={library.id}>
              <Card>
                <CardContent>
                  {/* 库头部 */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6">{library.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <FolderOpen fontSize="small" />
                        {library.path}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                        <Chip label={`${library.book_count || 0} 本书`} size="small" color="primary" variant="outlined" />
                        <Chip label={`上次扫描: ${formatDate(library.last_scan)}`} size="small" variant="outlined" />
                        {lastExtract && (
                          <Chip 
                            label={`上次提取: ${formatDate(lastExtract)}`} 
                            size="small" 
                            variant="outlined" 
                            color="secondary"
                            icon={<Psychology sx={{ fontSize: 16 }} />}
                          />
                        )}
                        {activeTask && <Chip label="扫描中" size="small" color="primary" />}
                        {extractTask?.status === 'running' && (
                          <Chip label="提取中" size="small" color="secondary" />
                        )}
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleStartScan(library.id)}
                        disabled={!!activeTask}
                        title="启动扫描"
                        color="primary"
                      >
                        <PlayArrow />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleAIExtract(library.id)}
                        title="AI提取元数据"
                        color="secondary"
                      >
                        <Psychology />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handlePatternExtract(library.id)}
                        title="规则提取元数据"
                        color="info"
                      >
                        <Code />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleBatchAnalyze(library.id, false)}
                        title="批量AI分析文件名"
                        color="secondary"
                      >
                        <AutoFixHigh />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDetectDuplicates(library.id)}
                        title="检测重复书籍"
                        color="warning"
                        disabled={detectingDuplicates === library.id}
                      >
                        {detectingDuplicates === library.id ? (
                          <CircularProgress size={20} />
                        ) : (
                          <MergeType />
                        )}
                      </IconButton>
                      <IconButton size="small" onClick={() => handleEdit(library)} title="编辑">
                        <Edit />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(library)} color="error" title="删除">
                        <Delete />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleExpandLibrary(library.id)}>
                        {isExpanded ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </Box>
                  </Box>

                  {/* 活动扫描任务进度 */}
                  {activeTask && (
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2">
                          扫描进度: {activeTask.processed_files}/{activeTask.total_files} 文件
                        </Typography>
                        <Typography variant="body2">{activeTask.progress}%</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={activeTask.progress} />
                      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          已添加: {activeTask.added_books}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          已跳过: {activeTask.skipped_books}
                        </Typography>
                        {activeTask.error_count > 0 && (
                          <Typography variant="caption" color="error">
                            错误: {activeTask.error_count}
                          </Typography>
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleCancelScan(activeTask.id, library.id)}
                        >
                          取消
                        </Button>
                      </Box>
                    </Box>
                  )}

                  {/* 元数据提取任务进度 */}
                  {extractTask && (
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {extractTask.type === 'ai' ? <Psychology fontSize="small" /> : <Code fontSize="small" />}
                          {extractTask.type === 'ai' ? 'AI提取' : '规则提取'}
                          {extractTask.status === 'running' && '中...'}
                          {extractTask.status === 'completed' && ' 完成'}
                          {extractTask.status === 'failed' && ' 失败'}
                        </Typography>
                        {extractTask.status === 'completed' && (
                          <Chip 
                            icon={<CheckCircle />} 
                            label={`已更新 ${extractTask.applied} 项`} 
                            size="small" 
                            color="success" 
                          />
                        )}
                        {extractTask.status === 'failed' && (
                          <Chip 
                            icon={<ErrorIcon />} 
                            label={extractTask.error || '失败'} 
                            size="small" 
                            color="error" 
                          />
                        )}
                      </Box>
                      {extractTask.status === 'running' && (
                        <LinearProgress color="secondary" />
                      )}
                      {extractTask.status === 'completed' && (
                        <LinearProgress variant="determinate" value={100} color="success" />
                      )}
                    </Box>
                  )}

                  {/* 展开详情 */}
                  <Collapse in={isExpanded}>
                    <Divider sx={{ my: 2 }} />
                    
                    {/* 路径管理 */}
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>扫描路径</Typography>
                        <Button
                          size="small"
                          startIcon={<AddCircle />}
                          onClick={() => handleAddPath(library.id)}
                        >
                          添加路径
                        </Button>
                      </Box>
                      
                      {libraryPaths.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">暂无路径</Typography>
                      ) : (
                        <List dense>
                          {libraryPaths.map((path) => (
                            <ListItem key={path.id} sx={{ bgcolor: 'action.hover', borderRadius: 1, mb: 0.5 }}>
                              <Folder fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                              <ListItemText
                                primary={path.path}
                                secondary={`添加于 ${formatDate(path.created_at)}`}
                              />
                              <ListItemSecondaryAction>
                                <Switch
                                  edge="end"
                                  checked={path.enabled}
                                  onChange={(e) => handleTogglePath(library.id, path.id, e.target.checked)}
                                  size="small"
                                />
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleEditPath(library.id, path)}
                                  title="编辑路径"
                                  sx={{ ml: 1 }}
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleDeletePath(library.id, path.id)}
                                  color="error"
                                  title="删除路径"
                                  sx={{ ml: 0.5 }}
                                >
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </ListItemSecondaryAction>
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </Box>

                    {/* 书库默认标签 */}
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LocalOffer fontSize="small" />
                          默认标签
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            startIcon={<Sync />}
                            onClick={() => handleApplyTagsToBooks(library.id)}
                            disabled={applyingTags === library.id || (libraryTags[library.id]?.length || 0) === 0}
                          >
                            {applyingTags === library.id ? '应用中...' : '应用到所有书籍'}
                          </Button>
                          <Button
                            size="small"
                            startIcon={<Edit />}
                            onClick={() => handleOpenTagDialog(library.id)}
                          >
                            管理标签
                          </Button>
                        </Stack>
                      </Box>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        新扫描入库的书籍将自动添加这些标签
                      </Typography>
                      
                      {(libraryTags[library.id]?.length || 0) === 0 ? (
                        <Typography variant="body2" color="text.secondary">暂无默认标签</Typography>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {libraryTags[library.id]?.map((tag) => (
                            <Chip
                              key={tag.id}
                              label={tag.name}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      )}
                    </Box>

                    {/* 内容分级 */}
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Warning fontSize="small" />
                          内容分级
                        </Typography>
                        <Button
                          size="small"
                          startIcon={<Sync />}
                          onClick={() => handleApplyContentRating(library.id)}
                          disabled={applyingContentRating === library.id || !contentRatings[library.id]}
                        >
                          {applyingContentRating === library.id ? '应用中...' : '应用到所有书籍'}
                        </Button>
                      </Box>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        新扫描入库的书籍将自动设置此分级，也可手动应用到现有书籍
                      </Typography>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                          <InputLabel>内容分级</InputLabel>
                          <Select
                            value={contentRatings[library.id] || ''}
                            label="内容分级"
                            onChange={(e) => handleContentRatingChange(library.id, e.target.value)}
                          >
                            <MenuItem value="">
                              <em>未设置</em>
                            </MenuItem>
                            <MenuItem value="general">全年龄</MenuItem>
                            <MenuItem value="teen">青少年 (13+)</MenuItem>
                            <MenuItem value="adult">成人 (18+)</MenuItem>
                            <MenuItem value="r18">R18</MenuItem>
                          </Select>
                        </FormControl>
                        
                        {contentRatings[library.id] && (
                          <Chip
                            label={getContentRatingLabel(contentRatings[library.id])}
                            size="small"
                            color={getContentRatingColor(contentRatings[library.id]) as any}
                          />
                        )}
                      </Box>
                    </Box>

                    {/* 扫描历史 */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>扫描历史</Typography>
                      {history.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">暂无扫描记录</Typography>
                      ) : (
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>状态</TableCell>
                                <TableCell>开始时间</TableCell>
                                <TableCell align="right">文件数</TableCell>
                                <TableCell align="right">添加</TableCell>
                                <TableCell align="right">跳过</TableCell>
                                <TableCell align="right">错误</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {history.map((task) => (
                                <TableRow key={task.id}>
                                  <TableCell>{getStatusChip(task.status)}</TableCell>
                                  <TableCell>{formatDate(task.started_at)}</TableCell>
                                  <TableCell align="right">{task.total_files}</TableCell>
                                  <TableCell align="right">{task.added_books}</TableCell>
                                  <TableCell align="right">{task.skipped_books}</TableCell>
                                  <TableCell align="right">
                                    {task.error_count > 0 || task.status === 'failed' ? (
                                      <Button
                                        size="small"
                                        color="error"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleViewErrors(task)
                                        }}
                                        sx={{ minWidth: 'auto', p: 0.5 }}
                                      >
                                        {task.error_count > 0 ? task.error_count : '详情'}
                                      </Button>
                                    ) : (
                                      task.error_count
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            </Grid>
          )
        })}
      </Grid>

      {libraries.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">暂无书库，请点击添加书库</Typography>
        </Box>
      )}

      {/* 创建/编辑书库对话框 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogType === 'create' ? '添加书库' : '编辑书库'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="书库名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
              autoFocus
            />
            
            {dialogType === 'create' && (
              <>
                {formData.paths.map((path, index) => (
                  <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                      label={`扫描路径 ${index + 1}`}
                      value={path}
                      onChange={(e) => updatePathField(index, e.target.value)}
                      fullWidth
                      required
                      helperText={index === 0 ? '书籍文件所在的目录路径' : ''}
                    />
                    {formData.paths.length > 1 && (
                      <IconButton onClick={() => removePathField(index)} color="error" sx={{ mt: 1 }}>
                        <Delete />
                      </IconButton>
                    )}
                  </Box>
                ))}
                
                <Button startIcon={<Add />} onClick={addPathField} variant="outlined" size="small">
                  添加更多路径
                </Button>
                
                <Alert severity="info" sx={{ mt: 1 }}>
                  创建后可在"扫描路径"区域继续添加或管理路径
                </Alert>
              </>
            )}
            
            {dialogType === 'edit' && (
              <Alert severity="info">
                路径管理请展开书库，在"扫描路径"区域进行操作
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmit}>确定</Button>
        </DialogActions>
      </Dialog>

      {/* 书库标签管理对话框 */}
      <Dialog open={tagDialogOpen} onClose={() => setTagDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>管理书库默认标签</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            选择的标签将自动应用到新扫描入库的书籍。
          </Typography>
          
          {allTags.length === 0 ? (
            <Alert severity="info">暂无可用标签，请先在"标签管理"中创建标签。</Alert>
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
          <Button variant="contained" onClick={handleSaveLibraryTags}>保存</Button>
        </DialogActions>
      </Dialog>

      {/* 添加/编辑路径对话框 */}
      <Dialog open={pathDialogOpen} onClose={() => setPathDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{pathDialogMode === 'edit' ? '编辑扫描路径' : '添加扫描路径'}</DialogTitle>
        <DialogContent>
          <TextField
            label="路径"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            fullWidth
            required
            autoFocus
            helperText="输入书籍文件所在的目录路径"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPathDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmitPath}>
            {pathDialogMode === 'edit' ? '保存' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 重复书籍检测对话框 */}
      <Dialog 
        open={duplicateDialogOpen} 
        onClose={() => !mergingDuplicates && setDuplicateDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MergeType />
          重复书籍检测结果
          {duplicateResult && (
            <Chip 
              label={`${duplicateResult.library_name}`} 
              size="small" 
              color="primary" 
              sx={{ ml: 1 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {duplicateResult ? (
            <>
              <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip label={`发现 ${duplicateResult.duplicate_group_count} 组重复`} variant="outlined" color="warning" />
                <Chip label={`已选择 ${selectedMergeGroups.size} 组`} variant="outlined" color="primary" />
              </Box>
              
              {duplicateResult.duplicate_groups.length === 0 ? (
                <Alert severity="success">没有发现重复书籍</Alert>
              ) : (
                <>
                  <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button size="small" onClick={toggleAllMergeGroups}>
                      {selectedMergeGroups.size === duplicateResult.duplicate_groups.length ? '取消全选' : '全选'}
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      选中的组将被合并：同组书籍的所有版本会转移到建议保留的书籍
                    </Typography>
                  </Box>
                  
                  <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {duplicateResult.duplicate_groups.map((group, index) => (
                      <Paper 
                        key={index} 
                        variant="outlined" 
                        sx={{ 
                          p: 2, 
                          mb: 1, 
                          cursor: 'pointer',
                          bgcolor: selectedMergeGroups.has(index) ? 'action.selected' : 'inherit'
                        }}
                        onClick={() => toggleMergeGroupSelection(index)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <input
                            type="checkbox"
                            checked={selectedMergeGroups.has(index)}
                            onChange={() => toggleMergeGroupSelection(index)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Typography variant="subtitle2" fontWeight="bold">
                            {group.books[0]?.title || '未知标题'}
                          </Typography>
                          <Chip label={group.reason} size="small" variant="outlined" />
                          <Chip label={`${group.books.length} 本书`} size="small" color="warning" />
                        </Box>
                        
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>状态</TableCell>
                                <TableCell>书名</TableCell>
                                <TableCell>作者</TableCell>
                                <TableCell>版本数</TableCell>
                                <TableCell>格式</TableCell>
                                <TableCell>大小</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {group.books.map((book) => (
                                <TableRow 
                                  key={book.id}
                                  sx={{ 
                                    bgcolor: book.id === group.suggested_primary_id ? 'success.main' : 'inherit',
                                    color: book.id === group.suggested_primary_id ? 'success.contrastText' : 'inherit',
                                    '& td': {
                                      color: book.id === group.suggested_primary_id ? 'success.contrastText' : 'inherit'
                                    }
                                  }}
                                >
                                  <TableCell>
                                    {book.id === group.suggested_primary_id ? (
                                      <Chip label="保留" size="small" color="success" />
                                    ) : (
                                      <Chip label="合并" size="small" color="default" />
                                    )}
                                  </TableCell>
                                  <TableCell>{book.title}</TableCell>
                                  <TableCell>{book.author_name || '-'}</TableCell>
                                  <TableCell>{book.version_count}</TableCell>
                                  <TableCell>
                                    {book.formats.map(f => (
                                      <Chip key={f} label={f} size="small" sx={{ mr: 0.5 }} />
                                    ))}
                                  </TableCell>
                                  <TableCell>{formatFileSize(book.total_size)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Paper>
                    ))}
                  </Box>
                  
                  <Alert severity="info" sx={{ mt: 2 }}>
                    合并后，被合并书籍的所有版本将转移到"保留"书籍，然后删除被合并的书籍记录。相同文件将被跳过。
                  </Alert>
                </>
              )}
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDuplicateDialogOpen(false)} 
            disabled={mergingDuplicates}
          >
            取消
          </Button>
          <Button 
            variant="contained" 
            onClick={handleMergeDuplicates}
            disabled={mergingDuplicates || !duplicateResult || selectedMergeGroups.size === 0}
            startIcon={mergingDuplicates ? <CircularProgress size={20} /> : <MergeType />}
            color="warning"
          >
            {mergingDuplicates ? '合并中...' : `合并选中的 ${selectedMergeGroups.size} 组`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 批量AI分析对话框 */}
      <Dialog
        open={batchAnalyzeDialogOpen}
        onClose={() => !batchAnalyzeLoading && setBatchAnalyzeDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHigh color="secondary" />
          批量AI分析文件名
          {batchAnalyzeResult && (
            <Chip
              label={libraries.find(l => l.id === batchAnalyzeLibraryId)?.name || ''}
              size="small"
              color="primary"
              sx={{ ml: 1 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {batchAnalyzeLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <CircularProgress size={48} color="secondary" />
              <Typography sx={{ mt: 2 }}>正在使用AI批量分析文件名...</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                此过程可能需要几分钟，取决于书库大小
              </Typography>
            </Box>
          ) : batchAnalyzeResult ? (
            <>
              {/* 统计信息 */}
              <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip label={`总文件: ${batchAnalyzeResult.total_filenames}`} variant="outlined" />
                <Chip label={`已识别: ${batchAnalyzeResult.recognized_count}`} variant="outlined" color="success" />
                {batchAnalyzeApplyResults && (
                  <>
                    <Chip label={`已应用: ${batchAnalyzeResult.applied_count}`} variant="outlined" color="primary" />
                    <Chip label={`添加点评: ${batchAnalyzeResult.reviews_added}`} variant="outlined" color="info" />
                  </>
                )}
                <Chip label={`生成规则: ${batchAnalyzeResult.patterns_created.length}`} variant="outlined" color="secondary" />
              </Box>

              {/* 生成的规则 */}
              {batchAnalyzeResult.patterns_created.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    已生成的文件名规则
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {batchAnalyzeResult.patterns_created.map((name, i) => (
                      <Chip key={i} label={name} size="small" color="secondary" variant="outlined" />
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    这些规则已保存到"文件名规则"管理中，后续扫描会自动应用
                  </Typography>
                </Box>
              )}

              {/* 识别的书籍预览 */}
              {batchAnalyzeResult.recognized_books.length > 0 && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      识别的书籍预览 {batchAnalyzeResult.books_truncated && '(仅显示前100条)'}
                    </Typography>
                  </Box>
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 350 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>文件名</TableCell>
                          <TableCell>识别书名</TableCell>
                          <TableCell>识别作者</TableCell>
                          <TableCell>点评</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {batchAnalyzeResult.recognized_books.map((book, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {book.filename}
                            </TableCell>
                            <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>
                              {book.title || '-'}
                            </TableCell>
                            <TableCell>
                              {book.author || '-'}
                            </TableCell>
                            <TableCell>
                              {book.has_review ? (
                                <Chip
                                  label={book.review_text?.substring(0, 30) + (book.review_text && book.review_text.length > 30 ? '...' : '')}
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  title={book.review_text || ''}
                                />
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* 规则详情 */}
              {batchAnalyzeResult.patterns.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    规则详情
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>规则名称</TableCell>
                          <TableCell>正则表达式</TableCell>
                          <TableCell align="center">书名组</TableCell>
                          <TableCell align="center">作者组</TableCell>
                          <TableCell align="right">匹配数</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {batchAnalyzeResult.patterns.map((pattern, index) => (
                          <TableRow key={index}>
                            <TableCell>{pattern.name}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {pattern.regex}
                            </TableCell>
                            <TableCell align="center">{pattern.title_group}</TableCell>
                            <TableCell align="center">{pattern.author_group}</TableCell>
                            <TableCell align="right">{pattern.match_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {!batchAnalyzeApplyResults && batchAnalyzeResult.recognized_count > 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  以上是预览结果。如需应用到书籍元数据，请点击"重新分析并应用"按钮。
                </Alert>
              )}

              {batchAnalyzeApplyResults && batchAnalyzeResult.applied_count > 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  已成功应用 {batchAnalyzeResult.applied_count} 项变更，添加 {batchAnalyzeResult.reviews_added} 条点评到书籍简介。
                </Alert>
              )}
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBatchAnalyzeDialogOpen(false)}
            disabled={batchAnalyzeLoading}
          >
            关闭
          </Button>
          {batchAnalyzeResult && !batchAnalyzeApplyResults && batchAnalyzeLibraryId && (
            <Button
              variant="contained"
              color="secondary"
              onClick={() => handleBatchAnalyze(batchAnalyzeLibraryId, true)}
              disabled={batchAnalyzeLoading}
              startIcon={batchAnalyzeLoading ? <CircularProgress size={20} /> : <AutoFixHigh />}
            >
              重新分析并应用
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* AI/规则提取预览对话框 */}
      <Dialog 
        open={extractDialogOpen} 
        onClose={() => !extractLoading && !applyingExtract && setExtractDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {extractType === 'ai' ? <Psychology /> : <Code />}
          {extractType === 'ai' ? 'AI提取预览' : '规则提取预览'}
          {extractResult && (
            <Chip 
              label={`${extractResult.library_name}`} 
              size="small" 
              color="primary" 
              sx={{ ml: 1 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {extractLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <CircularProgress size={48} />
              <Typography sx={{ mt: 2 }}>
                {extractType === 'ai' ? '正在使用AI分析文件名...' : '正在使用规则匹配文件名...'}
              </Typography>
            </Box>
          ) : extractResult ? (
            <>
              <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip label={`总书籍: ${extractResult.total_books}`} variant="outlined" />
                {extractType === 'ai' && extractResult.sampled_count && (
                  <Chip label={`采样数: ${extractResult.sampled_count}`} variant="outlined" color="info" />
                )}
                {extractType === 'pattern' && extractResult.matched_count !== undefined && (
                  <Chip label={`匹配: ${extractResult.matched_count}`} variant="outlined" color="success" />
                )}
                <Chip label={`待变更: ${extractResult.changes.length}`} variant="outlined" color="warning" />
                <Chip label={`已选择: ${selectedChanges.size}`} variant="outlined" color="primary" />
              </Box>
              
              {extractResult.changes.length === 0 ? (
                <Alert severity="info">没有需要变更的内容</Alert>
              ) : (
                <>
                  <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button size="small" onClick={toggleAllChanges}>
                      {selectedChanges.size === extractResult.changes.length ? '取消全选' : '全选'}
                    </Button>
                  </Box>
                  
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox">选择</TableCell>
                          <TableCell>文件名</TableCell>
                          {extractType === 'pattern' && <TableCell>匹配规则</TableCell>}
                          <TableCell>当前书名</TableCell>
                          <TableCell>→</TableCell>
                          <TableCell>提取书名</TableCell>
                          <TableCell>当前作者</TableCell>
                          <TableCell>→</TableCell>
                          <TableCell>提取作者</TableCell>
                          <TableCell>标签/额外信息</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {extractResult.changes.map((change) => (
                          <TableRow 
                            key={change.book_id}
                            sx={{ 
                              bgcolor: selectedChanges.has(change.book_id) ? 'action.selected' : 'inherit',
                              cursor: 'pointer'
                            }}
                            onClick={() => toggleChangeSelection(change.book_id)}
                          >
                            <TableCell padding="checkbox">
                              <input
                                type="checkbox"
                                checked={selectedChanges.has(change.book_id)}
                                onChange={() => toggleChangeSelection(change.book_id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {change.filename}
                            </TableCell>
                            {extractType === 'pattern' && (
                              <TableCell>
                                <Chip label={change.pattern_name} size="small" />
                              </TableCell>
                            )}
                            <TableCell sx={{ color: 'text.secondary' }}>
                              {change.current.title}
                            </TableCell>
                            <TableCell>→</TableCell>
                            <TableCell sx={{ 
                              fontWeight: change.extracted.title !== change.current.title ? 'bold' : 'normal',
                              color: change.extracted.title !== change.current.title ? 'success.main' : 'inherit'
                            }}>
                              {change.extracted.title || '-'}
                            </TableCell>
                            <TableCell sx={{ color: 'text.secondary' }}>
                              {change.current.author || '-'}
                            </TableCell>
                            <TableCell>→</TableCell>
                            <TableCell sx={{ 
                              fontWeight: change.extracted.author !== change.current.author ? 'bold' : 'normal',
                              color: change.extracted.author !== change.current.author ? 'success.main' : 'inherit'
                            }}>
                              {change.extracted.author || '-'}
                            </TableCell>
                            {extractType === 'ai' && (
                              <TableCell>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {change.extracted.tags?.slice(0, 3).map((tag, i) => (
                                    <Chip key={i} label={tag} size="small" variant="outlined" />
                                  ))}
                                  {(change.extracted.tags?.length || 0) > 3 && (
                                    <Chip label={`+${change.extracted.tags!.length - 3}`} size="small" />
                                  )}
                                </Box>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  
                  {extractType === 'ai' && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      AI提取还会更新简介并添加标签。只有系统中已存在的标签才会被添加。
                    </Alert>
                  )}
                </>
              )}
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button 
            onClick={() => setExtractDialogOpen(false)} 
            disabled={extractLoading || applyingExtract || applyingAllPatterns !== null}
          >
            取消
          </Button>
          
          {/* 规则提取专用：直接应用全部按钮 */}
          {extractType === 'pattern' && extractResult && extractResult.matched_count && extractResult.matched_count > extractResult.changes.length && (
            <Button
              variant="outlined"
              color="warning"
              onClick={() => {
                setExtractDialogOpen(false)
                handleApplyAllPatterns(extractResult.library_id)
              }}
              disabled={extractLoading || applyingExtract || applyingAllPatterns !== null}
              startIcon={applyingAllPatterns === extractResult.library_id ? <CircularProgress size={20} /> : <Sync />}
            >
              {applyingAllPatterns === extractResult.library_id 
                ? '批量应用中...' 
                : `直接应用全部 ${extractResult.matched_count} 项`}
            </Button>
          )}
          
          <Button 
            variant="contained" 
            onClick={handleApplyExtract}
            disabled={extractLoading || applyingExtract || applyingAllPatterns !== null || !extractResult || selectedChanges.size === 0}
            startIcon={applyingExtract ? <CircularProgress size={20} /> : <CheckCircle />}
          >
            {applyingExtract ? '应用中...' : `应用选中的 ${selectedChanges.size} 项变更`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 扫描错误详情对话框 */}
      <Dialog
        open={errorDialogOpen}
        onClose={() => setErrorDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ErrorIcon color="error" />
          扫描错误详情
          {errorDialogTask && (
            <Chip
              label={errorDialogTask.status === 'failed' ? '任务失败' : `${errorDialogTask.error_count} 个文件错误`}
              size="small"
              color="error"
              sx={{ ml: 1 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {errorDialogTask && (
            <Box>
              {/* 任务信息 */}
              <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip label={`开始时间: ${formatDate(errorDialogTask.started_at)}`} size="small" variant="outlined" />
                <Chip label={`文件总数: ${errorDialogTask.total_files}`} size="small" variant="outlined" />
                <Chip label={`已处理: ${errorDialogTask.processed_files}`} size="small" variant="outlined" />
                <Chip label={`添加: ${errorDialogTask.added_books}`} size="small" variant="outlined" color="success" />
                <Chip label={`跳过: ${errorDialogTask.skipped_books}`} size="small" variant="outlined" />
              </Box>

              {/* 主错误 */}
              {mainError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>任务失败原因</Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {mainError}
                  </Typography>
                </Alert>
              )}

              {/* 文件错误列表 */}
              {parsedErrors && parsedErrors.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    文件处理错误 ({parsedErrors.length} 个)
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>文件路径</TableCell>
                          <TableCell>错误类型</TableCell>
                          <TableCell>错误信息</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {parsedErrors.map((err, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.file}>
                              {err.file}
                            </TableCell>
                            <TableCell>
                              <Chip label={err.type || '未知'} size="small" color="warning" variant="outlined" />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.error}>
                              {err.error}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* 无法解析的错误信息 */}
              {!mainError && !parsedErrors && errorDialogTask.error_message && (
                <Alert severity="warning">
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>原始错误信息</Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {errorDialogTask.error_message}
                  </Typography>
                </Alert>
              )}

              {/* 无错误信息 */}
              {!mainError && !parsedErrors && !errorDialogTask.error_message && (
                <Alert severity="info">
                  没有详细的错误信息
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
