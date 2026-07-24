import { create } from 'zustand'
import apiClient from '@/api/client'

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  loading: false,

  login: async (username, password) => {
    set({ loading: true })
    try {
      const response = await apiClient.post('/auth/login', { username, password })
      const { access_token, user } = response.data
      localStorage.setItem('access_token', access_token)
      set({ user, token: access_token, isAuthenticated: true, loading: false })
    } catch {
      set({ loading: false })
      throw new Error('用户名或密码错误')
    }
  },

  register: async (username, email, password, role) => {
    set({ loading: true })
    try {
      const response = await apiClient.post('/auth/register', {
        username,
        email,
        password,
        role,
        name: username,
      })
      const { access_token, user } = response.data
      localStorage.setItem('access_token', access_token)
      set({ user, token: access_token, isAuthenticated: true, loading: false })
    } catch {
      set({ loading: false })
      throw new Error('注册失败')
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    set({ user: null, token: null, isAuthenticated: false })
  },

  fetchUser: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    try {
      const response = await apiClient.get('/auth/me')
      set({ user: response.data, isAuthenticated: true })
    } catch {
      localStorage.removeItem('access_token')
      set({ user: null, token: null, isAuthenticated: false })
    }
  },
}))
