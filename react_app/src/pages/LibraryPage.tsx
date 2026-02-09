import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, Grid, FormControl, InputLabel, Select, MenuItem,
  ToggleButtonGroup, ToggleButton, CircularProgress, Alert, Chip, Menu,
  Button, Collapse, Autocomplete, TextField, Stack, Divider
} from '@mui/material'
import { ViewModule, ViewList, PhotoSizeSelectLarge, FilterList, ExpandMore, ExpandLess } from '@mui/icons-material'
import api from '../services/api'
import { BookSummary, LibrarySummary } from '../types'
import BookCard from '../components/BookCard'
import Pagination from '../components/Pagination'
import PageContainer from '../components/PageContainer'
import { useSettingsStore } from '../stores/settingsStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface TagInfo {
  id: number
  name: string
  type: string
  book_count?: number
}

interface BookResponse {
  id: number
  title: string
  author_name: string | null
  file_format: string
  file_size: number
  added_at: string
}

interface BooksApiResponse {
  books: BookResponse[]
  total: number
  page: number
  limit: number
  total_pages: number
}

interface AuthorInfo {
  id: number
  name: string
  book_count?: number
}

interface FilterSnapshot {
  id: string
  name: string
  params: Record<string, string>
  created_at: string
}

// 支持的格式列表
const SUPPORTED_FORMATS = ['txt', 'epub', 'mobi', 'azw', 'azw3', 'pdf']
const CONTENT_RATINGS = [
  { value: 'general', label: '通用' },
  { value: 'teen', label: '青少年' },
  { value: 'adult', label: '成人' },
  { value: 'r18', label: 'R18' }
]
const FILTER_HISTORY_KEY = 'sooklib_filter_history'
const FILTER_SAVED_KEY = 'sooklib_saved_filters'

