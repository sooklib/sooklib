import { useState, useEffect, useRef } from 'react'
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip, Alert, CircularProgress,
  Card, CardContent, Grid, Switch, FormControlLabel, Dialog, DialogTitle,
  DialogContent, DialogActions
} from '@mui/material'
import { Backup, Download, Delete, Restore, PlayArrow, Schedule, Upload } from '@mui/icons-material'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

interface BackupInfo {
  backup_id: string
  file_name: string
  file_size: number
  created_at: string
  includes: string[]
  description?: string
}

interface BackupStats {
  total_backups: number
  total_size: number
  latest_backup: string | null
  oldest_backup: string | null
}

interface SchedulerStatus {
  running: boolean
  auto_backup_enabled: boolean
  schedule: string
  next_run: string | null
  last_run: string | null
  last_status: string | null
}

export default function BackupTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [stats, setStats] = useState<BackupStats | null>(null)
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null)
  const [creating, setCreating] = useState(false)
  
  // 上传相关
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 恢复对话框
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null)
  const [restoring, setRestoring] = useState(false)

  const token = useAuthStore(state => state.token)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      
      const [backupsRes, statsRes, schedulerRes] = await Promise.all([
        api.get<{ backups: BackupInfo[] }>('/api/admin/backup/list'),
        api.get<BackupStats>('/api/admin/backup/stats'),
        api.get<SchedulerStatus>('/api/admin/backup/scheduler/status')
      ])
      
      setBackups(backupsRes.data.backups)
      setStats(statsRes.data)
      setScheduler(schedulerRes.data)
    } catch (err) {
      console.error('加载备份数据失败:', err)
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBackup = async () => {
    try {
      setCreating(true)
      setError('')
      await api.post('/api/admin/backup/create', {
        includes: ['database', 'covers', 'config'],
        description: '手动创建'
      })
      setSuccess('备份创建成功')
      loadData()
    } catch (err) {
      console.error('创建备份失败:', err)
      setError('创建备份失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = (backup: BackupInfo) => {
    // 使用 token 进行下载鉴权
    window.open(`/api/admin/backup/download/${backup.backup_id}?token=${token}`, '_blank')
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip')) {
      setError('仅支持 ZIP 格式的备份文件')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploading(true)
      setError('')
      await api.post('/api/admin/backup/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      setSuccess('备份上传成功')
      loadData()
    } catch (err) {
      console.error('上传备份失败:', err)
      setError('上传备份失败')
    } finally {
      setUploading(false)
      // 清空 input，允许重复上传同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (backup: BackupInfo) => {
    if (!confirm(`确定要删除备份 "${backup.backup_id}" 吗？`)) return
    try {
      await api.delete(`/api/admin/backup/${backup.backup_id}`)
      setSuccess('备份已删除')
      loadData()
    } catch (err) {
      console.error('删除备份失败:', err)
      setError('删除失败')
    }
  }

  const handleRestoreClick = (backup: BackupInfo) => {
    setSelectedBackup(backup)
    setRestoreDialogOpen(true)
  }

  const handleRestore = async () => {
    if (!selectedBackup) return
    try {
      setRestoring(true)
      await api.post('/api/admin/backup/restore', {
        backup_id: selectedBackup.backup_id,
        create_snapshot: true
      })
      setSuccess('备份恢复成功，请刷新页面')
      setRestoreDialogOpen(false)
    } catch (err) {
      console.error('恢复备份失败:', err)
      setError('恢复失败')
    } finally {
      setRestoring(false)
    }
  }

  const handleToggleAutoBackup = async (enabled: boolean) => {
    try {
      if (enabled) {
        await api.post('/api/admin/backup/scheduler/enable')
      } else {
        await api.post('/api/admin/backup/scheduler/disable')
      }
      loadData()
    } catch (err) {
      console.error('切换自动备份失败:', err)
      setError('操作失败')
    }
  }

  const handleTriggerBackup = async () => {
    try {
      await api.post('/api/admin/backup/scheduler/trigger')
      setSuccess('备份任务已触发')
      loadData()
    } catch (err) {
      console.error('触发备份失败:', err)
      setError('触发失败')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
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
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* 统计信息和自动备份 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>备份统计</Typography>
              <Box sx={{ display: 'flex', gap: 4 }}>
                <Box>
                  <Typography variant="h4">{stats?.total_backups || 0}</Typography>
                  <Typography variant="body2" color="text.secondary">备份总数</Typography>
                </Box>
                <Box>
                  <Typography variant="h4">{formatSize(stats?.total_size || 0)}</Typography>
                  <Typography variant="body2" color="text.secondary">总大小</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>自动备份</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={scheduler?.auto_backup_enabled || false}
                      onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                    />
                  }
                  label="启用自动备份"
                />
                {scheduler?.auto_backup_enabled && (
                  <Chip
                    icon={<Schedule />}
                    label={`计划: ${scheduler?.schedule || '-'}`}
                    size="small"
                  />
                )}
              </Box>
              {scheduler?.next_run && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  下次执行: {formatDate(scheduler.next_run)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<Backup />}
          onClick={handleCreateBackup}
          disabled={creating || uploading}
        >
          {creating ? '创建中...' : '创建备份'}
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<Upload />}
          onClick={handleUploadClick}
          disabled={creating || uploading}
        >
          {uploading ? '上传中...' : '上传备份'}
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".zip"
          onChange={handleFileChange}
        />
        
        {scheduler?.auto_backup_enabled && (
          <Button
            variant="outlined"
            startIcon={<PlayArrow />}
            onClick={handleTriggerBackup}
          >
            立即执行
          </Button>
        )}
      </Box>

      {/* 备份列表 */}
      <Typography variant="h6" gutterBottom>备份列表</Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>备份ID</TableCell>
              <TableCell>大小</TableCell>
              <TableCell>内容</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {backups.map((backup) => (
              <TableRow key={backup.backup_id}>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {backup.backup_id}
                  </Typography>
                </TableCell>
                <TableCell>{formatSize(backup.file_size)}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {backup.includes.map((item) => (
                      <Chip key={item} label={item} size="small" variant="outlined" />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>{formatDate(backup.created_at)}</TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleDownload(backup)} title="下载">
                    <Download fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleRestoreClick(backup)} title="恢复" color="warning">
                    <Restore fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(backup)} title="删除" color="error">
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {backups.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary">暂无备份</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 恢复确认对话框 */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
        <DialogTitle>确认恢复备份</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            ⚠️ 此操作将覆盖现有数据！系统将在恢复前自动创建快照。
          </Alert>
          <Typography>
            确定要恢复备份 <strong>{selectedBackup?.backup_id}</strong> 吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? '恢复中...' : '确认恢复'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
