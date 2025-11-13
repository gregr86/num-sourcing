// mandate-frontend/src/router-updates.ts
// Modifications à apporter au router existant

import ResetPassword from './pages/ResetPassword.vue'
import AdminNewsletters from './pages/AdminNewsletters.vue'
import AgentNewsletters from './pages/AgentNewsletters.vue'

// Ajouter ces routes dans le tableau routes:

{
  path: '/reset-password',
  component: ResetPassword,
  name: 'reset-password'
},
{
  path: '/admin/newsletters',
  component: AdminNewsletters,
  name: 'admin-newsletters',
  meta: { requiresAuth: true, allowedRoles: ['ADMIN'] }
},
{
  path: '/newsletters',
  component: AgentNewsletters,
  name: 'agent-newsletters',
  meta: { requiresAuth: true, allowedRoles: ['AGENT', 'ADMIN'] }
}