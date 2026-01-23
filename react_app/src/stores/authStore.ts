import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

interface User {
  id: number
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  email?: string
  isAdmin: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (username: string, password: string) => {
        const response = await api.post('/api/auth/login', {
          username,
          password,
        })
        const { access_token, user } = response.data

        set({
          token: access_token,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name ?? null,
            avatarUrl: user.avatar_url ?? null,
            email: user.email,
            isAdmin: user.is_admin,
          },
          isAuthenticated: true,
          isLoading: false,
        })
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      },

      checkAuth: async () => {
        const { token } = get()
        if (!token) {
          set({ isLoading: false })
          return
        }

        try {
          const response = await api.get('/api/auth/me')
          const user = response.data
          set({
            user: {
              id: user.id,
              username: user.username,
              displayName: user.display_name ?? null,
              avatarUrl: user.avatar_url ?? null,
              email: user.email,
              isAdmin: user.is_admin,
            },
            isAuthenticated: true,
            isLoading: false,
          })
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
