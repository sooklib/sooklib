import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, BottomNavigation, BottomNavigationAction, useMediaQuery, useTheme } from '@mui/material'
import { Home, LibraryBooks, Person, Search } from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'

const MainLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const user = useAuthStore((state) => state.user)
  const { serverName, loadServerSettings } = useSettingsStore()

  // 加载服务器设置
  useEffect(() => {
    loadServerSettings()
  }, [loadServerSettings])

  const getNavValue = () => {
    if (location.pathname.startsWith('/home')) return 0
    if (location.pathname.startsWith('/library')) return 1
    if (location.pathname.startsWith('/profile')) return 2
    return 0
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top AppBar */}
      <AppBar position="fixed" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Typography
            variant="h6"
            noWrap
            sx={{
              flexGrow: 1,
              cursor: 'pointer',
              color: 'text.primary',  // 确保文字颜色跟随主题
              maxWidth: isMobile ? '60vw' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            onClick={() => navigate('/home')}
          >
            📚 {serverName}
          </Typography>
          
          <IconButton onClick={() => navigate('/search')} sx={{ color: 'text.primary' }}>
            <Search />
          </IconButton>
          
          <IconButton onClick={() => navigate('/profile')}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, pt: 8, pb: isMobile ? 7 : 2 }}>
        <Outlet />
      </Box>

      {/* Bottom Navigation (Mobile) */}
      {isMobile && (
        <BottomNavigation
          value={getNavValue()}
          onChange={(_, newValue) => {
            switch (newValue) {
              case 0:
                navigate('/home')
                break
              case 1:
                navigate('/library')
                break
              case 2:
                navigate('/profile')
                break
            }
          }}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <BottomNavigationAction label="首页" icon={<Home />} />
          <BottomNavigationAction label="书库" icon={<LibraryBooks />} />
          <BottomNavigationAction label="我的" icon={<Person />} />
        </BottomNavigation>
      )}
    </Box>
  )
}

export default MainLayout
