import { Box, Typography, Card, CardContent, Avatar, Divider, List, ListItem, ListItemIcon, ListItemText, ToggleButtonGroup, ToggleButton } from '@mui/material'
import { Person, Lock, History, Favorite, DarkMode, LightMode, SettingsBrightness, Logout } from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const { preference, setPreference } = useThemeStore()

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

      {/* 设置列表 */}
      <Card>
        <List>
          {/* 主题设置 */}
          <ListItem sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 1.5 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <SettingsBrightness />
              </ListItemIcon>
              <ListItemText primary="主题设置" secondary="选择应用的显示主题" />
            </Box>
            <ToggleButtonGroup
              value={preference}
              exclusive
              onChange={(_, value) => value && setPreference(value)}
              fullWidth
              size="small"
              sx={{ ml: 5 }}
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
          </ListItem>
          <Divider />
          <ListItem button>
            <ListItemIcon>
              <Lock />
            </ListItemIcon>
            <ListItemText primary="修改密码" secondary="更改账户密码" />
          </ListItem>
          <Divider />
          <ListItem button>
            <ListItemIcon>
              <Favorite />
            </ListItemIcon>
            <ListItemText primary="我的收藏" secondary="查看收藏的书籍" />
          </ListItem>
          <Divider />
          <ListItem button>
            <ListItemIcon>
              <History />
            </ListItemIcon>
            <ListItemText primary="阅读历史" secondary="查看阅读记录" />
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
