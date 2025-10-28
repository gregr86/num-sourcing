<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container flex h-16 items-center justify-between">
        <div class="flex items-center gap-2">
          <FileText class="h-6 w-6 text-primary" />
          <h1 class="text-xl font-bold">Mandate Manager</h1>
        </div>

        <nav v-if="me" class="flex items-center gap-2">
          <!-- Affichage du nom de l'utilisateur -->
          <div class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
            <User class="h-4 w-4" />
            {{ displayName }}
          </div>
          
          <RouterLink 
            v-if="me?.role === 'AGENT'"
            to="/agent"
          >
            <Button variant="ghost">
              <Briefcase class="mr-2 h-4 w-4" />
              Mes Mandats
            </Button>
          </RouterLink>
          
          <RouterLink 
            v-if="me?.role === 'ADMIN'"
            to="/admin"
          >
            <Button variant="ghost">
              <Shield class="mr-2 h-4 w-4" />
              Administration
            </Button>
          </RouterLink>
          
          <RouterLink to="/settings">
            <Button variant="ghost">
              <Settings class="mr-2 h-4 w-4" />
              Paramètres
            </Button>
          </RouterLink>
          
          <Button variant="outline" @click="logout">
            <LogOut class="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </nav>
      </div>
    </header>

    <main class="container py-6">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from './stores/auth'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { onMounted, computed } from 'vue'
import { FileText, User, Shield, Settings, LogOut, Briefcase } from 'lucide-vue-next'
import Button from './components/ui/button.vue'

const router = useRouter()
const auth = useAuthStore()
const { me } = storeToRefs(auth)

// Computed pour afficher le nom complet ou l'email
const displayName = computed(() => {
  if (!me.value) return ''
  
  const firstName = me.value.firstName?.trim()
  const lastName = me.value.lastName?.trim()
  
  // Si on a prénom ET nom
  if (firstName && lastName) {
    return `${firstName} ${lastName}`
  }
  
  // Si on a seulement le prénom
  if (firstName) {
    return firstName
  }
  
  // Si on a seulement le nom
  if (lastName) {
    return lastName
  }
  
  // Sinon, afficher l'email (partie avant @)
  return me.value.email.split('@')[0]
})

onMounted(async () => {
  if (!me.value) {
    try {
      await auth.fetchMe()
      console.log('👤 User chargé dans App.vue:', me.value)
    } catch (error) {
      console.log('⚠️ Pas de session active dans App.vue')
    }
  } else {
    console.log('👤 User déjà présent:', me.value)
  }
})

async function logout() {
  try {
    await auth.logout()
    console.log('✅ Déconnexion réussie')
    router.push('/')
  } catch (error) {
    console.error('❌ Erreur lors de la déconnexion:', error)
    auth.clear()
    router.push('/')
  }
}
</script>