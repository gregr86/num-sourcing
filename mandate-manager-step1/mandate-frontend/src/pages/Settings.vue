<template>
  <div class="card" style="max-width:620px">
    <h2>Paramètres du compte</h2>

    <h3 style="margin-top:14px">Modifier l'email</h3>
    <form @submit.prevent="updateEmail" style="display:grid;gap:8px;max-width:460px">
      <label>Nouvel email</label>
      <input v-model="newEmail" type="email" required>
      <label>Mot de passe (confirmation)</label>
      <input v-model="password" type="password" required>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn">Mettre à jour</button>
        <span v-if="msgEmail">{{ msgEmail }}</span>
      </div>
    </form>

    <h3 style="margin-top:20px">Modifier le mot de passe</h3>
    <form @submit.prevent="updatePassword" style="display:grid;gap:8px;max-width:460px">
      <label>Mot de passe actuel</label>
      <input v-model="currentPassword" type="password" required>
      <label>Nouveau mot de passe</label>
      <input v-model="newPassword" type="password" required>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn">Changer le mot de passe</button>
        <span v-if="msgPwd">{{ msgPwd }}</span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../utils/api'
const newEmail = ref(''); const password = ref('')
const currentPassword = ref(''); const newPassword = ref('')
const msgEmail = ref(''); const msgPwd = ref('')
async function updateEmail() {
  msgEmail.value=''; try {
    await api.post('/account/update-email', { newEmail: newEmail.value, password: password.value })
    msgEmail.value='Email mis à jour'
  } catch { msgEmail.value='Erreur (email déjà utilisé ?)' }
}
async function updatePassword() {
  msgPwd.value=''; try {
    await api.post('/account/update-password', { currentPassword: currentPassword.value, newPassword: newPassword.value })
    msgPwd.value='Mot de passe mis à jour'
  } catch { msgPwd.value='Erreur (mot de passe actuel ?)' }
}
</script>
