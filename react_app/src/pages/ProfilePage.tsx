import { Box, Typography, Card, CardContent, Avatar, Divider, List, ListItem, ListItemIcon, ListItemText, Chip, Button, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material'
import { Person, Lock, History, Favorite, Logout, TrendingUp, FormatQuote, Settings } from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  })

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: ''
  })

  // 获取统计数据
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 获取收藏数量
        const favRes = await api.get('/api/user/favorites')
        setFavoriteCount(favRes.data.length || 0)

        // 获取历史记录数量  
        const histRes = await api.get('/api/user/reading-history', { params: { limit: 1 } })
        setHistoryCount(histRes.data.total || 0)
      } catch (error) {
        console.error('获取统计数据失败:', error)
      }
    }
    fetchStats()
  }, [])

  const handleOpenPasswordDialog = () => {
    setPasswordDialogOpen(true)
  }

  const handleClosePasswordDialog = () => {
    setPasswordDialogOpen(false)
    setPasswordForm({ current: '', next: '', confirm: '' })
  }

  const handlePasswordSubmit = async () => {
    if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
      setSnackbar({ open: true, message: '请填写完整的密码信息', severity: 'error' })
      return
    }
    if (passwordForm.next.length < 6) {
      setSnackbar({ open: true, message: '新密码长度至少为 6 位', severity: 'error' })
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setSnackbar({ open: true, message: '两次输入的新密码不一致', severity: 'error' })
      return
    }

    try {
      setPasswordSaving(true)
      await api.put('/api/user/password', {
        current_password: passwordForm.current,
        new_password: passwordForm.next,
        confirm_password: passwordForm.confirm
      })
      setSnackbar({ open: true, message: '密码已更新', severity: 'success' })
      handleClosePasswordDialog()
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '修改密码失败'
      setSnackbar({ open: true, message, severity: 'error' })
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>
        个人中心
      </Typography>

      {/* 用户信息卡片 */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main' }}>
            <Person sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography variant="h6">{user?.username || '用户'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.isAdmin ? '管理员' : '普通用户'}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 账户设置卡片 */}
      <Card>
        <List>
          <ListItem button onClick={handleOpenPasswordDialog}>
            <ListItemIcon>
              <Lock />
            </ListItemIcon>
            <ListItemText primary="修改密码" secondary="更改账户密码" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/settings')}>
            <ListItemIcon>
              <Settings />
            </ListItemIcon>
            <ListItemText primary="用户设置" secondary="显示设置与 Telegram 绑定" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/favorites')}>
            <ListItemIcon>
              <Favorite />
            </ListItemIcon>
            <ListItemText primary="我的收藏" secondary="查看收藏的书籍" />
            <Chip label={favoriteCount} size="small" color="primary" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/annotations')}>
            <ListItemIcon>
              <FormatQuote />
            </ListItemIcon>
            <ListItemText primary="批注管理" secondary="查看与管理我的批注" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/history')}>
            <ListItemIcon>
              <History />
            </ListItemIcon>
            <ListItemText primary="阅读历史" secondary="查看阅读记录" />
            <Chip label={historyCount} size="small" color="secondary" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/stats')}>
            <ListItemIcon>
              <TrendingUp />
            </ListItemIcon>
            <ListItemText primary="阅读统计" secondary="查看阅读时长和习惯分析" />
          </ListItem>
          <Divider />
          <ListItem button onClick={logout}>
            <ListItemIcon>
              <Logout color="error" />
            </ListItemIcon>
            <ListItemText primary="退出登录" primaryTypographyProps={{ color: 'error' }} />
          </ListItem>
        </List>
      </Card>

      {/* 修改密码对话框 */}
      <Dialog open={passwordDialogOpen} onClose={handleClosePasswordDialog} maxWidth="xs" fullWidth>
        <DialogTitle>修改密码</DialogTitle>
        <DialogContent>
          <TextField
            label="当前密码"
            type="password"
            fullWidth
            margin="dense"
            value={passwordForm.current}
            onChange={(event) => setPasswordForm(prev => ({ ...prev, current: event.target.value }))}
          />
          <TextField
            label="新密码"
            type="password"
            fullWidth
            margin="dense"
            value={passwordForm.next}
            onChange={(event) => setPasswordForm(prev => ({ ...prev, next: event.target.value }))}
            helperText="至少 6 位"
          />
          <TextField
            label="确认新密码"
            type="password"
            fullWidth
            margin="dense"
            value={passwordForm.confirm}
            onChange={(event) => setPasswordForm(prev => ({ ...prev, confirm: event.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePasswordDialog} disabled={passwordSaving}>取消</Button>
          <Button onClick={handlePasswordSubmit} variant="contained" disabled={passwordSaving}>
            {passwordSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar 提示 */}
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
    </Box>
  )
}
