<template>
  <div class="flex min-h-[calc(100vh-5rem)] items-center justify-center">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1">
        <CardTitle class="text-2xl">
          {{ isValidToken ? 'Définir votre mot de passe' : 'Lien invalide' }}
        </CardTitle>
        <p v-if="isValidToken && userInfo" class="text-sm text-muted-foreground">
          Bonjour {{ displayName }}, définissez votre mot de passe pour accéder à votre compte
        </p>
        <p v-else-if="!loading" class="text-sm text-destructive">
          Ce lien de réinitialisation est invalide ou a expiré
        </p>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="flex justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <form v-else-if="isValidToken" @submit.prevent="resetPassword" class="space-y-4">
          <div class="space-y-2">
            <Label for="password">Nouveau mot de passe</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="••••••••"
              required
              minlength="6"
            />
            <p class="text-xs text-muted-foreground">
              Minimum 6 caractères
            </p>
          </div>

          <div class="space-y-2">
            <Label for="confirm">Confirmer le mot de passe</Label>
            <Input
              id="confirm"
              v-model="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          <div v-if="error" class="text-sm text-destructive">
            {{ error }}
          </div>

          <div v-if="success" class="text-sm text-green-600">
            {{ success }}
          </div>

          <Button type="submit" class="w-full" :disabled="submitting || !!success">
            <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
            <Key v-else class="mr-2 h-4 w-4" />
            Définir le mot de passe
          </Button>

          <div v-if="success" class="text-center">
            <Button variant="outline" @click="goToLogin" class="w-full">
              Aller à la page de connexion
            </Button>
          </div>
        </form>

        <div v-else class="space-y-4">
          <p class="text-sm text-muted-foreground">
            Vous pouvez demander un nouveau lien de réinitialisation ou contacter votre administrateur.
          </p>
          <Button variant="outline" @click="goToLogin" class="w-full">
            Retour à la connexion
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../utils/api'
import { Loader2, Key } from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'
import Input from '../components/ui/input.vue'
import Label from '../components/ui/label.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const isValidToken = ref(false)
const userInfo = ref<{ email: string; firstName?: string | null; lastName?: string | null } | null>(null)
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const error = ref('')
const success = ref('')

const displayName = computed(() => {
  if (!userInfo.value) return ''
  const parts = [userInfo.value.firstName, userInfo.value.lastName].filter(Boolean)
  return parts.length ? parts.join(' ') : userInfo.value.email.split('@')[0]
})

async function checkToken() {
  const token = route.query.token as string
  if (!token) {
    loading.value = false
    return
  }

  try {
    const res = await api.get(`/auth/check-reset-token?token=${encodeURIComponent(token)}`)
    isValidToken.value = res.valid
    if (res.valid) {
      userInfo.value = res.user
    }
  } catch (err) {
    console.error('Erreur vérification token:', err)
    isValidToken.value = false
  } finally {
    loading.value = false
  }
}

async function resetPassword() {
  error.value = ''
  success.value = ''

  if (password.value.length < 6) {
    error.value = 'Le mot de passe doit contenir au moins 6 caractères'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Les mots de passe ne correspondent pas'
    return
  }

  submitting.value = true

  try {
    const token = route.query.token as string
    await api.post('/auth/reset-password', {
      token,
      newPassword: password.value
    })

    success.value = 'Mot de passe défini avec succès ! Vous pouvez maintenant vous connecter.'
    password.value = ''
    confirmPassword.value = ''
    
    // Rediriger automatiquement après 3 secondes
    setTimeout(() => {
      router.push('/')
    }, 3000)
  } catch (err: any) {
    error.value = err?.message || 'Erreur lors de la définition du mot de passe'
  } finally {
    submitting.value = false
  }
}

function goToLogin() {
  router.push('/')
}

onMounted(() => {
  checkToken()
})
</script>