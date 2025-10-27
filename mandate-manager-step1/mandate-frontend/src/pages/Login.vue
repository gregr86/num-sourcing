<template>
  <div class="card" style="max-width:420px;margin:40px auto">
    <h2>Connexion</h2>
    <p class="text-sm" style="color:#475569">Entrez vos identifiants</p>
    <form @submit.prevent="onSubmit" style="margin-top:12px">
      <label>Email</label>
      <input v-model="email" type="email" required style="width:100%">
      <label style="margin-top:10px">Mot de passe</label>
      <input v-model="password" type="password" required style="width:100%">
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
        <button class="btn" :disabled="loading">Se connecter</button>
        <span v-if="error" style="color:#dc2626">{{ error }}</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
const router = useRouter()
const auth = useAuthStore()
const email = ref('agent@sourcinginvest.local')
const password = ref('password')
const loading = ref(false)
const error = ref('')
async function onSubmit() {
  error.value = ''; loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(auth.me?.role === 'ADMIN' ? '/admin' : '/agent')
  } catch { error.value = 'Identifiants invalides' }
  finally { loading.value = false }
}
</script>
