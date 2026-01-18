import { Box, Typography, Card, CardContent, Avatar, Divider, List, ListItem, ListItemIcon, ListItemText, ToggleButtonGroup, ToggleButton, Chip, Button, IconButton, CircularProgress, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Grid, Paper } from '@mui/material'
import { Person, Lock, History, Favorite, DarkMode, LightMode, SettingsBrightness, Logout, PhotoSizeSelectLarge, ViewList, AllInclusive, Palette, Image, Check, Telegram, Link, LinkOff, ContentCopy, CheckCircle, TrendingUp, Notes, Bookmark, FormatQuote, MenuBook } from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore, PRESET_COLORS } from '../stores/themeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { extractDominantColor } from '../utils/colorUtils'

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const { preference, setPreference, primaryColor, setPrimaryColor } = useThemeStore()
  const { coverSize, setCoverSize, paginationMode, setPaginationMode } = useSettingsStore()
  const navigate = useNavigate()
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 批注统计状态
  const [annotationStats, setAnnotationStats] = useState<{
    total_annotations: number
    by_type: Record<string, number>
    by_color: Record<string, number>
    books_with_annotations: number
  } | null>(null)
  const [recentAnnotations, setRecentAnnotations] = useState<Array<{
    id: number
    book_id: number
    chapter_title: string | null
    selected_text: string
    note: string | null
    annotation_type: string
    color: string
    updated_at: string
  }>>([])
  const [annotationsLoading, setAnnotationsLoading] = useState(true)

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

  // 获取批注统计和最近批注
  useEffect(() => {
    const fetchAnnotations = async () => {
      try {
        setAnnotationsLoading(true)
        const [statsRes, recentRes] = await Promise.all([
          api.get('/api/annotations/my/stats'),
          api.get('/api/annotations/my/recent', { params: { limit: 5 } })
        ])
        setAnnotationStats(statsRes.data)
        setRecentAnnotations(recentRes.data)
      } catch (error) {
        console.error('获取批注数据失败:', error)
      } finally {
        setAnnotationsLoading(false)
      }
    }
    fetchAnnotations()
  }, [])

  // 获取 Telegram 绑定状态
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

  // 生成绑定码
  const handleGenerateBindCode = async () => {
    try {
      setBindCodeLoading(true)
      const res = await api.post('/api/user/telegram/bind-code')
      setBindCode(res.data.bind_code)
      setBindDialogOpen(true)
    } catch (error: unknown) {
      console.error('生成绑定码失败:', error)
      setSnackbar({ open: true, message: '生成绑定码失败', severity: 'error' })
    } finally {
      setBindCodeLoading(false)
    }
  }

  // 解绑 Telegram
  const handleUnbindTelegram = async () => {
    if (!window.confirm('确定要解除 Telegram 绑定吗？')) return
    
    try {
      setUnbindLoading(true)
      await api.delete('/api/user/telegram/unbind')
      setTelegramStatus(prev => prev ? { ...prev, is_bound: false, telegram_id: null } : null)
      setSnackbar({ open: true, message: '已解除 Telegram 绑定', severity: 'success' })
    } catch (error: unknown) {
      console.error('解绑失败:', error)
      setSnackbar({ open: true, message: '解绑失败', severity: 'error' })
    } finally {
      setUnbindLoading(false)
    }
  }

  // 复制绑定码
  const handleCopyBindCode = () => {
    if (bindCode) {
      navigator.clipboard.writeText(`/bind ${bindCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 从图片提取颜色
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
      // 清空 input 以便可以再次选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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

      {/* 显示设置卡片 */}
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
          
          <Divider sx={{ my: 2 }} />
          
          {/* 主题色设置 */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <Palette sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="body1">主题色</Typography>
            </Box>
            
            {/* 预设颜色选择 */}
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
                    <Check sx={{ color: 'white', fontSize: 20 }} />
                  )}
                </IconButton>
              ))}
            </Box>
            
            {/* 从图片提取颜色 */}
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
            
            {/* 当前颜色预览 */}
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.5, gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                当前主题色:
              </Typography>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  bgcolor: primaryColor,
                  borderRadius: '50%',
                  border: '1px solid rgba(0,0,0,0.2)',
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {primaryColor}
              </Typography>
            </Box>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          {/* 封面尺寸设置 */}
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
              <ToggleButton value="small">
                小
              </ToggleButton>
              <ToggleButton value="medium">
                中
              </ToggleButton>
              <ToggleButton value="large">
                大
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          {/* 分页模式设置 */}
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
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              传统分页：底部显示页码导航；无限滚动：滚动到底部自动加载更多
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Telegram 绑定卡片 */}
      <Card sx={{ mb: 3 }}>
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
                <Chip 
                  label={`ID: ${telegramStatus.telegram_id}`} 
                  size="small" 
                  variant="outlined"
                />
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

      {/* 批注统计卡片 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Notes sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">我的批注</Typography>
          </Box>
          
          {annotationsLoading ? (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">加载中...</Typography>
            </Box>
          ) : annotationStats && annotationStats.total_annotations > 0 ? (
            <>
              {/* 统计卡片 */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary.main" fontWeight="bold">
                      {annotationStats.total_annotations}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      总批注数
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main" fontWeight="bold">
                      {annotationStats.by_type?.highlight || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      高亮
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="info.main" fontWeight="bold">
                      {annotationStats.by_type?.note || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      笔记
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="secondary.main" fontWeight="bold">
                      {annotationStats.books_with_annotations}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      有批注的书籍
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
              
              {/* 颜色分布 */}
              {annotationStats.by_color && Object.keys(annotationStats.by_color).length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    颜色分布
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {Object.entries(annotationStats.by_color).map(([color, count]) => (
                      <Chip
                        key={color}
                        label={`${count}`}
                        size="small"
                        sx={{
                          bgcolor: color === 'yellow' ? '#FFF9C4' :
                                   color === 'green' ? '#C8E6C9' :
                                   color === 'blue' ? '#BBDEFB' :
                                   color === 'red' ? '#FFCDD2' :
                                   color === 'purple' ? '#E1BEE7' : 'grey.300',
                          color: 'text.primary'
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
              
              {/* 最近批注 */}
              {recentAnnotations.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    最近批注
                  </Typography>
                  <List disablePadding>
                    {recentAnnotations.map((annotation) => (
                      <ListItem
                        key={annotation.id}
                        button
                        onClick={() => navigate(`/book/${annotation.book_id}`)}
                        sx={{
                          borderLeft: 3,
                          borderColor: annotation.color === 'yellow' ? '#FFC107' :
                                       annotation.color === 'green' ? '#4CAF50' :
                                       annotation.color === 'blue' ? '#2196F3' :
                                       annotation.color === 'red' ? '#F44336' :
                                       annotation.color === 'purple' ? '#9C27B0' : 'grey.400',
                          mb: 1,
                          bgcolor: 'action.hover',
                          borderRadius: 1
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {annotation.annotation_type === 'note' ? (
                            <Notes fontSize="small" />
                          ) : (
                            <FormatQuote fontSize="small" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" noWrap sx={{ fontStyle: 'italic' }}>
                              "{annotation.selected_text}"
                            </Typography>
                          }
                          secondary={
                            <>
                              {annotation.note && (
                                <Typography variant="caption" component="span" display="block" noWrap>
                                  📝 {annotation.note}
                                </Typography>
                              )}
                              {annotation.chapter_title && (
                                <Typography variant="caption" color="text.secondary">
                                  {annotation.chapter_title}
                                </Typography>
                              )}
                            </>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <FormatQuote sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                暂无批注记录
              </Typography>
              <Typography variant="caption" color="text.secondary">
                在阅读时选中文本可以创建高亮和笔记
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 账户设置卡片 */}
      <Card>
        <List>
          <ListItem button>
            <ListItemIcon>
              <Lock />
            </ListItemIcon>
            <ListItemText primary="修改密码" secondary="更改账户密码" />
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

      {/* 绑定码对话框 */}
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
