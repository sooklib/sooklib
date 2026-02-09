import { Box, Typography, Card, CardContent, Avatar, Divider, List, ListItem, ListItemIcon, ListItemText, Chip, Button, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material'
import { Person, Lock, History, Favorite, Logout, TrendingUp, FormatQuote, Settings, Info } from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import PageContainer from '../components/PageContainer'

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation()
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
      setSnackbar({ open: true, message: t('profile.message.password_required'), severity: 'error' })
      return
    }
    if (passwordForm.next.length < 6) {
      setSnackbar({ open: true, message: t('profile.message.password_min'), severity: 'error' })
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setSnackbar({ open: true, message: t('profile.message.password_mismatch'), severity: 'error' })
      return
    }

    try {
      setPasswordSaving(true)
      await api.put('/api/user/password', {
        current_password: passwordForm.current,
        new_password: passwordForm.next,
        confirm_password: passwordForm.confirm
      })
      setSnackbar({ open: true, message: t('profile.message.password_updated'), severity: 'success' })
      handleClosePasswordDialog()
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('profile.message.password_failed')
      setSnackbar({ open: true, message, severity: 'error' })
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <PageContainer>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>
        {t('profile.title')}
      </Typography>

      {/* 用户信息卡片 */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar src={user?.avatarUrl || undefined} sx={{ width: 64, height: 64, bgcolor: 'primary.main' }}>
            <Person sx={{ fontSize: 32 }} />
          </Avatar>
          <Box>
            <Typography variant="h6">{user?.displayName || user?.username || t('profile.user_fallback')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.isAdmin ? t('profile.role_admin') : t('profile.role_user')}
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
            <ListItemText primary={t('profile.change_password')} secondary={t('profile.change_password_desc')} />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/settings')}>
            <ListItemIcon>
              <Settings />
            </ListItemIcon>
            <ListItemText primary={t('profile.settings')} secondary={t('profile.settings_desc')} />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/favorites')}>
            <ListItemIcon>
              <Favorite />
            </ListItemIcon>
            <ListItemText primary={t('profile.favorites')} secondary={t('profile.favorites_desc')} />
            <Chip label={favoriteCount} size="small" color="primary" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/annotations')}>
            <ListItemIcon>
              <FormatQuote />
            </ListItemIcon>
            <ListItemText primary={t('profile.annotations')} secondary={t('profile.annotations_desc')} />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/history')}>
            <ListItemIcon>
              <History />
            </ListItemIcon>
            <ListItemText primary={t('profile.history')} secondary={t('profile.history_desc')} />
            <Chip label={historyCount} size="small" color="secondary" />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/stats')}>
            <ListItemIcon>
              <TrendingUp />
            </ListItemIcon>
            <ListItemText primary={t('profile.stats')} secondary={t('profile.stats_desc')} />
          </ListItem>
          <Divider />
          <ListItem button onClick={() => navigate('/about')}>
            <ListItemIcon>
              <Info />
            </ListItemIcon>
            <ListItemText primary={t('profile.about')} secondary={t('profile.about_desc')} />
          </ListItem>
          <Divider />
          <ListItem button onClick={logout}>
            <ListItemIcon>
              <Logout color="error" />
            </ListItemIcon>
            <ListItemText primary={t('profile.logout')} primaryTypographyProps={{ color: 'error' }} />
          </ListItem>
        </List>
      </Card>

      {/* 修改密码对话框 */}
      <Dialog open={passwordDialogOpen} onClose={handleClosePasswordDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{t('profile.password.title')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('profile.password.current')}
            type="password"
            fullWidth
            margin="dense"
            value={passwordForm.current}
            onChange={(event) => setPasswordForm(prev => ({ ...prev, current: event.target.value }))}
          />
          <TextField
            label={t('profile.password.new')}
            type="password"
            fullWidth
            margin="dense"
            value={passwordForm.next}
            onChange={(event) => setPasswordForm(prev => ({ ...prev, next: event.target.value }))}
            helperText={t('profile.password.min_hint')}
          />
          <TextField
            label={t('profile.password.confirm')}
            type="password"
            fullWidth
            margin="dense"
            value={passwordForm.confirm}
            onChange={(event) => setPasswordForm(prev => ({ ...prev, confirm: event.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePasswordDialog} disabled={passwordSaving}>{t('common.cancel')}</Button>
          <Button onClick={handlePasswordSubmit} variant="contained" disabled={passwordSaving}>
            {passwordSaving ? t('common.saving') : t('common.save')}
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
    </PageContainer>
  )
}
