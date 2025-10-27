import { createRouter, createWebHistory } from 'vue-router'
import Login from './pages/Login.vue'
import AgentDashboard from './pages/AgentDashboard.vue'
import AdminDashboard from './pages/AdminDashboard.vue'
import Settings from './pages/Settings.vue'
import { useAuthStore } from './stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Login, name: 'login' },
    { path: '/agent', component: AgentDashboard, name: 'agent', meta: { requiresAuth: true, role: 'AGENT' } },
    { path: '/admin', component: AdminDashboard, name: 'admin', meta: { requiresAuth: true, role: 'ADMIN' } },
    { path: '/settings', component: Settings, name: 'settings', meta: { requiresAuth: true } }
  ]
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()
  
  // Si la route nécessite une authentification
  if (to.meta.requiresAuth && !auth.me) {
    try {
      await auth.fetchMe()
    } catch {
      return next({ name: 'login' })
    }
    
    if (!auth.me) {
      return next({ name: 'login' })
    }
    
    // Vérifier le rôle si nécessaire
    if (to.meta.role && auth.me.role !== to.meta.role) {
      // Rediriger vers le dashboard approprié
      return next({ name: auth.me.role === 'ADMIN' ? 'admin' : 'agent' })
    }
  }
  
  // Si déjà connecté et va sur la page de login, rediriger
  if (to.name === 'login' && auth.me) {
    return next({ name: auth.me.role === 'ADMIN' ? 'admin' : 'agent' })
  }
  
  next()
})

export default router
