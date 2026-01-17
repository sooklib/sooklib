import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { Author, LibrarySummary } from '../types'

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：添加 token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：处理 401 和非 JSON 响应
api.interceptors.response.use(
  (response) => {
    // 检查响应是否为 JSON (避免 API 404 返回 index.html 导致前端崩溃)
    const contentType = response.headers['content-type']
    if (contentType && contentType.includes('text/html') && response.config.url?.startsWith('/api')) {
      console.error('API 返回了 HTML 而不是 JSON，可能是路径错误或服务器配置问题', response.config.url)
      return Promise.reject(new Error('API Response Error: Received HTML instead of JSON'))
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export interface ReadingSessionStartResponse {
  session_id: number
  status: string
}

export interface ReadingSessionHeartbeatResponse {
  status: string
}

export interface ReadingSessionEndResponse {
  status: string
}

export const readingStatsApi = {
  startSession: async (bookId: number): Promise<ReadingSessionStartResponse> => {
    const response = await api.post('/api/stats/session/start', { book_id: bookId })
    return response.data
  },

  sendHeartbeat: async (
    sessionId: number,
    durationSeconds: number,
    progress: number,
    position?: string
  ): Promise<ReadingSessionHeartbeatResponse> => {
    const response = await api.post('/api/stats/session/heartbeat', {
      session_id: sessionId,
      duration_seconds: durationSeconds,
      progress,
      position,
    })
    return response.data
  },

  endSession: async (
    sessionId: number,
    durationSeconds: number,
    progress: number,
    position?: string
  ): Promise<ReadingSessionEndResponse> => {
    const response = await api.post('/api/stats/session/end', {
      session_id: sessionId,
      duration_seconds: durationSeconds,
      progress,
      position,
    })
    return response.data
  },
}

export const commonApi = {
  getAuthors: async (): Promise<Author[]> => {
    const response = await api.get('/api/authors')
    return response.data
  },
  
  getLibraries: async (): Promise<LibrarySummary[]> => {
    const response = await api.get('/api/libraries')
    return response.data
  }
}

export default api
