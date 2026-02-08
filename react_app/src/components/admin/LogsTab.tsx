import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Stack,
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
} from '@mui/material'
import { Refresh, Download, Description } from '@mui/icons-material'
import api from '../../services/api'

interface LogResponse {
  lines: string[]
  total: number
  size: number
  updated_at?: string | null
  path?: string | null
}

const LEVEL_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'DEBUG', label: 'DEBUG' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARNING', label: 'WARNING' },
  { value: 'ERROR', label: 'ERROR' },
]

const LIMIT_OPTIONS = [50, 200, 500, 1000, 2000]

const levelColorMap: Record<string, 'default' | 'info' | 'warning' | 'error' | 'success'> = {
  DEBUG: 'default',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success',
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${sizes[i]}`
}

function parseLine(line: string) {
  const match = line.match(/^(.+?) \|\s*(\w+)/)
  const timestamp = match?.[1]?.trim()
  const level = match?.[2]?.trim().toUpperCase()
  return { timestamp, level, raw: line }
}

export default function LogsTab() {
  const [lines, setLines] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [size, setSize] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [level, setLevel] = useState('ALL')
  const [limit, setLimit] = useState(200)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<LogResponse>('/api/admin/logs', {
        params: {
          limit,
          level: level === 'ALL' ? undefined : level,
          keyword: keyword.trim() || undefined,
        },
      })
      setLines(response.data.lines || [])
      setTotal(response.data.total || 0)
      setSize(response.data.size || 0)
      setUpdatedAt(response.data.updated_at || null)
      setPath(response.data.path || null)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '加载日志失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, level, limit])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(fetchLogs, 5000)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchLogs])

  const parsedLines = useMemo(() => lines.map(parseLine), [lines])

  const handleDownload = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/logs/download', { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sooklib-log-${new Date().toISOString().slice(0, 10)}.log`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '下载日志失败')
    }
  }, [])

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <TextField
              size="small"
              fullWidth
              label="关键词"
              placeholder="按关键字过滤，例如 error / scan / book"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchLogs()
              }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="log-level-label">级别</InputLabel>
              <Select
                labelId="log-level-label"
                label="级别"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {LEVEL_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="log-limit-label">显示行数</InputLabel>
              <Select
                labelId="log-limit-label"
                label="显示行数"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                {LIMIT_OPTIONS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value} 行
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={fetchLogs}
              disabled={loading}
            >
              刷新
            </Button>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={handleDownload}
            >
              下载日志
            </Button>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
              }
              label="自动刷新（5s）"
            />
            <Typography variant="body2" color="text.secondary">
              当前显示 {lines.length} 行 / 过滤结果 {total} 行
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Description fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {path || '日志文件'} · {formatBytes(size)}
                {updatedAt ? ` · ${updatedAt}` : ''}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
          日志内容
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace',
            fontSize: 12.5,
            lineHeight: 1.6,
            maxHeight: 520,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {parsedLines.length === 0 ? (
            <Typography color="text.secondary">暂无日志记录</Typography>
          ) : (
            parsedLines.map((item, index) => (
              <Stack key={`${item.raw}-${index}`} direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.5 }}>
                {item.level ? (
                  <Chip
                    size="small"
                    label={item.level}
                    color={levelColorMap[item.level] || 'default'}
                    variant="outlined"
                  />
                ) : (
                  <Box sx={{ width: 66 }} />
                )}
                <Box>
                  {item.timestamp && (
                    <Typography component="span" color="text.secondary" sx={{ mr: 1 }}>
                      {item.timestamp}
                    </Typography>
                  )}
                  <Typography component="span">{item.raw}</Typography>
                </Box>
              </Stack>
            ))
          )}
        </Box>
      </Paper>
    </Stack>
  )
}
