import { defineStore } from 'pinia'
import { api } from '../utils/api'

export type User = { id: string; email: string; role: 'ADMIN'|'AGENT' }

export const useAuthStore = defineStore('auth', {
  state: () => ({ me: null as User | null }),
  actions: {
    async login(email: string, password: string) {
      await api.post('/auth/login', { email, password })
      await this.fetchMe()
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