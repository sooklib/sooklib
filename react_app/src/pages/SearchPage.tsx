import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, TextField, InputAdornment, Grid,
  CircularProgress, Alert, Chip, Accordion, AccordionSummary, AccordionDetails,
  FormControl, InputLabel, Select, MenuItem, OutlinedInput, Checkbox, ListItemText, Button,
  Stack, Paper, List, ListItem, ListItemButton, ListItemIcon, ClickAwayListener,
  Autocomplete
} from '@mui/material'
import { Search, Clear, FilterList, ExpandMore, Person, Book as BookIcon } from '@mui/icons-material'
import api, { commonApi, SearchSuggestion } from '../services/api'
import { BookSummary, Author, LibrarySummary } from '../types'
import BookCard from '../components/BookCard'
import Pagination from '../components/Pagination'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface SearchResponse {
  books: Array<{
    id: number
    title: string
    author_name: string | null
    file_format: string
    file_size: number
    added_at: string
  }>
  total: number
  page: number
  limit: number
  total_pages: number
  query: string
}

const PAGE_SIZE = 24
const FORMATS = ['txt', 'epub', 'mobi', 'azw3', 'pdf', 'cbz', 'cbr']

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // URL 参数
  const q = searchParams.get('q') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const authorId = searchParams.get('author_id') ? parseInt(searchParams.get('author_id')!) : null
  const libraryId = searchParams.get('library_id') ? parseInt(searchParams.get('library_id')!) : null
  const formats = searchParams.get('formats') ? searchParams.get('formats')!.split(',') : []
  
  const [query, setQuery] = useState(q)
  
  // 筛选器状态
  const [selectedAuthor, setSelectedAuthor] = useState<number | ''>(authorId || '')
  const [selectedLibrary, setSelectedLibrary] = useState<number | ''>(libraryId || '')
  const [selectedFormats, setSelectedFormats] = useState<string[]>(formats)
  
  // 资源数据
  const [authors, setAuthors] = useState<Author[]>([])
  const [libraries, setLibraries] = useState<LibrarySummary[]>([])
  
  // 设置页面标题
  useDocumentTitle(q ? `搜索: ${q}` : '搜索')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [books, setBooks] = useState<BookSummary[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  // 搜索建议状态
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const isSelectingSuggestion = useRef(false)
  
  // 加载元数据（作者和书库）
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [authorsData, librariesData] = await Promise.all([
          commonApi.getAuthors(),
          commonApi.getLibraries()
        ])
        setAuthors(authorsData)
        setLibraries(librariesData)
      } catch (err) {
        console.error('加载元数据失败:', err)
      }
    }
    loadMetadata()
  }, [])

  // 加载搜索历史
  useEffect(() => {
    const history = localStorage.getItem('search_history')
    if (history) {
      setSearchHistory(JSON.parse(history))
    }
  }, [])

  // 搜索建议防抖
  useEffect(() => {
    if (isSelectingSuggestion.current) {
      isSelectingSuggestion.current = false
      return
    }

    const timer = setTimeout(async () => {
      if (query.trim() && query.trim().length >= 1) {
        try {
          const results = await commonApi.getSearchSuggestions(query.trim())
          setSuggestions(results)
          setShowSuggestions(true)
        } catch (err) {
          console.error('获取建议失败:', err)
        }
      } else {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // URL 参数变化时搜索
  useEffect(() => {
    // 同步 URL 参数到状态
    setQuery(q)
    setSelectedAuthor(authorId || '')
    setSelectedLibrary(libraryId || '')
    setSelectedFormats(formats)
    
    // 执行搜索
    doSearch()
  }, [searchParams])

  const doSearch = async () => {
    // 允许空搜索词，如果有筛选条件的话
    const hasFilters = authorId || libraryId || formats.length > 0
    
    if (!q.trim() && !hasFilters) {
      setBooks([])
      setTotal(0)
      setTotalPages(0)
      return
    }

    try {
      setLoading(true)
      setError('')
      
      const params: any = {
        q: q,
        page: page,
        limit: PAGE_SIZE
      }
      
      if (authorId) params.author_id = authorId
      if (libraryId) params.library_id = libraryId
      if (formats.length > 0) params.formats = formats.join(',')
      
      const response = await api.get<SearchResponse>('/api/search', { params })
      
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
      
      setBooks(bookSummaries)
      setTotal(response.data.total)
      setTotalPages(response.data.total_pages)
      
      // 只有在有搜索词时才保存历史
      if (q.trim()) {
        saveSearchHistory(q)
      }
    } catch (err) {
      console.error('搜索失败:', err)
      setError('搜索失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const saveSearchHistory = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    
    let history = [...searchHistory]
    // 移除重复项
    history = history.filter((item) => item !== trimmed)
    // 添加到开头
    history.unshift(trimmed)
    // 限制数量
    history = history.slice(0, 10)
    
    setSearchHistory(history)
    localStorage.setItem('search_history', JSON.stringify(history))
  }

  const clearSearchHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('search_history')
  }

  const updateSearchParams = (newParams: any) => {
    // 过滤掉空值
    const params: any = {}
    if (newParams.q) params.q = newParams.q
    if (newParams.page && newParams.page > 1) params.page = newParams.page.toString()
    if (newParams.author_id) params.author_id = newParams.author_id.toString()
    if (newParams.library_id) params.library_id = newParams.library_id.toString()
    if (newParams.formats && newParams.formats.length > 0) params.formats = newParams.formats.join(',')
    
    setSearchParams(params)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setShowSuggestions(false)
    // 搜索时重置页码为 1
    updateSearchParams({
      q: query.trim(),
      page: 1,
      author_id: selectedAuthor,
      library_id: selectedLibrary,
      formats: selectedFormats
    })
  }

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    isSelectingSuggestion.current = true
    setQuery(suggestion.text)
    setShowSuggestions(false)
    
    // 如果是作者，自动设置作者筛选
    if (suggestion.type === 'author') {
      updateSearchParams({
        q: '', // 清空搜索词，直接用作者筛选
        page: 1,
        author_id: suggestion.id,
        library_id: selectedLibrary,
        formats: selectedFormats
      })
      setSelectedAuthor(suggestion.id)
      setQuery('') // UI上也清空
    } else {
      // 书籍搜索
      updateSearchParams({
        q: suggestion.text,
        page: 1,
        author_id: selectedAuthor,
        library_id: selectedLibrary,
        formats: selectedFormats
      })
    }
  }
  
  const handlePageChange = (newPage: number) => {
    updateSearchParams({
      q,
      page: newPage,
      author_id: authorId,
      library_id: libraryId,
      formats: formats
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery)
    updateSearchParams({
      q: historyQuery,
      page: 1,
      // 保持当前筛选器？或者是重置？通常点击历史是新的搜索，重置筛选器比较合理
      // 但如果用户想在当前筛选下搜索历史词，那就不应该重置
      // 这里选择重置筛选器，因为历史记录通常代表一个完整的搜索意图
    })
  }

  const handleResetFilters = () => {
    setSelectedAuthor('')
    setSelectedLibrary('')
    setSelectedFormats([])
    
    updateSearchParams({
      q: query,
      page: 1
    })
  }

  const hasActiveFilters = selectedAuthor || selectedLibrary || selectedFormats.length > 0

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
        搜索
      </Typography>

      {/* 搜索框 */}
      <ClickAwayListener onClickAway={() => setShowSuggestions(false)}>
        <Box sx={{ position: 'relative', mb: 2 }}>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              placeholder="搜索书名或作者..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true)
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
                endAdornment: query && (
                  <InputAdornment position="end">
                    <Clear
                      sx={{ cursor: 'pointer' }}
                      onClick={() => {
                        setQuery('')
                        setSuggestions([])
                        setShowSuggestions(false)
                        // 如果没有筛选器，也清除搜索结果
                        if (!hasActiveFilters) {
                          setBooks([])
                          setTotal(0)
                          setSearchParams({})
                        } else {
                          // 有筛选器时，只清除搜索词并重新搜索
                          updateSearchParams({
                            q: '',
                            page: 1,
                            author_id: selectedAuthor,
                            library_id: selectedLibrary,
                            formats: selectedFormats
                          })
                        }
                      }}
                    />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          
          {/* 搜索建议下拉列表 */}
          {showSuggestions && suggestions.length > 0 && (
            <Paper
              elevation={3}
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 10,
                mt: 0.5,
                maxHeight: 300,
                overflow: 'auto'
              }}
            >
              <List disablePadding>
                {suggestions.map((suggestion) => (
                  <ListItem key={`${suggestion.type}-${suggestion.id}`} disablePadding>
                    <ListItemButton onClick={() => handleSuggestionClick(suggestion)}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {suggestion.type === 'author' ? <Person fontSize="small" /> : <BookIcon fontSize="small" />}
                      </ListItemIcon>
                      <ListItemText 
                        primary={suggestion.text} 
                        secondary={suggestion.type === 'author' ? '作者' : '书籍'}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      </ClickAwayListener>

      {/* 高级筛选 */}
      <Accordion sx={{ mb: 3, boxShadow: 1 }} defaultExpanded={!!hasActiveFilters}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterList color="action" />
            <Typography>高级筛选</Typography>
            {hasActiveFilters && (
              <Chip 
                label="已应用筛选" 
                size="small" 
                color="primary" 
                variant="outlined" 
                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} 
              />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {/* 作者筛选 - 使用 Autocomplete 支持搜索 */}
            <Grid item xs={12} sm={6} md={3}>
              <Autocomplete
                size="small"
                options={authors}
                getOptionLabel={(option) => `${option.name} (${option.book_count})`}
                value={authors.find(a => a.id === selectedAuthor) || null}
                onChange={(_, newValue) => setSelectedAuthor(newValue?.id || '')}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="作者"
                    placeholder="输入关键词搜索作者..."
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.book_count} 本
                      </Typography>
                    </Box>
                  </li>
                )}
                noOptionsText="未找到匹配的作者"
                clearText="清除"
                openText="展开"
                closeText="收起"
                filterOptions={(options, { inputValue }) => {
                  const filterValue = inputValue.toLowerCase()
                  return options.filter(option => 
                    option.name.toLowerCase().includes(filterValue)
                  )
                }}
              />
            </Grid>
            
            {/* 书库筛选 */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>书库</InputLabel>
                <Select
                  value={selectedLibrary}
                  label="书库"
                  onChange={(e) => setSelectedLibrary(e.target.value as number | '')}
                >
                  <MenuItem value="">
                    <em>全部书库</em>
                  </MenuItem>
                  {libraries.map((lib) => (
                    <MenuItem key={lib.id} value={lib.id}>
                      {lib.name} ({lib.book_count})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* 格式筛选 */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>文件格式</InputLabel>
                <Select
                  multiple
                  value={selectedFormats}
                  onChange={(e) => {
                    const value = e.target.value
                    setSelectedFormats(typeof value === 'string' ? value.split(',') : value)
                  }}
                  input={<OutlinedInput label="文件格式" />}
                  renderValue={(selected) => selected.join(', ')}
                >
                  {FORMATS.map((format) => (
                    <MenuItem key={format} value={format}>
                      <Checkbox checked={selectedFormats.indexOf(format) > -1} />
                      <ListItemText primary={format.toUpperCase()} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* 操作按钮 */}
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ display: 'flex', gap: 1, height: '100%' }}>
                <Button 
                  variant="contained" 
                  fullWidth 
                  onClick={handleSubmit}
                  startIcon={<Search />}
                >
                  应用筛选
                </Button>
                {hasActiveFilters && (
                  <Button 
                    variant="outlined" 
                    color="inherit"
                    onClick={handleResetFilters}
                  >
                    重置
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
          
          {/* 已选筛选标签 */}
          {hasActiveFilters && (
            <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedAuthor && (
                <Chip 
                  label={`作者: ${authors.find(a => a.id === selectedAuthor)?.name || selectedAuthor}`}
                  onDelete={() => setSelectedAuthor('')}
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              )}
              {selectedLibrary && (
                <Chip 
                  label={`书库: ${libraries.find(l => l.id === selectedLibrary)?.name || selectedLibrary}`}
                  onDelete={() => setSelectedLibrary('')}
                  color="info"
                  variant="outlined"
                  size="small"
                />
              )}
              {selectedFormats.map(format => (
                <Chip
                  key={format}
                  label={`格式: ${format}`}
                  onDelete={() => setSelectedFormats(prev => prev.filter(f => f !== format))}
                  color="secondary"
                  variant="outlined"
                  size="small"
                />
              ))}
            </Box>
          )}
        </AccordionDetails>
      </Accordion>

      {/* 搜索历史 */}
      {!q && !hasActiveFilters && searchHistory.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              搜索历史
            </Typography>
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer' }}
              onClick={clearSearchHistory}
            >
              清除
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {searchHistory.map((item, index) => (
              <Chip
                key={index}
                label={item}
                size="small"
                onClick={() => handleHistoryClick(item)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>
      )}

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
      ) : (q || hasActiveFilters) && books.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary" variant="h6">
            未找到相关书籍
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            尝试使用不同的关键词或减少筛选条件
          </Typography>
        </Box>
      ) : books.length > 0 ? (
        <>
          {/* 结果统计 */}
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              找到 {total} 本相关书籍
            </Typography>
          </Box>

          {/* 搜索结果 */}
          <Grid container spacing={2}>
            {books.map((book) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={book.id}>
                <BookCard book={book} />
              </Grid>
            ))}
          </Grid>
          
          {/* 分页 */}
          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
            <Pagination
              totalPages={totalPages}
              page={page}
              onPageChange={handlePageChange}
            />
          </Box>
        </>
      ) : !q && !hasActiveFilters ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Search sx={{ fontSize: 64, color: 'grey.500', mb: 2 }} />
          <Typography color="text.secondary">
            输入关键词或使用筛选器查找书籍
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}
