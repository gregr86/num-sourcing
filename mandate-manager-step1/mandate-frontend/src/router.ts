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
    { 
      path: '/agent', 
      component: AgentDashboard, 
      name: 'agent', 
      meta: { requiresAuth: true, allowedRoles: ['AGENT'] } 
    },
    { 
      path: '/admin', 
      component: AdminDashboard, 
      name: 'admin', 
      meta: { requiresAuth: true, allowedRoles: ['ADMIN'] } 
    },
    { 
      path: '/settings', 
      component: Settings, 
      name: 'settings', 
      meta: { requiresAuth: true, allowedRoles: ['AGENT', 'ADMIN'] } 
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()
  
  console.log('🔄 Navigation:', from.path, '→', to.path)
  console.log('👤 User actuel:', auth.me)
  console.log('🔑 Rôle actuel:', auth.me?.role)
  
  // Si on va vers la page de login et qu'on est déjà connecté
  if (to.name === 'login' && auth.me) {
    const redirectRoute = auth.me.role === 'ADMIN' ? '/admin' : '/agent'
    console.log('🔄 Déjà connecté, redirect vers', redirectRoute)
    return next(redirectRoute)
  }
  
  // Si la route nécessite une authentification
  if (to.meta.requiresAuth) {
    // Essayer de récupérer l'utilisateur si pas encore chargé
    if (!auth.me) {
      try {
        console.log('📡 Tentative de récupération du user...')
        await auth.fetchMe()
        console.log('✅ User récupéré:', auth.me)
      } catch (error) {
        console.error('❌ Erreur fetchMe:', error)
        console.log('⛔ Redirection vers login')
        return next({ name: 'login' })
      }
    }
    
    // Si toujours pas d'utilisateur, rediriger vers login
    if (!auth.me) {
      console.log('⛔ Pas de user, redirect login')
      return next({ name: 'login' })
    }
    
    // Vérifier si l'utilisateur a le bon rôle
    const allowedRoles = to.meta.allowedRoles as string[] | undefined
    if (allowedRoles && !allowedRoles.includes(auth.me.role)) {
      console.log('⛔ Rôle non autorisé:', auth.me.role, '- Rôles autorisés:', allowedRoles)
      // Rediriger vers le dashboard approprié selon le rôle
      const redirectRoute = auth.me.role === 'ADMIN' ? '/admin' : '/agent'
      console.log('🔄 Redirection vers:', redirectRoute)
      return next(redirectRoute)
    }
    
    console.log('✅ Accès autorisé pour', auth.me.role, 'vers', to.path)
  }
  
  next()
})

export default router