import { defineStore } from 'pinia'
import { api } from '../utils/api'

export type User = { 
  id: string
  email: string
  role: 'ADMIN' | 'AGENT'
  firstName?: string | null
  lastName?: string | null
}

export const useAuthStore = defineStore('auth', {
  state: () => ({ me: null as User | null }),
  actions: {
    async login(email: string, password: string) {
      const res = await api.post('/auth/login', { email, password })
      // Stocker directement l'utilisateur retourné par le login
      this.me = res.user
    },
    async fetchMe() {
      const res = await api.get('/auth/me')
      this.me = res.user
    },
    async logout() {
      await api.post('/auth/logout')
      this.me = null
    },
    clear() { this.me = null }
  }
})