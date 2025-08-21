<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <header class="shadow bg-white">
      <div class="container flex items-center justify-between py-3">
        <h1 class="font-semibold">Mandate Manager</h1>
          <nav v-if="me" style="display:flex;gap:10px;align-items:center">
            <a class="btn" style="background:#64748b" href="/agent" v-if="me.role==='AGENT'">Agent</a>
            <a class="btn" style="background:#64748b" href="/admin" v-if="me.role==='ADMIN'">Admin</a>
            <a class="btn" style="background:#334155" href="/settings">Paramètres</a>
            <button class="btn" @click="logout">Déconnexion</button>
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

const router = useRouter()
const auth = useAuthStore()
const { me } = storeToRefs(auth) // ✅ réactif

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>
