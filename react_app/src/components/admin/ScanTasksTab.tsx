import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Stack,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Box,
  Tooltip,
} from '@mui/material'
import { Refresh, Stop } from '@mui/icons-material'
import api from '../../services/api'

interface ScanTask {
  id: number
  library_id: number
  library_name: string
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

interface ScanStats {
  total_tasks: number
  by_status: Record<string, number>
  totals: {
    added_books: number
    skipped_books: number
    errors: number
  }
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
]

const LIMIT_OPTIONS = [20, 50, 100, 200]

const statusColorMap: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function ScanTasksTab() {
  const [tasks, setTasks] = useState<ScanTask[]>([])
  const [stats, setStats] = useState<ScanStats | null>(null)
  const [status, setStatus] = useState('ALL')
  const [limit, setLimit] = useState(50)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    const response = await api.get<ScanStats>('/api/admin/scan-tasks/stats')
    setStats(response.data)
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<ScanTask[]>('/api/admin/scan-tasks', {
        params: {
          status: status === 'ALL' ? undefined : status,
          limit,
        },
      })
      setTasks(response.data || [])
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '加载扫描任务失败')
    } finally {
      setLoading(false)
    }
  }, [limit, status])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchTasks()])
  }, [fetchStats, fetchTasks])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(fetchAll, 5000)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchAll])

  const handleCancel = useCallback(async (taskId: number) => {
    try {
      await api.post(`/api/admin/scan-tasks/${taskId}/cancel`)
      fetchAll()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '取消任务失败')
    }
  }, [fetchAll])

  const totalsLabel = useMemo(() => {
    if (!stats) return ''
    return `累计新增 ${stats.totals.added_books} 本 · 跳过 ${stats.totals.skipped_books} 本 · 错误 ${stats.totals.errors} 本`
  }, [stats])

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="scan-task-status-label">状态</InputLabel>
              <Select
                labelId="scan-task-status-label"
                label="状态"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="scan-task-limit-label">显示数量</InputLabel>
              <Select
                labelId="scan-task-limit-label"
                label="显示数量"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                {LIMIT_OPTIONS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value} 条
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={fetchAll}
              disabled={loading}
            >
              刷新
            </Button>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
              }
              label="自动刷新（5s）"
            />
          </Stack>
          {stats && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Chip label={`任务总数 ${stats.total_tasks}`} variant="outlined" />
              {Object.entries(stats.by_status).map(([key, value]) => (
                <Chip
                  key={key}
                  label={`${STATUS_OPTIONS.find((item) => item.value === key)?.label || key} ${value}`}
                  color={statusColorMap[key] || 'default'}
                  variant="outlined"
                />
              ))}
              {totalsLabel && (
                <Typography variant="body2" color="text.secondary">
                  {totalsLabel}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
          扫描任务
        </Typography>
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>书库</TableCell>
                <TableCell>状态</TableCell>
                <TableCell sx={{ minWidth: 160 }}>进度</TableCell>
                <TableCell align="right">已处理/总数</TableCell>
                <TableCell align="right">新增</TableCell>
                <TableCell align="right">跳过</TableCell>
                <TableCell align="right">错误</TableCell>
                <TableCell>创建时间</TableCell>
                <TableCell>开始时间</TableCell>
                <TableCell>完成时间</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12}>
                    <Typography color="text.secondary">暂无扫描任务</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => (
                  <TableRow key={task.id} hover>
                    <TableCell>{task.id}</TableCell>
                    <TableCell>{task.library_name}</TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_OPTIONS.find((item) => item.value === task.status)?.label || task.status}
                        size="small"
                        color={statusColorMap[task.status] || 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(Math.max(task.progress || 0, 0), 100)}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {task.progress || 0}%
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      {task.processed_files}/{task.total_files}
                    </TableCell>
                    <TableCell align="right">{task.added_books}</TableCell>
                    <TableCell align="right">{task.skipped_books}</TableCell>
                    <TableCell align="right">
                      {task.error_count}
                      {task.error_message && (
                        <Tooltip title={task.error_message} placement="top">
                          <Box component="span" sx={{ ml: 0.5, color: 'error.main', fontWeight: 'bold' }}>!</Box>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(task.created_at)}</TableCell>
                    <TableCell>{formatDate(task.started_at)}</TableCell>
                    <TableCell>{formatDate(task.completed_at)}</TableCell>
                    <TableCell align="center">
                      {(task.status === 'running' || task.status === 'pending') ? (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<Stop />}
                          onClick={() => handleCancel(task.id)}
                        >
                          取消
                        </Button>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  )
}
