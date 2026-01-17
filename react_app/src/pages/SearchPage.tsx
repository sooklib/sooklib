import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Typography, TextField, InputAdornment, Grid,
  CircularProgress, Alert, Chip
} from '@mui/material'
import { Search, Clear } from '@mui/icons-material'
import api from '../services/api'
import { BookSummary } from '../types'
import BookCard from '../components/BookCard'
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

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [query, setQuery] = useState(searchParams.get('q') || '')
  
  // 设置页面标题
  useDocumentTitle(query ? `搜索: ${query}` : '搜索')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [books, setBooks] = useState<BookSummary[]>([])
  const [total, setTotal] = useState(0)
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  // 加载搜索历史
  useEffect(() => {
    const history = localStorage.getItem('search_history')
    if (history) {
      setSearchHistory(JSON.parse(history))
    }
  }, [])

  // URL 参数变化时搜索
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setQuery(q)
      doSearch(q)
    }
  }, [searchParams])

  const doSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setBooks([])
      setTotal(0)
      return
    }

    try {
      setLoading(true)
      setError('')
      
      const response = await api.get<SearchResponse>('/api/search', {
        params: { q: searchQuery, limit: 100 }
      })
      
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
      
      // 保存搜索历史
      saveSearchHistory(searchQuery)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setSearchParams({ q: query.trim() })
    }
  }

  const handleHistoryClick = (q: string) => {
    setQuery(q)
    setSearchParams({ q })
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
        搜索
      </Typography>

      {/* 搜索框 */}
      <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="搜索书名或作者..."
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
                  onClick={() => {
                    setQuery('')
                    setBooks([])
                    setTotal(0)
                    setSearchParams({})
                  }}
                />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* 搜索历史 */}
      {!query && searchHistory.length > 0 && (
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
      ) : query && books.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">
            未找到 "{query}" 相关的书籍
          </Typography>
        </Box>
      ) : books.length > 0 ? (
        <>
          {/* 结果统计 */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            找到 {total} 本相关书籍
          </Typography>

          {/* 搜索结果 */}
          <Grid container spacing={2}>
            {books.map((book) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={book.id}>
                <BookCard book={book} />
              </Grid>
            ))}
          </Grid>
        </>
      ) : !query ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Search sx={{ fontSize: 64, color: 'grey.500', mb: 2 }} />
          <Typography color="text.secondary">
            输入关键词搜索书籍
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}
