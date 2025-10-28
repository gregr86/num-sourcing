<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-3xl font-bold tracking-tight">Paramètres</h2>
      <p class="text-muted-foreground">
        Gérez les paramètres de votre compte
      </p>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- Modifier l'email -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Mail class="h-5 w-5" />
            Modifier l'email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="updateEmail" class="space-y-4">
            <div class="space-y-2">
              <Label for="new-email">Nouvel email</Label>
              <Input
                id="new-email"
                v-model="newEmail"
                type="email"
                placeholder="nouveau@email.com"
                required
              />
            </div>
            
            <div class="space-y-2">
              <Label for="email-password">Mot de passe (confirmation)</Label>
              <Input
                id="email-password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>

            <div class="space-y-2">
              <Button type="submit" class="w-full">
                <Save class="mr-2 h-4 w-4" />
                Mettre à jour l'email
              </Button>
              <p v-if="msgEmail" :class="msgEmail.includes('Erreur') ? 'text-destructive' : 'text-green-600'" class="text-sm">
                {{ msgEmail }}
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <!-- Modifier le mot de passe -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Lock class="h-5 w-5" />
            Modifier le mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="updatePassword" class="space-y-4">
            <div class="space-y-2">
              <Label for="current-password">Mot de passe actuel</Label>
              <Input
                id="current-password"
                v-model="currentPassword"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>
            
            <div class="space-y-2">
              <Label for="new-password">Nouveau mot de passe</Label>
              <Input
                id="new-password"
                v-model="newPassword"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>

            <div class="space-y-2">
              <Button type="submit" class="w-full">
                <Key class="mr-2 h-4 w-4" />
                Changer le mot de passe
              </Button>
              <p v-if="msgPwd" :class="msgPwd.includes('Erreur') ? 'text-destructive' : 'text-green-600'" class="text-sm">
                {{ msgPwd }}
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../utils/api'
import { Mail, Lock, Key, Save } from 'lucide-vue-next'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'
import Input from '../components/ui/input.vue'
import Label from '../components/ui/label.vue'
import Button from '../components/ui/button.vue'

const newEmail = ref('')
const password = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const msgEmail = ref('')
const msgPwd = ref('')

async function updateEmail() {
  msgEmail.value = ''
  try {
    await api.post('/account/update-email', {
      newEmail: newEmail.value,
      password: password.value
    })
    msgEmail.value = 'Email mis à jour avec succès'
    newEmail.value = ''
    password.value = ''
  } catch {
    msgEmail.value = 'Erreur (email déjà utilisé ou mot de passe incorrect)'
  }
}

async function updatePassword() {
  msgPwd.value = ''
  try {
    await api.post('/account/update-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    })
    msgPwd.value = 'Mot de passe mis à jour avec succès'
    currentPassword.value = ''
    newPassword.value = ''
  } catch {
    msgPwd.value = 'Erreur (mot de passe actuel incorrect)'
  }
}
</script>