import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

export type CoverSize = 'small' | 'medium' | 'large'
export type PaginationMode = 'traditional' | 'infinite'

interface SystemSettings {
  server_name: string
  server_description: string
  welcome_message: string
  registration_enabled: boolean
  ratings_enabled?: boolean
  rankings_enabled?: boolean
}

interface SettingsState {
  // 封面尺寸设置
  coverSize: CoverSize
  setCoverSize: (size: CoverSize) => void
  
  // 分页模式设置
  paginationMode: PaginationMode
  setPaginationMode: (mode: PaginationMode) => void
  
  // 获取封面尺寸的像素值
  getCoverWidth: () => number
  
  // 服务器设置（来自后端）
  serverName: string
  serverDescription: string
  welcomeMessage: string
  registrationEnabled: boolean
  ratingsEnabled: boolean
  rankingsEnabled: boolean
  serverSettingsLoaded: boolean
  loadServerSettings: () => Promise<void>
}

// 封面尺寸映射（宽度，按2:3比例）
const COVER_SIZE_MAP: Record<CoverSize, number> = {
  small: 120,   // 120x180
  medium: 160,  // 160x240
  large: 200,   // 200x300
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      coverSize: 'medium',
      paginationMode: 'traditional',  // 默认传统分页
      
      // 服务器设置默认值
      serverName: '小说书库',
      serverDescription: '个人小说管理系统',
      welcomeMessage: '欢迎使用小说书库',
      registrationEnabled: false,
      ratingsEnabled: true,
      rankingsEnabled: true,
      serverSettingsLoaded: false,
      
      setCoverSize: (size) => set({ coverSize: size }),
      setPaginationMode: (mode) => set({ paginationMode: mode }),
      
      getCoverWidth: () => COVER_SIZE_MAP[get().coverSize],
      
      loadServerSettings: async () => {
        // 避免重复加载
        if (get().serverSettingsLoaded) return
        
        try {
          const response = await api.get<SystemSettings>('/api/settings/public')
          const data = response.data
          set({
            serverName: data.server_name || '小说书库',
            serverDescription: data.server_description || '',
            welcomeMessage: data.welcome_message || '',
            registrationEnabled: Boolean(data.registration_enabled),
            ratingsEnabled: data.ratings_enabled ?? true,
            rankingsEnabled: data.rankings_enabled ?? true,
            serverSettingsLoaded: true,
          })
        } catch (error) {
          console.error('加载服务器设置失败:', error)
          // 使用默认值
          set({ serverSettingsLoaded: true })
        }
      },
    }),
    {
      name: 'app-settings',
      partialize: (state) => ({
        // 只持久化用户偏好设置，不持久化服务器设置
        coverSize: state.coverSize,
        paginationMode: state.paginationMode,
      }),
    }
  )
)
