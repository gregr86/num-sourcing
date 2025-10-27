<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <header class="shadow bg-white">
      <div class="container flex items-center justify-between py-3">
        <h1 class="font-semibold">Mandate Manager</h1>

        <!-- ✅ liens SPA + état réactif -->
        <nav v-if="me" style="display:flex;gap:10px;align-items:center">
          <RouterLink class="btn" style="background:#64748b" to="/agent" v-if="me?.role==='AGENT'">Agent</RouterLink>
          <RouterLink class="btn" style="background:#64748b" to="/admin" v-if="me?.role==='ADMIN'">Admin</RouterLink>
          <RouterLink class="btn" style="background:#334155" to="/settings">Paramètres</RouterLink>
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
import { onMounted } from 'vue'

const router = useRouter()
const auth = useAuthStore()
const { me } = storeToRefs(auth) // ✅ reste réactif dans le template

// ✅ au cas d’un hard refresh, on recharge le profil pour réafficher les boutons
onMounted(() => {
  if (!me.value) auth.fetchMe().catch(() => {})
})

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>
