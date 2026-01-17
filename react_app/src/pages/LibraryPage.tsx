import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Grid, FormControl, InputLabel, Select, MenuItem,
  ToggleButtonGroup, ToggleButton, CircularProgress, Alert, Chip, Menu,
  Button, Collapse, Autocomplete, TextField, Stack
} from '@mui/material'
import { ViewModule, ViewList, PhotoSizeSelectLarge, FilterList, ExpandMore, ExpandLess } from '@mui/icons-material'
import api from '../services/api'
import { BookSummary, LibrarySummary } from '../types'
import BookCard from '../components/BookCard'
import Pagination from '../components/Pagination'
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

// 支持的格式列表
const SUPPORTED_FORMATS = ['txt', 'epub', 'mobi', 'azw', 'azw3', 'pdf']

export default function LibraryPage() {
  const { libraryId } = useParams()
  const navigate = useNavigate()
  const { coverSize, setCoverSize, paginationMode } = useSettingsStore()
  
  
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [libraries, setLibraries] = useState<LibrarySummary[]>([])
  const [books, setBooks] = useState<BookSummary[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<number | ''>('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState('added_at')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [sizeMenuAnchor, setSizeMenuAnchor] = useState<null | HTMLElement>(null)
  const observerTarget = useRef<HTMLDivElement>(null)
  
  // 筛选器状态
  const [showFilters, setShowFilters] = useState(false)
  const [allTags, setAllTags] = useState<TagInfo[]>([])
  const [selectedTags, setSelectedTags] = useState<TagInfo[]>([])
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])

  useEffect(() => {
    loadLibraries()
  }, [])

  useEffect(() => {
    if (libraryId) {
      setSelectedLibrary(parseInt(libraryId))
    }
  }, [libraryId])

  // 书库变化时重新加载标签
  useEffect(() => {
    loadTags()
    // 清除已选标签（因为新书库可能没有这些标签）
    setSelectedTags([])
  }, [selectedLibrary])

  useEffect(() => {
    setPage(1)
    setHasMore(true)
    setBooks([])
    loadBooks(1, false)
  }, [selectedLibrary, selectedTags, selectedFormats, paginationMode])

  // 加载标签列表（根据选中的书库）
  const loadTags = async () => {
    try {
      let url: string
      if (selectedLibrary) {
        // 加载指定书库的标签（带数量）
        url = `/api/tags/library/${selectedLibrary}`
      } else {
        // 加载所有书库的标签（带数量）
        url = '/api/tags/all-libraries'
      }
      const response = await api.get<TagInfo[]>(url)
      const tags = Array.isArray(response.data) ? response.data : []
      setAllTags(tags)
    } catch (err) {
      console.error('加载标签失败:', err)
      // 如果新API失败，回退到旧API
      try {
        const response = await api.get<TagInfo[]>('/api/tags')
        const tags = Array.isArray(response.data) ? response.data : (response.data as any).tags || []
        setAllTags(tags)
      } catch (fallbackErr) {
        console.error('加载标签失败(fallback):', fallbackErr)
      }
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
      if (selectedFormats.length > 0) {
        url += `&formats=${selectedFormats.join(',')}`
      }
      // 添加标签筛选
      if (selectedTags.length > 0) {
        url += `&tag_ids=${selectedTags.map(t => t.id).join(',')}`
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
      
      // 更新总数和分页状态
      setTotalCount(response.data.total)
      setTotalPages(response.data.total_pages)
      setHasMore(pageNum < response.data.total_pages)
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
    setPage(newPage)
    loadBooks(newPage, false)
    // 滚动到顶部
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

  // 无限滚动观察器（仅在infinite模式下启用）
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
    if (newLibraryId) {
      navigate(`/library/${newLibraryId}`)
    } else {
      navigate('/library')
    }
  }

  // 清除所有筛选
  const clearFilters = () => {
    setSelectedTags([])
    setSelectedFormats([])
  }

  // 计算当前有多少筛选条件
  const filterCount = selectedTags.length + selectedFormats.length

  // 排序书籍
  const sortedBooks = [...books].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return (a.title || '').localeCompare(b.title || '')
      case 'author':
        return (a.author_name || '').localeCompare(b.author_name || '')
      case 'added_at':
      default:
        return new Date(b.added_at || 0).getTime() - new Date(a.added_at || 0).getTime()
    }
  })

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

  // 设置页面标题
  useDocumentTitle(currentLibrary?.name || '书库')

  // 渲染底部分页/加载组件
  const renderPagination = () => {
    if (paginationMode === 'traditional') {
      // 传统分页模式
      return totalPages > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          disabled={loading}
        />
      )
    } else {
      // 无限滚动模式
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
    <Box sx={{ p: 3 }}>
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
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>排序</InputLabel>
          <Select
            value={sortBy}
            label="排序"
            onChange={(e) => setSortBy(e.target.value)}
          >
            <MenuItem value="added_at">最新添加</MenuItem>
            <MenuItem value="title">按标题</MenuItem>
            <MenuItem value="author">按作者</MenuItem>
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
          onChange={(_, value) => value && setViewMode(value)}
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
                    onClick={() => {
                      if (selectedFormats.includes(format)) {
                        setSelectedFormats(selectedFormats.filter(f => f !== format))
                      } else {
                        setSelectedFormats([...selectedFormats, format])
                      }
                    }}
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
                onChange={(_, newValue) => setSelectedTags(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="选择标签..."
                    size="small"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props}>
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
                    />
                  ))
                }
              />
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
            onDelete={() => setSelectedFormats(selectedFormats.filter(f => f !== format))}
          />
        ))}
        {selectedTags.map(tag => (
          <Chip
            key={tag.id}
            label={`标签: ${tag.name}`}
            size="small"
            color="secondary"
            onDelete={() => setSelectedTags(selectedTags.filter(t => t.id !== tag.id))}
          />
        ))}
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
        /* 网格视图 */
        <>
          <Grid container spacing={2}>
            {sortedBooks.map((book) => (
              <Grid item {...getGridColumns()} key={book.id}>
                <BookCard book={book} />
              </Grid>
            ))}
          </Grid>
          {/* 分页组件 */}
          {renderPagination()}
        </>
      ) : (
        /* 列表视图 */
        <>
          <Box>
            {sortedBooks.map((book) => (
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
                {/* 封面缩略图 */}
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

                {/* 信息 */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" fontWeight="medium" noWrap>
                    {book.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {book.author_name || '未知作者'}
                  </Typography>
                </Box>

                {/* 格式标签 */}
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
          {/* 分页组件 */}
          {renderPagination()}
        </>
      )}
    </Box>
  )
}
