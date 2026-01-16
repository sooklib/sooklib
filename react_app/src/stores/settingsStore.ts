import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CoverSize = 'small' | 'medium' | 'large'
export type PaginationMode = 'traditional' | 'infinite'

interface SettingsState {
  // 封面尺寸设置
  coverSize: CoverSize
  setCoverSize: (size: CoverSize) => void
  
  // 分页模式设置
  paginationMode: PaginationMode
  setPaginationMode: (mode: PaginationMode) => void
  
  // 获取封面尺寸的像素值
  getCoverWidth: () => number
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
      
      setCoverSize: (size) => set({ coverSize: size }),
      setPaginationMode: (mode) => set({ paginationMode: mode }),
      
      getCoverWidth: () => COVER_SIZE_MAP[get().coverSize],
    }),
    {
      name: 'app-settings',
    }
  )
)
