import { createRouter, createWebHistory } from 'vue-router'
import Login from './pages/Login.vue'
import AgentDashboard from './pages/AgentDashboard.vue'
import AdminDashboard from './pages/AdminDashboard.vue'
import { useAuthStore } from './stores/auth'
import Settings from './pages/Settings.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Login },
    { path: '/agent', component: AgentDashboard },
    { path: '/admin', component: AdminDashboard },
    { path: '/settings', component: Settings } // <= ICI
  ]
})
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Login },
    { path: '/agent', component: AgentDashboard },
    { path: '/admin', component: AdminDashboard }
  ]
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()
  if (!auth.me && to.path !== '/') {
    await auth.fetchMe().catch(() => {})
    if (!auth.me) return next('/')
  }
  next()
})
