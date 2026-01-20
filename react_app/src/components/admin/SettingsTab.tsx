import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  CircularProgress,
  Chip,
  InputAdornment,
  IconButton,
} from '@mui/material'
import { Save, Telegram, Visibility, VisibilityOff, CheckCircle, Error, Refresh, OpenInNew } from '@mui/icons-material'
import api from '../../services/api'
import { useSettingsStore } from '../../stores/settingsStore'

interface SystemSettings {
  server_name: string
  server_description: string
  welcome_message: string
  registration_enabled: boolean
}

interface TelegramSettings {
  enabled: boolean
  bot_token_configured: boolean
  bot_token_preview: string
  webhook_url: string
  max_file_size: number
}

interface UpdateCheckResult {
  success: boolean
  current_version: string
  channel: string
  latest_version?: string
  update_available?: boolean
  url?: string
  notes?: string
  published_at?: string
  error?: string
  source?: string
}

export default function SettingsTab() {
  const [settings, setSettings] = useState<SystemSettings>({
    server_name: '小说书库',
    server_description: '',
    welcome_message: '',
    registration_enabled: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Telegram 设置
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    enabled: false,
    bot_token_configured: false,
    bot_token_preview: '',
    webhook_url: '',
    max_file_size: 20,
  })
  const [botToken, setBotToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [telegramLoading, setTelegramLoading] = useState(true)
  const [telegramSaving, setTelegramSaving] = useState(false)
  const [telegramSuccess, setTelegramSuccess] = useState(false)
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [updateLoading, setUpdateLoading] = useState(true)
  const [updateError, setUpdateError] = useState<string | null>(null)

  // 获取 settingsStore 用于刷新
  const settingsStore = useSettingsStore()

  useEffect(() => {
    loadSettings()
    loadTelegramSettings()
    loadUpdateInfo()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await api.get<SystemSettings>('/api/settings')
      setSettings(response.data)
    } catch (err: unknown) {
      console.error('加载设置失败:', err)
      setError('加载设置失败')
    } finally {
      setLoading(false)
    }
  }

  const loadTelegramSettings = async () => {
    try {
      setTelegramLoading(true)
      const response = await api.get<TelegramSettings>('/api/admin/telegram')
      setTelegramSettings(response.data)
    } catch (err: unknown) {
      console.error('加载 Telegram 设置失败:', err)
    } finally {
      setTelegramLoading(false)
    }
  }

  const loadUpdateInfo = async () => {
    try {
      setUpdateLoading(true)
      setUpdateError(null)
      const response = await api.get<UpdateCheckResult>('/api/update/check')
      setUpdateInfo(response.data)
      if (!response.data.success) {
        setUpdateError(response.data.error || '更新检查失败')
      }
    } catch (err: unknown) {
      console.error('更新检查失败:', err)
      setUpdateError('更新检查失败')
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleOpenUpdate = () => {
    const url = updateInfo?.url || updateInfo?.source
    if (url) {
      window.open(url, '_blank')
    }
  }

  const handleSaveTelegram = async () => {
    try {
      setTelegramSaving(true)
      setTelegramError(null)
      setTelegramSuccess(false)
      
      const updateData: Record<string, unknown> = {
        enabled: telegramSettings.enabled,
        webhook_url: telegramSettings.webhook_url,
        max_file_size: telegramSettings.max_file_size,
      }
      
      // 只有输入了新token才更新
      if (botToken.trim()) {
        updateData.bot_token = botToken.trim()
      }
      
      await api.put('/api/admin/telegram', updateData)
      setTelegramSuccess(true)
      setBotToken('')
      loadTelegramSettings()
      
      setTimeout(() => setTelegramSuccess(false), 3000)
    } catch (err: unknown) {
      console.error('保存 Telegram 设置失败:', err)
      setTelegramError('保存 Telegram 设置失败')
    } finally {
      setTelegramSaving(false)
    }
  }

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true)
      setTestResult(null)
      
      const response = await api.post<{ success: boolean; bot_username?: string; bot_name?: string; error?: string }>('/api/admin/telegram/test')
      
      if (response.data.success) {
        setTestResult({
          success: true,
          message: `连接成功！Bot: @${response.data.bot_username} (${response.data.bot_name})`
        })
      } else {
        setTestResult({
          success: false,
          message: response.data.error || '连接失败'
        })
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: '测试连接失败'
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(false)
      
      await api.put('/api/admin/settings', settings)
      setSuccess(true)
      
      // 重置 serverSettingsLoaded 以便刷新全局设置
      useSettingsStore.setState({ serverSettingsLoaded: false })
      settingsStore.loadServerSettings()
      
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      console.error('保存设置失败:', err)
      setError('保存设置失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6">版本与更新</Typography>
            <Button
              size="small"
              startIcon={updateLoading ? <CircularProgress size={16} /> : <Refresh />}
              onClick={loadUpdateInfo}
              disabled={updateLoading}
            >
              {updateLoading ? '检查中...' : '检查更新'}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            当前版本与更新通道信息
          </Typography>
          {updateError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {updateError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2">
              当前版本：{updateInfo?.current_version || '未知'}
            </Typography>
            <Typography variant="body2">
              更新通道：{updateInfo?.channel || 'beta'}
            </Typography>
            <Typography variant="body2">
              最新版本：{updateInfo?.latest_version || '未知'}
            </Typography>
            {updateInfo?.update_available && (
              <Alert
                severity="info"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<OpenInNew />}
                    onClick={handleOpenUpdate}
                  >
                    查看
                  </Button>
                }
              >
                检测到新版本可用
              </Alert>
            )}
            {updateInfo?.notes && (
              <Typography variant="body2" color="text.secondary">
                更新说明：{updateInfo.notes}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          设置保存成功！
        </Alert>
      )}
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            基本设置
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            配置服务器的基本信息，这些信息将显示在界面上
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              label="服务器名称"
              value={settings.server_name}
              onChange={(e) => setSettings({ ...settings, server_name: e.target.value })}
              helperText="显示在顶部导航栏和登录页面"
              fullWidth
            />

            <TextField
              label="服务器描述"
              value={settings.server_description}
              onChange={(e) => setSettings({ ...settings, server_description: e.target.value })}
              helperText="简短描述您的书库（可选）"
              fullWidth
            />

            <TextField
              label="欢迎消息"
              value={settings.welcome_message}
              onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })}
              helperText="登录后显示的欢迎消息（可选）"
              multiline
              rows={3}
              fullWidth
            />
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            用户注册
          </Typography>
          
          <FormControlLabel
            control={
              <Switch
                checked={settings.registration_enabled}
                onChange={(e) => setSettings({ ...settings, registration_enabled: e.target.checked })}
              />
            }
            label="允许新用户注册"
          />
          <Typography variant="body2" color="text.secondary">
            关闭后，只有管理员可以创建新用户
          </Typography>
        </CardContent>
      </Card>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 4 }}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <Save />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存设置'}
        </Button>
      </Box>

      {/* Telegram Bot 设置 */}
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4 }}>
        <Telegram color="primary" />
        Telegram Bot 设置
      </Typography>

      {telegramSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Telegram 设置保存成功！
        </Alert>
      )}
      
      {telegramError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {telegramError}
        </Alert>
      )}

      {telegramLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">
                  Bot 配置
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {telegramSettings.bot_token_configured ? (
                    <Chip 
                      icon={<CheckCircle />} 
                      label="已配置" 
                      color="success" 
                      size="small" 
                    />
                  ) : (
                    <Chip 
                      icon={<Error />} 
                      label="未配置" 
                      color="warning" 
                      size="small" 
                    />
                  )}
                </Box>
              </Box>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                配置 Telegram Bot 以启用消息推送和文件下载功能。从 @BotFather 获取 Bot Token。
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={telegramSettings.enabled}
                      onChange={(e) => setTelegramSettings({ ...telegramSettings, enabled: e.target.checked })}
                    />
                  }
                  label="启用 Telegram Bot"
                />

                {telegramSettings.bot_token_configured && telegramSettings.bot_token_preview && (
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    当前 Token: {telegramSettings.bot_token_preview}
                  </Alert>
                )}

                <TextField
                  label="Bot Token"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={telegramSettings.bot_token_configured ? '输入新 Token 以更新' : '例如: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
                  type={showToken ? 'text' : 'password'}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowToken(!showToken)} edge="end">
                          {showToken ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  helperText="从 Telegram @BotFather 获取"
                />

                <TextField
                  label="Webhook URL（可选）"
                  value={telegramSettings.webhook_url}
                  onChange={(e) => setTelegramSettings({ ...telegramSettings, webhook_url: e.target.value })}
                  placeholder="https://your-domain.com/webhook/telegram"
                  fullWidth
                  helperText="留空则使用轮询模式"
                />

                <TextField
                  label="最大文件大小 (MB)"
                  type="number"
                  value={telegramSettings.max_file_size}
                  onChange={(e) => setTelegramSettings({ ...telegramSettings, max_file_size: parseInt(e.target.value) || 20 })}
                  fullWidth
                  helperText="Telegram 限制最大 20MB"
                  inputProps={{ min: 1, max: 50 }}
                />
              </Box>

              {testResult && (
                <Alert 
                  severity={testResult.success ? 'success' : 'error'} 
                  sx={{ mt: 2 }}
                >
                  {testResult.message}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <Button
                  variant="outlined"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !telegramSettings.bot_token_configured}
                  startIcon={testingConnection ? <CircularProgress size={20} /> : <Telegram />}
                >
                  {testingConnection ? '测试中...' : '测试连接'}
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSaveTelegram}
                  disabled={telegramSaving}
                  startIcon={telegramSaving ? <CircularProgress size={20} color="inherit" /> : <Save />}
                >
                  {telegramSaving ? '保存中...' : '保存 Telegram 设置'}
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                使用说明
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <ol style={{ paddingLeft: '1.2rem', margin: 0 }}>
                  <li>在 Telegram 中搜索 @BotFather</li>
                  <li>发送 /newbot 创建新 Bot</li>
                  <li>按提示设置 Bot 名称和用户名</li>
                  <li>获取 Bot Token 并粘贴到上方</li>
                  <li>用户在个人中心获取绑定码</li>
                  <li>在 Telegram 发送 /bind 绑定码 完成绑定</li>
                </ol>
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  支持的命令：
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Chip label="/search" size="small" variant="outlined" />
                  <Chip label="/recent" size="small" variant="outlined" />
                  <Chip label="/library" size="small" variant="outlined" />
                  <Chip label="/download" size="small" variant="outlined" />
                  <Chip label="/progress" size="small" variant="outlined" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  )
}