export default function LibraryPage() {
  const { libraryId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { coverSize, setCoverSize, paginationMode } = useSettingsStore()
  
  // 从 URL 参数中读取状态
  const urlPage = parseInt(searchParams.get('page') || '1', 10)
  const urlTags = useMemo(() => {
    const tagStr = searchParams.get('tags')
    if (!tagStr) return [] as number[]
    return tagStr.split(',').map(t => parseInt(t, 10)).filter(n => !isNaN(n))
  }, [searchParams])
  const urlFormats = useMemo(() => {
    const formatStr = searchParams.get('formats')
    if (!formatStr) return [] as string[]
    return formatStr.split(',').filter(Boolean)
  }, [searchParams])
  const urlAuthorIds = useMemo(() => {
    const authorStr = searchParams.get('author_ids')
    if (!authorStr) return [] as number[]
    return authorStr.split(',').map(t => parseInt(t, 10)).filter(n => !isNaN(n))
  }, [searchParams])
  const urlRatings = useMemo(() => {
    const ratingStr = searchParams.get('age_ratings')
    if (!ratingStr) return [] as string[]
    return ratingStr.split(',').filter(Boolean)
  }, [searchParams])
  const urlMinSize = useMemo(() => {
    const value = searchParams.get('min_size')
    return value ? parseInt(value, 10) : null
  }, [searchParams])
  const urlMaxSize = useMemo(() => {
    const value = searchParams.get('max_size')
    return value ? parseInt(value, 10) : null
  }, [searchParams])
  const urlAddedFrom = searchParams.get('added_from') || ''
  const urlAddedTo = searchParams.get('added_to') || ''
  const urlSort = searchParams.get('sort') || 'added_at_desc'
  const urlView = searchParams.get('view') as 'grid' | 'list' || 'grid'
  
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [libraries, setLibraries] = useState<LibrarySummary[]>([])
  const [books, setBooks] = useState<BookSummary[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<number | ''>('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(urlView)
  const [sortBy, setSortBy] = useState(urlSort)
  const [page, setPage] = useState(urlPage)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [sizeMenuAnchor, setSizeMenuAnchor] = useState<null | HTMLElement>(null)
  const observerTarget = useRef<HTMLDivElement>(null)
  
  // 筛选器状态
  const [showFilters, setShowFilters] = useState(false)
  const [allTags, setAllTags] = useState<TagInfo[]>([])
  const [selectedTags, setSelectedTags] = useState<TagInfo[]>([])
  const [selectedFormats, setSelectedFormats] = useState<string[]>(urlFormats)
  const [allAuthors, setAllAuthors] = useState<AuthorInfo[]>([])
  const [selectedAuthors, setSelectedAuthors] = useState<AuthorInfo[]>([])
  const [selectedRatings, setSelectedRatings] = useState<string[]>(urlRatings)
  const [sizeRange, setSizeRange] = useState<{ min: number | ''; max: number | '' }>({
    min: urlMinSize ? Math.round(urlMinSize / (1024 * 1024)) : '',
    max: urlMaxSize ? Math.round(urlMaxSize / (1024 * 1024)) : ''
  })
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: urlAddedFrom,
    to: urlAddedTo
  })
  const [filterHistory, setFilterHistory] = useState<FilterSnapshot[]>([])
  const [savedFilters, setSavedFilters] = useState<FilterSnapshot[]>([])

  // 更新 URL 参数的辅助函数
  const updateUrlParams = useCallback((updates: Record<string, string | number | null>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === undefined) {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  const mbToBytes = (value: number | '') => {
    if (value === '' || Number.isNaN(value)) return null
    return Math.round(value * 1024 * 1024)
  }

  const buildFilterLabel = (params: Record<string, string>) => {
    const parts: string[] = []
    if (params.formats) parts.push(`格式:${params.formats}`)
    if (params.tags) parts.push(`标签:${params.tags}`)
    if (params.author_ids) parts.push(`作者:${params.author_ids}`)
    if (params.age_ratings) parts.push(`分级:${params.age_ratings}`)
    if (params.min_size || params.max_size) parts.push(`体积:${params.min_size || '-'}~${params.max_size || '-'}`)
    if (params.added_from || params.added_to) parts.push(`时间:${params.added_from || '-'}~${params.added_to || '-'}`)
    return parts.join(' · ') || '无筛选'
  }

  const createSnapshotId = () => {
    if (crypto && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const readStoredFilters = (key: string) => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const data = JSON.parse(raw)
      if (Array.isArray(data)) return data as FilterSnapshot[]
      return []
    } catch {
      return []
    }
  }

  const storeFilters = (key: string, data: FilterSnapshot[]) => {
    localStorage.setItem(key, JSON.stringify(data.slice(0, 20)))
  }

  useEffect(() => {
    loadLibraries()
    loadAuthors()
    setFilterHistory(readStoredFilters(FILTER_HISTORY_KEY))
    setSavedFilters(readStoredFilters(FILTER_SAVED_KEY))
  }, [])

  useEffect(() => {
    if (libraryId) {
      setSelectedLibrary(parseInt(libraryId))
    }
  }, [libraryId])

  // 书库变化时重新加载标签
  useEffect(() => {
    loadTags()
  }, [selectedLibrary])

  // 当 allTags 加载完成后，根据 URL 参数设置 selectedTags
  useEffect(() => {
    if (allTags.length > 0 && urlTags.length > 0) {
      const tagsFromUrl = allTags.filter(t => urlTags.includes(t.id))
      setSelectedTags(tagsFromUrl)
    } else if (urlTags.length === 0) {
      setSelectedTags([])
    }
  }, [allTags, urlTags])

  useEffect(() => {
    setSelectedFormats(urlFormats)
  }, [urlFormats])

  useEffect(() => {
    if (allAuthors.length > 0 && urlAuthorIds.length > 0) {
      const authorsFromUrl = allAuthors.filter(a => urlAuthorIds.includes(a.id))
      setSelectedAuthors(authorsFromUrl)
    } else if (urlAuthorIds.length === 0) {
      setSelectedAuthors([])
    }
  }, [allAuthors, urlAuthorIds])

  useEffect(() => {
    setSelectedRatings(urlRatings)
  }, [urlRatings])

  useEffect(() => {
    setSizeRange({
      min: urlMinSize ? Math.round(urlMinSize / (1024 * 1024)) : '',
      max: urlMaxSize ? Math.round(urlMaxSize / (1024 * 1024)) : ''
    })
  }, [urlMinSize, urlMaxSize])

  useEffect(() => {
    setDateRange({ from: urlAddedFrom, to: urlAddedTo })
  }, [urlAddedFrom, urlAddedTo])

  // URL 参数变化时触发加载
  useEffect(() => {
    setPage(urlPage)
    setHasMore(true)
    setBooks([])
    loadBooks(urlPage, false)
  }, [
    selectedLibrary,
    urlTags.join(','),
    urlFormats.join(','),
    urlAuthorIds.join(','),
    urlRatings.join(','),
    urlMinSize,
    urlMaxSize,
    urlAddedFrom,
    urlAddedTo,
    urlPage,
    paginationMode
  ])

  // 加载标签列表（根据选中的书库）
  const loadTags = async () => {
    try {
      let url: string
      if (selectedLibrary) {
        url = `/api/tags/library/${selectedLibrary}`
      } else {
        url = '/api/tags/all-libraries'
      }
      const response = await api.get<TagInfo[]>(url)
      const tags = Array.isArray(response.data) ? response.data : []
      setAllTags(tags)
    } catch (err) {
      console.error('加载标签失败:', err)
      try {
        const response = await api.get<TagInfo[]>('/api/tags')
        const tags = Array.isArray(response.data) ? response.data : (response.data as any).tags || []
        setAllTags(tags)
      } catch (fallbackErr) {
        console.error('加载标签失败(fallback):', fallbackErr)
      }
    }
  }

  const loadAuthors = async () => {
    try {
      const response = await api.get<AuthorInfo[]>('/api/authors?min_books=1')
      setAllAuthors(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      console.error('加载作者失败:', err)
      setAllAuthors([])
    }
  }

  const loadLibraries = async () => {
    try {
      const response = await api.get<LibrarySummary[]>('/api/libraries')
      setLibraries(response.data)
    } catch (err) {
      console.error('加载书库失败:', err)
    }
  }

  const loadBooks = async (pageNum: number = 1, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError('')
      
      const limit = 50
      let url = `/api/books?page=${pageNum}&limit=${limit}`
      if (selectedLibrary) {
        url += `&library_id=${selectedLibrary}`
      }
      // 添加格式筛选
      if (urlFormats.length > 0) {
        url += `&formats=${urlFormats.join(',')}`
      }
      // 添加标签筛选
      if (urlTags.length > 0) {
        url += `&tag_ids=${urlTags.join(',')}`
      }
      // 添加作者筛选
      if (urlAuthorIds.length > 0) {
        url += `&author_ids=${urlAuthorIds.join(',')}`
      }
      // 内容分级筛选
      if (urlRatings.length > 0) {
        url += `&age_ratings=${urlRatings.join(',')}`
      }
      // 文件大小筛选
      if (urlMinSize !== null) {
        url += `&min_size=${urlMinSize}`
      }
      if (urlMaxSize !== null) {
        url += `&max_size=${urlMaxSize}`
      }
      // 添加时间筛选
      if (urlAddedFrom) {
        url += `&added_from=${urlAddedFrom}`
      }
      if (urlAddedTo) {
        url += `&added_to=${urlAddedTo}`
      }
      // 添加排序参数
      if (sortBy) {
        url += `&sort=${sortBy}`
      }
      
      const response = await api.get<BooksApiResponse>(url)
      
      // 转换为 BookSummary 格式
      const bookSummaries: BookSummary[] = response.data.books.map((book) => ({
        id: book.id,
        title: book.title,
        author_name: book.author_name,
        cover_url: `/books/${book.id}/cover`,
        is_new: false,
        added_at: book.added_at,
        file_format: book.file_format,
      }))
      
      if (append) {
        setBooks(prev => [...prev, ...bookSummaries])
      } else {
        setBooks(bookSummaries)
      }
      
      setTotalCount(response.data.total)
      setTotalPages(response.data.total_pages)
      setHasMore(pageNum < response.data.total_pages)
      recordFilterHistory()
    } catch (err) {
      console.error('加载书籍失败:', err)
      setError('加载失败，请刷新重试')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // 传统分页：切换页码
  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage > 1 ? newPage : null })
    setPage(newPage)
    loadBooks(newPage, false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 无限滚动：加载更多
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1
      setPage(nextPage)
      loadBooks(nextPage, true)
    }
  }, [page, loadingMore, hasMore])

  // 无限滚动观察器
  useEffect(() => {
    if (paginationMode !== 'infinite') return
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )
    
    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }
    
    return () => observer.disconnect()
  }, [loadMore, hasMore, loading, loadingMore, paginationMode])

  const handleLibraryChange = (newLibraryId: number | '') => {
    setSelectedLibrary(newLibraryId)
    // 切换书库时清除筛选参数
    if (newLibraryId) {
      navigate(`/library/${newLibraryId}`)
    } else {
      navigate('/library')
    }
  }

  // 处理标签选择变化
  const handleTagsChange = (newTags: TagInfo[]) => {
    setSelectedTags(newTags)
    const tagIds = newTags.map(t => t.id)
    updateUrlParams({ 
      tags: tagIds.length > 0 ? tagIds.join(',') : null,
      page: null  // 重置页码
    })
  }

  // 处理格式选择变化
  const handleFormatsChange = (format: string) => {
    let newFormats: string[]
    if (selectedFormats.includes(format)) {
      newFormats = selectedFormats.filter(f => f !== format)
    } else {
      newFormats = [...selectedFormats, format]
    }
    setSelectedFormats(newFormats)
    updateUrlParams({
      formats: newFormats.length > 0 ? newFormats.join(',') : null,
      page: null
    })
  }

  const handleAuthorsChange = (newAuthors: AuthorInfo[]) => {
    setSelectedAuthors(newAuthors)
    const authorIds = newAuthors.map(a => a.id)
    updateUrlParams({
      author_ids: authorIds.length > 0 ? authorIds.join(',') : null,
      page: null
    })
  }

  const handleRatingsChange = (rating: string) => {
    let newRatings: string[]
    if (selectedRatings.includes(rating)) {
      newRatings = selectedRatings.filter(r => r !== rating)
    } else {
      newRatings = [...selectedRatings, rating]
    }
    setSelectedRatings(newRatings)
    updateUrlParams({
      age_ratings: newRatings.length > 0 ? newRatings.join(',') : null,
      page: null
    })
  }

  const handleApplySizeRange = () => {
    updateUrlParams({
      min_size: mbToBytes(sizeRange.min),
      max_size: mbToBytes(sizeRange.max),
      page: null
    })
  }

  const handleApplyDateRange = () => {
    updateUrlParams({
      added_from: dateRange.from || null,
      added_to: dateRange.to || null,
      page: null
    })
  }

  const applyQuickFilter = (type: 'recent7' | 'recent30' | 'txt' | 'large20') => {
    if (type === 'recent7' || type === 'recent30') {
      const days = type === 'recent7' ? 7 : 30
      const from = new Date()
      from.setDate(from.getDate() - days)
      const dateStr = from.toISOString().slice(0, 10)
      setDateRange(prev => ({ ...prev, from: dateStr }))
      updateUrlParams({ added_from: dateStr, page: null })
      return
    }
    if (type === 'txt') {
      setSelectedFormats(['txt'])
      updateUrlParams({ formats: 'txt', page: null })
      return
    }
    if (type === 'large20') {
      setSizeRange(prev => ({ ...prev, min: 20 }))
      updateUrlParams({ min_size: mbToBytes(20), page: null })
    }
  }

  // 处理排序变化
  const handleSortChange = (newSort: string) => {
    setSortBy(newSort)
    updateUrlParams({ 
      sort: newSort !== 'added_at_desc' ? newSort : null,
      page: null  // 重置页码
    })
    // 立即重新加载
    setBooks([])
    setPage(1)
    loadBooks(1, false)
  }

  // 处理视图模式变化
  const handleViewChange = (newView: 'grid' | 'list') => {
    setViewMode(newView)
    updateUrlParams({ view: newView !== 'grid' ? newView : null })
  }

  // 清除所有筛选
  const clearFilters = () => {
    setSelectedTags([])
    setSelectedFormats([])
    setSelectedAuthors([])
    setSelectedRatings([])
    setSizeRange({ min: '', max: '' })
    setDateRange({ from: '', to: '' })
    updateUrlParams({
      tags: null,
      formats: null,
      author_ids: null,
      age_ratings: null,
      min_size: null,
      max_size: null,
      added_from: null,
      added_to: null,
      page: null
    })
  }

  // 计算当前有多少筛选条件
  const filterCount = selectedTags.length
    + selectedFormats.length
    + selectedAuthors.length
    + selectedRatings.length
    + (sizeRange.min !== '' ? 1 : 0)
    + (sizeRange.max !== '' ? 1 : 0)
    + (dateRange.from ? 1 : 0)
    + (dateRange.to ? 1 : 0)

  const buildFilterParams = () => {
    const params: Record<string, string> = {}
    if (selectedTags.length > 0) params.tags = selectedTags.map(t => t.id).join(',')
    if (selectedFormats.length > 0) params.formats = selectedFormats.join(',')
    if (selectedAuthors.length > 0) params.author_ids = selectedAuthors.map(a => a.id).join(',')
    if (selectedRatings.length > 0) params.age_ratings = selectedRatings.join(',')
    const minBytes = mbToBytes(sizeRange.min)
    const maxBytes = mbToBytes(sizeRange.max)
    if (minBytes !== null) params.min_size = String(minBytes)
    if (maxBytes !== null) params.max_size = String(maxBytes)
    if (dateRange.from) params.added_from = dateRange.from
    if (dateRange.to) params.added_to = dateRange.to
    return params
  }

  const recordFilterHistory = () => {
    if (filterCount === 0) return
    const params = buildFilterParams()
    const signature = JSON.stringify(params)
    setFilterHistory(prev => {
      const filtered = prev.filter(item => JSON.stringify(item.params) !== signature)
      const item: FilterSnapshot = {
        id: createSnapshotId(),
        name: buildFilterLabel(params),
        params,
        created_at: new Date().toISOString()
      }
      const next = [item, ...filtered].slice(0, 10)
      storeFilters(FILTER_HISTORY_KEY, next)
      return next
    })
  }

  const saveCurrentFilter = () => {
    const params = buildFilterParams()
    if (Object.keys(params).length === 0) {
      alert('当前没有可保存的筛选条件')
      return
    }
    const name = window.prompt('请输入筛选名称', buildFilterLabel(params))
    if (!name) return
    setSavedFilters(prev => {
      const item: FilterSnapshot = {
        id: createSnapshotId(),
        name,
        params,
        created_at: new Date().toISOString()
      }
      const next = [item, ...prev].slice(0, 20)
      storeFilters(FILTER_SAVED_KEY, next)
      return next
    })
  }

  const applyFilterSnapshot = (snapshot: FilterSnapshot) => {
    updateUrlParams({
      tags: snapshot.params.tags || null,
      formats: snapshot.params.formats || null,
      author_ids: snapshot.params.author_ids || null,
      age_ratings: snapshot.params.age_ratings || null,
      min_size: snapshot.params.min_size || null,
      max_size: snapshot.params.max_size || null,
      added_from: snapshot.params.added_from || null,
      added_to: snapshot.params.added_to || null,
      page: null
    })
  }

  const removeFilterSnapshot = (id: string, type: 'history' | 'saved') => {
    if (type === 'history') {
      setFilterHistory(prev => {
        const next = prev.filter(item => item.id !== id)
        storeFilters(FILTER_HISTORY_KEY, next)
        return next
      })
      return
    }
    setSavedFilters(prev => {
      const next = prev.filter(item => item.id !== id)
      storeFilters(FILTER_SAVED_KEY, next)
      return next
    })
  }

  // 根据封面尺寸计算网格列数
  const getGridColumns = () => {
    switch (coverSize) {
      case 'small':
        return { xs: 4, sm: 3, md: 2.4, lg: 2, xl: 1.5 }
      case 'medium':
        return { xs: 6, sm: 4, md: 3, lg: 2, xl: 2 }
      case 'large':
        return { xs: 6, sm: 4, md: 3, lg: 2.4, xl: 2 }
    }
  }

  const currentLibrary = libraries.find((lib) => lib.id === selectedLibrary)

  useDocumentTitle(currentLibrary?.name || '书库')

  const renderPagination = () => {
    if (paginationMode === 'traditional') {
      return totalPages > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          disabled={loading}
        />
      )
    } else {
      return (
        <>
          <Box ref={observerTarget} sx={{ height: 20, mt: 4 }} />
          {loadingMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          )}
          {!hasMore && books.length > 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              已加载全部书籍
            </Typography>
          )}
        </>
      )
    }
  }

  return (
    <PageContainer>
      {/* 标题和工具栏 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight="bold" sx={{ flexGrow: 1 }}>
          {currentLibrary?.name || '所有书籍'}
        </Typography>
        
        {/* 筛选按钮 */}
        <Button
          variant={showFilters ? 'contained' : 'outlined'}
          size="small"
          startIcon={<FilterList />}
          endIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
          onClick={() => setShowFilters(!showFilters)}
          color={filterCount > 0 ? 'primary' : 'inherit'}
        >
          筛选{filterCount > 0 ? ` (${filterCount})` : ''}
        </Button>
        
        {/* 书库选择 */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>书库</InputLabel>
          <Select
            value={selectedLibrary}
            label="书库"
            onChange={(e) => handleLibraryChange(e.target.value as number | '')}
          >
            <MenuItem value="">所有书库</MenuItem>
            {libraries.map((lib) => (
              <MenuItem key={lib.id} value={lib.id}>
                {lib.name} ({lib.book_count})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 排序 */}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>排序</InputLabel>
          <Select
            value={sortBy}
            label="排序"
            onChange={(e) => handleSortChange(e.target.value)}
          >
            <MenuItem value="added_at_desc">最新添加</MenuItem>
            <MenuItem value="added_at_asc">最早添加</MenuItem>
            <MenuItem value="title_asc">标题 A-Z</MenuItem>
            <MenuItem value="title_desc">标题 Z-A</MenuItem>
            <MenuItem value="size_desc">大小↓</MenuItem>
            <MenuItem value="size_asc">大小↑</MenuItem>
            <MenuItem value="format_asc">格式 A-Z</MenuItem>
            <MenuItem value="format_desc">格式 Z-A</MenuItem>
            <MenuItem value="rating_asc">分级↑</MenuItem>
            <MenuItem value="rating_desc">分级↓</MenuItem>
          </Select>
        </FormControl>

        {/* 封面尺寸 */}
        <ToggleButton
          value="size"
          size="small"
          onClick={(e) => setSizeMenuAnchor(e.currentTarget)}
        >
          <PhotoSizeSelectLarge />
        </ToggleButton>
        <Menu
          anchorEl={sizeMenuAnchor}
          open={Boolean(sizeMenuAnchor)}
          onClose={() => setSizeMenuAnchor(null)}
        >
          <MenuItem
            selected={coverSize === 'small'}
            onClick={() => {
              setCoverSize('small')
              setSizeMenuAnchor(null)
            }}
          >
            小
          </MenuItem>
          <MenuItem
            selected={coverSize === 'medium'}
            onClick={() => {
              setCoverSize('medium')
              setSizeMenuAnchor(null)
            }}
          >
            中
          </MenuItem>
          <MenuItem
            selected={coverSize === 'large'}
            onClick={() => {
              setCoverSize('large')
              setSizeMenuAnchor(null)
            }}
          >
            大
          </MenuItem>
        </Menu>

        {/* 视图切换 */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, value) => value && handleViewChange(value)}
          size="small"
        >
          <ToggleButton value="grid">
            <ViewModule />
          </ToggleButton>
          <ToggleButton value="list">
            <ViewList />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* 筛选器面板 */}
      <Collapse in={showFilters}>
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
          <Stack spacing={2}>
            {/* 格式筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>文件格式</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {SUPPORTED_FORMATS.map((format) => (
                  <Chip
                    key={format}
                    label={format.toUpperCase()}
                    onClick={() => handleFormatsChange(format)}
                    color={selectedFormats.includes(format) ? 'primary' : 'default'}
                    variant={selectedFormats.includes(format) ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
            </Box>

            {/* 标签筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>标签</Typography>
              <Autocomplete
                multiple
                options={allTags}
                getOptionLabel={(option) => option.book_count !== undefined 
                  ? `${option.name} (${option.book_count})`
                  : option.name
                }
                value={selectedTags}
                onChange={(_, newValue) => handleTagsChange(newValue)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="选择标签..."
                    size="small"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span>{option.name}</span>
                      {option.book_count !== undefined && (
                        <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                          {option.book_count}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.name}
                      size="small"
                      {...getTagProps({ index })}
                      key={option.id}
                    />
                  ))
                }
              />
            </Box>

            <Divider />

            {/* 作者筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>作者</Typography>
              <Autocomplete
                multiple
                options={allAuthors}
                getOptionLabel={(option) => option.book_count !== undefined
                  ? `${option.name} (${option.book_count})`
                  : option.name
                }
                value={selectedAuthors}
                onChange={(_, newValue) => handleAuthorsChange(newValue)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="选择作者..."
                    size="small"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span>{option.name}</span>
                      {option.book_count !== undefined && (
                        <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                          {option.book_count}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.name}
                      size="small"
                      {...getTagProps({ index })}
                      key={option.id}
                    />
                  ))
                }
              />
            </Box>

            {/* 内容分级筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>内容分级</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {CONTENT_RATINGS.map((rating) => (
                  <Chip
                    key={rating.value}
                    label={rating.label}
                    onClick={() => handleRatingsChange(rating.value)}
                    color={selectedRatings.includes(rating.value) ? 'primary' : 'default'}
                    variant={selectedRatings.includes(rating.value) ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
            </Box>

            {/* 文件大小筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>体积范围 (MB)</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                <TextField
                  size="small"
                  type="number"
                  label="最小"
                  value={sizeRange.min}
                  onChange={(e) => setSizeRange(prev => ({ ...prev, min: e.target.value === '' ? '' : Number(e.target.value) }))}
                />
                <TextField
                  size="small"
                  type="number"
                  label="最大"
                  value={sizeRange.max}
                  onChange={(e) => setSizeRange(prev => ({ ...prev, max: e.target.value === '' ? '' : Number(e.target.value) }))}
                />
                <Button size="small" variant="outlined" onClick={handleApplySizeRange}>
                  应用
                </Button>
              </Stack>
            </Box>

            {/* 添加时间筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>添加时间</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                <TextField
                  size="small"
                  type="date"
                  label="起始"
                  InputLabelProps={{ shrink: true }}
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                />
                <TextField
                  size="small"
                  type="date"
                  label="结束"
                  InputLabelProps={{ shrink: true }}
                  value={dateRange.to}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                />
                <Button size="small" variant="outlined" onClick={handleApplyDateRange}>
                  应用
                </Button>
              </Stack>
            </Box>

            {/* 快捷筛选 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>快捷筛选</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label="最近7天" onClick={() => applyQuickFilter('recent7')} />
                <Chip label="最近30天" onClick={() => applyQuickFilter('recent30')} />
                <Chip label="仅TXT" onClick={() => applyQuickFilter('txt')} />
                <Chip label="大于20MB" onClick={() => applyQuickFilter('large20')} />
              </Stack>
            </Box>

            {/* 保存筛选与历史 */}
            <Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                <Button size="small" variant="contained" onClick={saveCurrentFilter}>
                  保存当前筛选
                </Button>
                <Button size="small" variant="text" onClick={recordFilterHistory}>
                  加入历史
                </Button>
              </Stack>
              {savedFilters.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">已保存</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {savedFilters.map((item) => (
                      <Chip
                        key={item.id}
                        label={item.name}
                        onClick={() => applyFilterSnapshot(item)}
                        onDelete={() => removeFilterSnapshot(item.id, 'saved')}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {filterHistory.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">历史</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {filterHistory.map((item) => (
                      <Chip
                        key={item.id}
                        label={item.name}
                        onClick={() => applyFilterSnapshot(item)}
                        onDelete={() => removeFilterSnapshot(item.id, 'history')}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>

            {/* 清除筛选按钮 */}
            {filterCount > 0 && (
              <Box>
                <Button size="small" onClick={clearFilters}>
                  清除所有筛选
                </Button>
              </Box>
            )}
          </Stack>
        </Box>
      </Collapse>

      {/* 统计信息 */}
      <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          label={`共 ${totalCount} 本书`}
          variant="outlined"
          size="small"
        />
        {paginationMode === 'traditional' && totalPages > 0 && (
          <Chip
            label={`第 ${page} 页 / 共 ${totalPages} 页`}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {paginationMode === 'infinite' && books.length > 0 && books.length < totalCount && (
          <Chip
            label={`已加载 ${books.length}`}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {loadingMore && (
          <Chip
            label="加载中..."
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {/* 显示当前筛选条件 */}
        {selectedFormats.map(format => (
          <Chip
            key={format}
            label={`格式: ${format.toUpperCase()}`}
            size="small"
            color="secondary"
            onDelete={() => handleFormatsChange(format)}
          />
        ))}
        {selectedAuthors.map(author => (
          <Chip
            key={author.id}
            label={`作者: ${author.name}`}
            size="small"
            color="secondary"
            onDelete={() => handleAuthorsChange(selectedAuthors.filter(a => a.id !== author.id))}
          />
        ))}
        {selectedTags.map(tag => (
          <Chip
            key={tag.id}
            label={`标签: ${tag.name}`}
            size="small"
            color="secondary"
            onDelete={() => handleTagsChange(selectedTags.filter(t => t.id !== tag.id))}
          />
        ))}
        {selectedRatings.map(rating => (
          <Chip
            key={rating}
            label={`分级: ${rating}`}
            size="small"
            color="secondary"
            onDelete={() => handleRatingsChange(rating)}
          />
        ))}
        {(sizeRange.min !== '' || sizeRange.max !== '') && (
          <Chip
            label={`体积: ${sizeRange.min || '-'}~${sizeRange.max || '-'}MB`}
            size="small"
            color="secondary"
            onDelete={() => {
              setSizeRange({ min: '', max: '' })
              updateUrlParams({ min_size: null, max_size: null, page: null })
            }}
          />
        )}
        {(dateRange.from || dateRange.to) && (
          <Chip
            label={`时间: ${dateRange.from || '-'}~${dateRange.to || '-'}`}
            size="small"
            color="secondary"
            onDelete={() => {
              setDateRange({ from: '', to: '' })
              updateUrlParams({ added_from: null, added_to: null, page: null })
            }}
          />
        )}
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 加载状态 */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : books.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">
            {filterCount > 0 ? '没有符合筛选条件的书籍' : '暂无书籍'}
          </Typography>
          {filterCount > 0 && (
            <Button sx={{ mt: 2 }} onClick={clearFilters}>
              清除筛选条件
            </Button>
          )}
        </Box>
      ) : viewMode === 'grid' ? (
        <>
          <Grid container spacing={2}>
            {books.map((book) => (
              <Grid item {...getGridColumns()} key={book.id}>
                <BookCard book={book} />
              </Grid>
            ))}
          </Grid>
          {renderPagination()}
        </>
      ) : (
        <>
          <Box>
            {books.map((book) => (
              <Box
                key={book.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => navigate(`/book/${book.id}`)}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 72,
                    bgcolor: 'grey.800',
                    borderRadius: 1,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {book.cover_url && (
                    <Box
                      component="img"
                      src={`/api${book.cover_url}`}
                      alt={book.title}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" fontWeight="medium" noWrap>
                    {book.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {book.author_name || '未知作者'}
                  </Typography>
                </Box>

                {book.file_format && (
                  <Chip
                    label={book.file_format.toUpperCase()}
                    size="small"
                    sx={{ flexShrink: 0 }}
                  />
                )}
              </Box>
            ))}
          </Box>
          {renderPagination()}
        </>
      )}
    </PageContainer>
  )
}
