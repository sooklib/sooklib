import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, BottomNavigation, BottomNavigationAction, Link, useMediaQuery, useTheme } from '@mui/material'
import { Home, LibraryBooks, Person, Search } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'

const MainLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const user = useAuthStore((state) => state.user)
  const { serverName, loadServerSettings } = useSettingsStore()
  const { t } = useTranslation()

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
      <AppBar position="fixed" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', left: 0, right: 0 }}>
        <Toolbar disableGutters sx={{ pl: { xs: 1.5, sm: 2 }, pr: { xs: 0.75, sm: 1 }, gap: 1, justifyContent: 'space-between' }}>
          <Typography
            variant="h6"
            noWrap
            sx={{
              cursor: 'pointer',
              color: 'text.primary',  // 确保文字颜色跟随主题
              flex: 1,
              minWidth: 0,
              maxWidth: isMobile ? '60vw' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onClick={() => navigate('/home')}
          >
            📚 {serverName}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <IconButton onClick={() => navigate('/search')} sx={{ color: 'text.primary', p: 0.75 }}>
              <Search />
            </IconButton>

            <IconButton onClick={() => navigate('/profile')} sx={{ p: 0.5 }}>
              <Avatar
                src={user?.avatarUrl || undefined}
                sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}
              >
                {(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, pt: 8, pb: isMobile ? 9 : 2 }}>
        <Outlet />
        <Box
          component="footer"
          sx={{
            mt: 4,
            py: 2,
            textAlign: 'center',
            color: 'text.secondary',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {t('footer.design_by')}{' '}
          <Link
            href="https://github.com/sooklib"
            target="_blank"
            rel="noreferrer"
            color="primary"
            underline="hover"
          >
            Sooklib
          </Link>
          {' '} &amp; {' '}
          <Link
            href="https://github.com/Haruka041"
            target="_blank"
            rel="noreferrer"
            color="primary"
            underline="hover"
          >
            Haruka041
          </Link>
        </Box>
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
            zIndex: theme.zIndex.drawer + 2,
          }}
        >
          <BottomNavigationAction label={t('nav.home')} icon={<Home />} />
          <BottomNavigationAction label={t('nav.library')} icon={<LibraryBooks />} />
          <BottomNavigationAction label={t('nav.profile')} icon={<Person />} />
        </BottomNavigation>
      )}
    </Box>
  )
}

export default MainLayout
