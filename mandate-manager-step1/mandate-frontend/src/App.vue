<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container flex h-16 items-center justify-between">
        <div class="flex items-center gap-2">
          <FileText class="h-6 w-6 text-primary" />
          <h1 class="text-xl font-bold">Mandate Manager</h1>
        </div>

        <nav v-if="me" class="flex items-center gap-2">
          <Button
            v-if="me?.role === 'AGENT'"
            variant="ghost"
            as-child
          >
            <RouterLink to="/agent">
              <User class="mr-2 h-4 w-4" />
              Agent
            </RouterLink>
          </Button>
          
          <Button
            v-if="me?.role === 'ADMIN'"
            variant="ghost"
            as-child
          >
            <RouterLink to="/admin">
              <Shield class="mr-2 h-4 w-4" />
              Admin
            </RouterLink>
          </Button>
          
          <Button
            variant="ghost"
            as-child
          >
            <RouterLink to="/settings">
              <Settings class="mr-2 h-4 w-4" />
              Paramètres
            </RouterLink>
          </Button>
          
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

onMounted(() => {
  if (!me.value) auth.fetchMe().catch(() => {})
})

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>