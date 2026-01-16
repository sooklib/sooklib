import { Box, Typography, Card, CardContent, Avatar, Divider, List, ListItem, ListItemIcon, ListItemText, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material'
import { Person, Lock, History, Favorite, DarkMode, LightMode, SettingsBrightness, Logout, PhotoSizeSelectLarge, ViewList, AllInclusive } from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const { preference, setPreference } = useThemeStore()
  const { coverSize, setCoverSize, paginationMode, setPaginationMode } = useSettingsStore()
  const navigate = useNavigate()
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)

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
          
          {/* 主题设置 */}
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
          <ListItem button onClick={logout}>
            <ListItemIcon>
              <Logout color="error" />
            </ListItemIcon>
            <ListItemText primary="退出登录" primaryTypographyProps={{ color: 'error' }} />
          </ListItem>
        </List>
      </Card>
    </Box>
  )
}
