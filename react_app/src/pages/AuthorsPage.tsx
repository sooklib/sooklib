import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, Grid, TextField, InputAdornment, CircularProgress, Alert,
  Card, CardContent, CardActionArea, Avatar, Chip, FormControl, InputLabel,
  Select, MenuItem, Pagination as MuiPagination
} from '@mui/material'
import { Search, Person, Clear } from '@mui/icons-material'
import api from '../services/api'
import { Author } from '../types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface AuthorWithBooks extends Author {
  book_count: number
}

const PAGE_SIZE = 48

export default function AuthorsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // URL 参数
  const searchQuery = searchParams.get('q') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const sortBy = searchParams.get('sort') || 'book_count'
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authors, setAuthors] = useState<AuthorWithBooks[]>([])
  const [filteredAuthors, setFilteredAuthors] = useState<AuthorWithBooks[]>([])
  const [query, setQuery] = useState(searchQuery)
  const [totalPages, setTotalPages] = useState(0)
  
  useDocumentTitle(searchQuery ? `作者: ${searchQuery}` : '作者列表')

  useEffect(() => {
    loadAuthors()
  }, [])

  useEffect(() => {
    // 筛选和排序
    let result = [...authors]
    
    // 搜索筛选
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      result = result.filter(author => 
        author.name.toLowerCase().includes(lowerQuery)
      )
    }
    
    // 排序
    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name)
      } else {
        return b.book_count - a.book_count
      }
    })
    
    setFilteredAuthors(result)
    setTotalPages(Math.ceil(result.length / PAGE_SIZE))
  }, [authors, searchQuery, sortBy])

  const loadAuthors = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get<AuthorWithBooks[]>('/api/authors')
      setAuthors(response.data)
    } catch (err) {
      console.error('加载作者列表失败:', err)
      setError('加载失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    setSearchParams(params)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: query, page: '1' })
  }

  const handlePageChange = (_: React.ChangeEvent<unknown>, newPage: number) => {
    updateParams({ page: newPage.toString() })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSortChange = (newSort: string) => {
    updateParams({ sort: newSort, page: '1' })
  }

  const handleAuthorClick = (authorId: number) => {
    navigate(`/search?author_id=${authorId}`)
  }

  const clearSearch = () => {
    setQuery('')
    updateParams({ q: null, page: '1' })
  }

  // 当前页的作者
  const startIndex = (page - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const currentAuthors = filteredAuthors.slice(startIndex, endIndex)

  // 生成作者头像颜色
  const getAvatarColor = (name: string) => {
    const colors = [
      '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
      '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
      '#8bc34a', '#cddc39', '#ffc107', '#ff9800', '#ff5722'
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
        作者列表
      </Typography>

      {/* 搜索和筛选 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box component="form" onSubmit={handleSearch} sx={{ flex: 1, minWidth: 200 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="搜索作者..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
                    onClick={clearSearch}
                  />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>排序</InputLabel>
          <Select
            value={sortBy}
            label="排序"
            onChange={(e) => handleSortChange(e.target.value)}
          >
            <MenuItem value="book_count">按书籍数量</MenuItem>
            <MenuItem value="name">按名称</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* 统计 */}
      <Box sx={{ mb: 2 }}>
        <Chip
          label={`共 ${filteredAuthors.length} 位作者`}
          variant="outlined"
          size="small"
        />
        {searchQuery && (
          <Chip
            label={`搜索: ${searchQuery}`}
            size="small"
            color="primary"
            onDelete={clearSearch}
            sx={{ ml: 1 }}
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
      ) : currentAuthors.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Person sx={{ fontSize: 64, color: 'grey.500', mb: 2 }} />
          <Typography color="text.secondary">
            {searchQuery ? '未找到匹配的作者' : '暂无作者'}
          </Typography>
        </Box>
      ) : (
        <>
          {/* 作者网格 */}
          <Grid container spacing={2}>
            {currentAuthors.map((author) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={author.id}>
                <Card 
                  sx={{ 
                    height: '100%',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 4,
                    }
                  }}
                >
                  <CardActionArea 
                    onClick={() => handleAuthorClick(author.id)}
                    sx={{ height: '100%' }}
                  >
                    <CardContent sx={{ textAlign: 'center', py: 3 }}>
                      <Avatar
                        sx={{
                          width: 64,
                          height: 64,
                          mx: 'auto',
                          mb: 1.5,
                          bgcolor: getAvatarColor(author.name),
                          fontSize: 28,
                        }}
                      >
                        {author.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography 
                        variant="body1" 
                        fontWeight="medium"
                        sx={{ 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mb: 0.5
                        }}
                      >
                        {author.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {author.book_count} 本书
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* 分页 */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <MuiPagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
