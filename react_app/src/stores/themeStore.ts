import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeState {
  preference: ThemePreference  // 用户选择
  mode: 'light' | 'dark'       // 实际应用的主题
  setPreference: (preference: ThemePreference) => void
  initSystemListener: () => () => void  // 返回清理函数
}

// 获取系统主题
const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

// 根据偏好计算实际主题
const resolveMode = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference === 'system') {
    return getSystemTheme()
  }
  return preference
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'system',
      mode: getSystemTheme(),
      
      setPreference: (preference) => {
        set({
          preference,
          mode: resolveMode(preference),
        })
      },
      
      // 初始化系统主题监听
      initSystemListener: () => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        
        const handler = (e: MediaQueryListEvent) => {
          const { preference } = get()
          if (preference === 'system') {
            set({ mode: e.matches ? 'dark' : 'light' })
          }
        }
        
        mediaQuery.addEventListener('change', handler)
        
        // 返回清理函数
        return () => mediaQuery.removeEventListener('change', handler)
      },
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        // 恢复存储后重新计算 mode
        if (state) {
          state.mode = resolveMode(state.preference)
        }
      },
    }
  )
)

// 便捷 hook
export const useThemePreference = () => useThemeStore((s) => s.preference)
export const useThemeMode = () => useThemeStore((s) => s.mode)
