import { Box, Typography, Card, CardContent, ToggleButtonGroup, ToggleButton, IconButton, Button, CircularProgress, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Chip, TextField, Avatar } from '@mui/material'
import { SettingsBrightness, LightMode, DarkMode, Palette, Image, PhotoSizeSelectLarge, ViewList, AllInclusive, Telegram, Link, LinkOff, ContentCopy, CheckCircle, PhotoCamera } from '@mui/icons-material'
import { useEffect, useRef, useState } from 'react'
import { useThemeStore, PRESET_COLORS } from '../stores/themeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAuthStore } from '../stores/authStore'
import api from '../services/api'
import { extractDominantColor } from '../utils/colorUtils'

export default function UserSettingsPage() {
  const { preference, setPreference, primaryColor, setPrimaryColor } = useThemeStore()
  const { coverSize, setCoverSize, paginationMode, setPaginationMode } = useSettingsStore()
  const { checkAuth } = useAuthStore()
  const [extracting, setExtracting] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // 个人资料
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Telegram 绑定状态
  const [telegramStatus, setTelegramStatus] = useState<{
    is_bound: boolean
    telegram_id: number | null
    bot_enabled: boolean
  } | null>(null)
  const [telegramLoading, setTelegramLoading] = useState(true)
  const [bindCode, setBindCode] = useState<string | null>(null)
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [bindCodeLoading, setBindCodeLoading] = useState(false)
  const [unbindLoading, setUnbindLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [kindleEmail, setKindleEmail] = useState('')
  const [kindleLoading, setKindleLoading] = useState(true)
  const [kindleSaving, setKindleSaving] = useState(false)
  const [kindleSuccess, setKindleSuccess] = useState(false)
  const [kindleError, setKindleError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTelegramStatus = async () => {
      try {
        setTelegramLoading(true)
        const res = await api.get('/api/user/telegram/status')
        setTelegramStatus(res.data)
      } catch (error) {
        console.error('获取 Telegram 状态失败:', error)
      } finally {
        setTelegramLoading(false)
      }
    }
    fetchTelegramStatus()
  }, [])

  useEffect(() => {
    const fetchUserSettings = async () => {
      try {
        setKindleLoading(true)
        const res = await api.get('/api/user/settings')
        setKindleEmail(res.data?.kindle_email || '')
        setDisplayName(res.data?.display_name || '')
        setAvatarUrl(res.data?.avatar_url || null)
      } catch (error) {
        console.error('获取用户设置失败:', error)
      } finally {
        setKindleLoading(false)
      }
    }
    fetchUserSettings()
  }, [])

  const handleGenerateBindCode = async () => {
    try {
      setBindCodeLoading(true)
      const res = await api.post('/api/user/telegram/bind-code')
      setBindCode(res.data.bind_code)
      setBindDialogOpen(true)
    } catch (error) {
      console.error('生成绑定码失败:', error)
      setSnackbar({ open: true, message: '生成绑定码失败', severity: 'error' })
    } finally {
      setBindCodeLoading(false)
    }
  }

  const handleUnbindTelegram = async () => {
    if (!window.confirm('确定要解除 Telegram 绑定吗？')) return
    try {
      setUnbindLoading(true)
      await api.delete('/api/user/telegram/unbind')
      setTelegramStatus(prev => prev ? { ...prev, is_bound: false, telegram_id: null } : null)
      setSnackbar({ open: true, message: '已解除 Telegram 绑定', severity: 'success' })
    } catch (error) {
      console.error('解绑失败:', error)
      setSnackbar({ open: true, message: '解绑失败', severity: 'error' })
    } finally {
      setUnbindLoading(false)
    }
  }

  const handleCopyBindCode = () => {
    if (bindCode) {
      navigator.clipboard.writeText(`/bind ${bindCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSaveKindleEmail = async () => {
    try {
      setKindleSaving(true)
      setKindleError(null)
      setKindleSuccess(false)
      await api.put('/api/user/settings', {
        kindle_email: kindleEmail.trim() ? kindleEmail.trim() : null,
      })
      setKindleSuccess(true)
      setTimeout(() => setKindleSuccess(false), 3000)
      await checkAuth()
    } catch (error) {
      console.error('保存 Kindle 邮箱失败:', error)
      setKindleError('保存 Kindle 邮箱失败')
    } finally {
      setKindleSaving(false)
    }
  }

  const handleSaveProfile = async () => {
    try {
      setProfileSaving(true)
      await api.put('/api/user/settings', {
        display_name: displayName.trim() ? displayName.trim() : null,
      })
      setSnackbar({ open: true, message: '昵称已更新', severity: 'success' })
      await checkAuth()
    } catch (error) {
      console.error('保存昵称失败:', error)
      setSnackbar({ open: true, message: '保存昵称失败', severity: 'error' })
    } finally {
      setProfileSaving(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setAvatarUploading(true)
      const res = await api.post('/api/user/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAvatarUrl(res.data?.avatar_url || null)
      setSnackbar({ open: true, message: '头像已更新', severity: 'success' })
      await checkAuth()
    } catch (error) {
      console.error('上传头像失败:', error)
      setSnackbar({ open: true, message: '上传头像失败', severity: 'error' })
    } finally {
      setAvatarUploading(false)
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setExtracting(true)
    try {
      const imageUrl = URL.createObjectURL(file)
      const color = await extractDominantColor(imageUrl)
      setPrimaryColor(color)
      URL.revokeObjectURL(imageUrl)
      setSnackbar({ open: true, message: `已提取主题色: ${color}`, severity: 'success' })
    } catch (error) {
      console.error('提取颜色失败:', error)
      setSnackbar({ open: true, message: '提取颜色失败，请尝试其他图片', severity: 'error' })
    } finally {
      setExtracting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>
        用户设置
      </Typography>

      {/* 个人资料 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            个人资料
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Avatar
              src={avatarUrl || undefined}
              sx={{ width: 72, height: 72, bgcolor: 'primary.main' }}
            >
              {(displayName || '用户').charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Button
                variant="outlined"
                startIcon={<PhotoCamera />}
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
              >
                上传头像
              </Button>
              {avatarUploading && <CircularProgress size={18} sx={{ ml: 1 }} />}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                支持 PNG/JPG/WEBP/GIF，最大 2MB
              </Typography>
            </Box>
          </Box>
          <input
            type="file"
            accept="image/*"
            ref={avatarInputRef}
            onChange={handleAvatarUpload}
            style={{ display: 'none' }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="昵称"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              size="small"
              sx={{ minWidth: 240 }}
            />
            <Button variant="contained" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? '保存中...' : '保存昵称'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* 显示设置 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            显示设置
          </Typography>

          {/* 主题模式 */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <SettingsBrightness sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="body1">主题模式</Typography>
            </Box>
            <ToggleButtonGroup
              value={preference}
              exclusive
              onChange={(_, value) => value && setPreference(value)}
              fullWidth
              size="small"
            >
              <ToggleButton value="light">
                <LightMode sx={{ mr: 0.5, fontSize: 18 }} />
                日间
              </ToggleButton>
              <ToggleButton value="dark">
                <DarkMode sx={{ mr: 0.5, fontSize: 18 }} />
                夜间
              </ToggleButton>
              <ToggleButton value="system">
                <SettingsBrightness sx={{ mr: 0.5, fontSize: 18 }} />
                跟随系统
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* 主题色 */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <Palette sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="body1">主题色</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {PRESET_COLORS.map((preset) => (
                <IconButton
                  key={preset.color}
                  onClick={() => setPrimaryColor(preset.color)}
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: preset.color,
                    border: primaryColor === preset.color ? '3px solid' : '1px solid',
                    borderColor: primaryColor === preset.color ? 'white' : 'rgba(0,0,0,0.2)',
                    '&:hover': {
                      bgcolor: preset.color,
                      opacity: 0.9,
                    },
                  }}
                  title={preset.name}
                >
                  {primaryColor === preset.color && (
                    <CheckCircle sx={{ color: 'white', fontSize: 20 }} />
                  )}
                </IconButton>
              ))}
            </Box>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={extracting ? <CircularProgress size={16} /> : <Image />}
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              size="small"
            >
              {extracting ? '提取中...' : '从图片提取颜色'}
            </Button>
          </Box>

          {/* 封面尺寸 */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <PhotoSizeSelectLarge sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="body1">封面尺寸</Typography>
            </Box>
            <ToggleButtonGroup
              value={coverSize}
              exclusive
              onChange={(_, value) => value && setCoverSize(value)}
              fullWidth
              size="small"
            >
              <ToggleButton value="small">小</ToggleButton>
              <ToggleButton value="medium">中</ToggleButton>
              <ToggleButton value="large">大</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* 分页模式 */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <ViewList sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="body1">分页模式</Typography>
            </Box>
            <ToggleButtonGroup
              value={paginationMode}
              exclusive
              onChange={(_, value) => value && setPaginationMode(value)}
              fullWidth
              size="small"
            >
              <ToggleButton value="traditional">
                <ViewList sx={{ mr: 0.5, fontSize: 18 }} />
                传统分页
              </ToggleButton>
              <ToggleButton value="infinite">
                <AllInclusive sx={{ mr: 0.5, fontSize: 18 }} />
                无限滚动
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </CardContent>
      </Card>

      {/* Kindle 邮箱 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Kindle 邮箱
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            用于“发送到 Kindle”功能。建议填写 @kindle.com 或 @free.kindle.com 邮箱。
          </Typography>

          {kindleError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {kindleError}
            </Alert>
          )}

          {kindleSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Kindle 邮箱保存成功
            </Alert>
          )}

          {kindleLoading ? (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">加载中...</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Kindle 邮箱"
                value={kindleEmail}
                onChange={(e) => setKindleEmail(e.target.value)}
                placeholder="yourname@kindle.com"
                fullWidth
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleSaveKindleEmail}
                  disabled={kindleSaving}
                  startIcon={kindleSaving ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {kindleSaving ? '保存中...' : '保存邮箱'}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Telegram 绑定 */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Telegram sx={{ mr: 1, color: '#0088cc' }} />
            <Typography variant="h6">Telegram 绑定</Typography>
          </Box>

          {telegramLoading ? (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">加载中...</Typography>
            </Box>
          ) : !telegramStatus?.bot_enabled ? (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Telegram Bot 未启用，请联系管理员配置
            </Alert>
          ) : telegramStatus?.is_bound ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CheckCircle color="success" />
                <Typography variant="body1">已绑定</Typography>
                <Chip label={`ID: ${telegramStatus.telegram_id}`} size="small" variant="outlined" />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                您可以在 Telegram 中使用 Bot 搜索书籍、下载文件和查看阅读进度。
              </Typography>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={unbindLoading ? <CircularProgress size={16} /> : <LinkOff />}
                onClick={handleUnbindTelegram}
                disabled={unbindLoading}
              >
                {unbindLoading ? '解绑中...' : '解除绑定'}
              </Button>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                绑定 Telegram 后，您可以通过 Bot 搜索书籍、下载文件和查看阅读进度。
              </Typography>
              <Button
                variant="contained"
                startIcon={bindCodeLoading ? <CircularProgress size={16} color="inherit" /> : <Link />}
                onClick={handleGenerateBindCode}
                disabled={bindCodeLoading}
              >
                {bindCodeLoading ? '生成中...' : '获取绑定码'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog open={bindDialogOpen} onClose={() => setBindDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Telegram sx={{ color: '#0088cc' }} />
          Telegram 绑定码
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            请在 Telegram 中向 Bot 发送以下命令完成绑定：
          </Typography>
          <Box
            sx={{
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '1.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <code>/bind {bindCode}</code>
            <IconButton onClick={handleCopyBindCode} size="small">
              {copied ? <CheckCircle color="success" /> : <ContentCopy />}
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            绑定码有效期 5 分钟，过期后需要重新获取。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBindDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

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
