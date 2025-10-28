<template>
  <div class="flex min-h-[calc(100vh-5rem)] items-center justify-center">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-1">
        <CardTitle class="text-2xl">Connexion</CardTitle>
        <p class="text-sm text-muted-foreground">
          Entrez vos identifiants pour accéder à votre compte
        </p>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="onSubmit" class="space-y-4">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              placeholder="nom@exemple.com"
              required
            />
          </div>
          
          <div class="space-y-2">
            <Label for="password">Mot de passe</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              required
            />
          </div>

          <div v-if="error" class="text-sm text-destructive">
            {{ error }}
          </div>

          <Button type="submit" class="w-full" :disabled="loading">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            Se connecter
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { Loader2 } from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'
import Input from '../components/ui/input.vue'
import Label from '../components/ui/label.vue'

const router = useRouter()
const auth = useAuthStore()
const email = ref('admin@sourcinginvest.local')
const password = ref('password')
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(auth.me?.role === 'ADMIN' ? '/admin' : '/agent')
  } catch {
    error.value = 'Identifiants invalides'
  } finally {
    loading.value = false
  }
}
</script>