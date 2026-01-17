import axios from 'axios'
import { Author, LibrarySummary, Annotation, AnnotationCreate, AnnotationUpdate, AnnotationExport, AnnotationStats } from '../types'

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：添加 token
api.interceptors.request.use(
  (config) => {
    // 直接从 localStorage 获取 token，避免循环依赖
    try {
      const storage = localStorage.getItem('auth-storage')
      if (storage) {
        const parsed = JSON.parse(storage)
        const token = parsed.state?.token
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
    } catch (e) {
      console.error('Error reading token from localStorage', e)
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
      // 清除本地存储并跳转登录，避免循环依赖导入 store
      localStorage.removeItem('auth-storage')
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

export interface SearchSuggestion {
  text: string
  type: 'book' | 'author'
  id: number
}

export const annotationsApi = {
  // 创建批注
  create: async (data: AnnotationCreate): Promise<Annotation> => {
    const response = await api.post('/api/annotations', data)
    return response.data
  },

  // 获取书籍所有批注
  getBookAnnotations: async (bookId: number, chapterIndex?: number, annotationType?: string): Promise<Annotation[]> => {
    const params: any = {}
    if (chapterIndex !== undefined) params.chapter_index = chapterIndex
    if (annotationType) params.annotation_type = annotationType
    
    const response = await api.get(`/api/annotations/book/${bookId}`, { params })
    return response.data
  },

  // 获取特定章节批注
  getChapterAnnotations: async (bookId: number, chapterIndex: number): Promise<Annotation[]> => {
    const response = await api.get(`/api/annotations/book/${bookId}/chapter/${chapterIndex}`)
    return response.data
  },

  // 获取单个批注
  get: async (id: number): Promise<Annotation> => {
    const response = await api.get(`/api/annotations/${id}`)
    return response.data
  },

  // 更新批注
  update: async (id: number, data: AnnotationUpdate): Promise<Annotation> => {
    const response = await api.put(`/api/annotations/${id}`, data)
    return response.data
  },

  // 删除批注
  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/annotations/${id}`)
  },

  // 导出批注
  export: async (bookId: number): Promise<AnnotationExport> => {
    const response = await api.get(`/api/annotations/book/${bookId}/export`)
    return response.data
  },
  
  // 获取统计
  getStats: async (): Promise<AnnotationStats> => {
    const response = await api.get('/api/annotations/my/stats')
    return response.data
  },

  // 获取最近批注
  getRecent: async (limit: number = 20): Promise<Annotation[]> => {
    const response = await api.get('/api/annotations/my/recent', { params: { limit } })
    return response.data
  }
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
  },

  getSearchSuggestions: async (q: string): Promise<SearchSuggestion[]> => {
    const response = await api.get('/api/search/suggestions', { params: { q } })
    return response.data
  }
}

export default api
