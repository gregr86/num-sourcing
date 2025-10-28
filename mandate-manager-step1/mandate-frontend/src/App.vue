<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container flex h-16 items-center justify-between">
        <div class="flex items-center gap-2">
          <FileText class="h-6 w-6 text-primary" />
          <h1 class="text-xl font-bold">Mandate Manager</h1>
        </div>

        <nav v-if="me" class="flex items-center gap-2">
          <RouterLink 
            v-if="me?.role === 'AGENT'"
            to="/agent"
          >
            <Button variant="ghost">
              <User class="mr-2 h-4 w-4" />
              Agent
            </Button>
          </RouterLink>
          
          <RouterLink 
            v-if="me?.role === 'ADMIN'"
            to="/admin"
          >
            <Button variant="ghost">
              <Shield class="mr-2 h-4 w-4" />
              Admin
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
import { onMounted } from 'vue'
import { FileText, User, Shield, Settings, LogOut } from 'lucide-vue-next'
import Button from './components/ui/button.vue'

const router = useRouter()
const auth = useAuthStore()
const { me } = storeToRefs(auth)

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