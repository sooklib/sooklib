import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LibraryPage from './pages/LibraryPage'
import BookDetailPage from './pages/BookDetailPage'
import ReaderPage from './pages/ReaderPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import SearchPage from './pages/SearchPage'

// 需要认证的路由守卫
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      加载中...
    </div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const mode = useThemeStore((state) => state.mode)
  const initSystemListener = useThemeStore((state) => state.initSystemListener)
  const checkAuth = useAuthStore((state) => state.checkAuth)

  // 应用启动时检查认证状态
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // 初始化系统主题监听
  useEffect(() => {
    const cleanup = initSystemListener()
    return cleanup
  }, [initSystemListener])

  const theme = createTheme({
    palette: {
      mode: mode,
      primary: {
        main: '#1976d2',
      },
      secondary: {
        main: '#ff9800',
      },
      background: {
        default: mode === 'dark' ? '#121212' : '#fafafa',
        paper: mode === 'dark' ? '#1e1e1e' : '#ffffff',
      },
    },
    typography: {
      fontFamily: '"Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: mode === 'dark' ? '#333' : '#ccc',
              borderRadius: '4px',
            },
          },
        },
      },
    },
  })

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 需要认证的路由 */}
        <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<DashboardPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/:libraryId" element={<LibraryPage />} />
          <Route path="/book/:id" element={<BookDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/:section" element={<AdminPage />} />
        </Route>

        {/* 阅读器独立路由（无导航栏） */}
        <Route path="/book/:id/reader" element={
          <PrivateRoute>
            <ReaderPage />
          </PrivateRoute>
        } />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </ThemeProvider>
  )
}

export default App
