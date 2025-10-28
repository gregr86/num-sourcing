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
              v-model="form.email"
              type="email"
              placeholder="nom@exemple.com"
              required
              autocomplete="email"
            />
            <p class="text-xs text-muted-foreground">Valeur: {{ form.email }}</p>
          </div>
          
          <div class="space-y-2">
            <Label for="password">Mot de passe</Label>
            <Input
              id="password"
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
            <p class="text-xs text-muted-foreground">Longueur: {{ form.password.length }}</p>
          </div>

          <div v-if="error" class="text-sm text-destructive">
            {{ error }}
          </div>

          <Button type="submit" class="w-full" :disabled="loading">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            Se connecter
          </Button>
          
          <!-- Aide pour le développement -->
          <div class="text-xs text-muted-foreground space-y-1 mt-4 p-3 bg-muted rounded">
            <p class="font-semibold">Comptes de test :</p>
            <p>• Admin: admin@sourcinginvest.local / password</p>
            <p>• Agent: agent@sourcinginvest.local / password</p>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
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

// Utiliser reactive pour être sûr que ça fonctionne
const form = reactive({
  email: '',
  password: ''
})

const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  
  console.log('📝 Valeurs du formulaire:')
  console.log('  - Email:', form.email)
  console.log('  - Password length:', form.password.length)
  
  // Validation simple
  if (!form.email || !form.password) {
    error.value = 'Veuillez remplir tous les champs'
    console.error('❌ Champs vides!')
    return
  }
  
  loading.value = true
  
  console.log('🔐 Tentative de connexion avec:', form.email)
  
  try {
    await auth.login(form.email, form.password)
    
    console.log('✅ Connexion réussie')
    console.log('👤 Utilisateur:', auth.me)
    console.log('🔑 Rôle:', auth.me?.role)
    
    // Déterminer la route en fonction du rôle
    const targetRoute = auth.me?.role === 'ADMIN' ? '/admin' : '/agent'
    console.log('🔄 Redirection vers:', targetRoute)
    
    // Forcer la redirection
    await router.push(targetRoute)
    
    console.log('✅ Redirection effectuée')
  } catch (err: any) {
    console.error('❌ Erreur de connexion:', err)
    error.value = err?.message || 'Identifiants invalides'
  } finally {
    loading.value = false
  }
}
</script>