<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-3xl font-bold tracking-tight">Newsletters</h2>
      <p class="text-muted-foreground">
        Consultez les newsletters publiées par votre administration
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <FileText class="h-5 w-5" />
          Newsletters disponibles
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="newsletters.items.length" class="space-y-3">
          <div
            v-for="n in newsletters.items"
            :key="n.id"
            class="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
          >
            <div class="space-y-1 flex-1">
              <h3 class="font-semibold">{{ n.title }}</h3>
              <p v-if="n.description" class="text-sm text-muted-foreground">
                {{ n.description }}
              </p>
              <p class="text-xs text-muted-foreground">
                Publié le {{ new Date(n.createdAt).toLocaleDateString('fr-FR') }}
              </p>
            </div>
            <Button variant="outline" size="sm" @click="viewNewsletter(n.id)">
              <Download class="mr-2 h-4 w-4" />
              Télécharger
            </Button>
          </div>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-12">
          <FileText class="h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-muted-foreground">Aucune newsletter disponible</p>
        </div>

        <div v-if="newsletters.total > newsletters.pageSize" class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="newsletters.page <= 1"
              @click="newsletters.page--; loadNewsletters()"
            >
              <ChevronLeft class="h-4 w-4" />
              Précédent
            </Button>
            <span class="text-sm text-muted-foreground">
              Page {{ newsletters.page }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="newsletters.page * newsletters.pageSize >= newsletters.total"
              @click="newsletters.page++; loadNewsletters()"
            >
              Suivant
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
          <span class="text-sm text-muted-foreground">
            Total: {{ newsletters.total }}
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../utils/api'
import {
  FileText, Download, ChevronLeft, ChevronRight
} from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'

type Newsletter = {
  id: string
  title: string
  description?: string
  createdAt: string
}

const newsletters = ref({
  items: [] as Newsletter[],
  total: 0,
  page: 1,
  pageSize: 20
})

async function loadNewsletters() {
  const params = new URLSearchParams({
    page: String(newsletters.value.page),
    pageSize: String(newsletters.value.pageSize)
  })
  
  const res = await api.get(`/newsletters?${params}`)
  newsletters.value.items = res.items
  newsletters.value.total = res.total
}

async function viewNewsletter(id: string) {
  try {
    const { url } = await api.get(`/newsletters/${id}/download`)
    window.open(url, '_blank')
  } catch (error) {
    console.error('Erreur:', error)
    alert('Impossible d\'ouvrir la newsletter')
  }
}

onMounted(() => {
  loadNewsletters()
})
</script>