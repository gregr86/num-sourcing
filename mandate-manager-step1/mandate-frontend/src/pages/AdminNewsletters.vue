<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-3xl font-bold tracking-tight">Gestion des Newsletters</h2>
      <p class="text-muted-foreground">
        Publiez des newsletters pour vos agents
      </p>
    </div>

    <!-- Créer une newsletter -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <FileText class="h-5 w-5" />
          Publier une nouvelle newsletter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="createNewsletter" class="space-y-4">
          <div class="space-y-2">
            <Label for="title">Titre</Label>
            <Input
              id="title"
              v-model="newNewsletter.title"
              placeholder="Newsletter Janvier 2025"
              required
            />
          </div>
          
          <div class="space-y-2">
            <Label for="description">Description (optionnelle)</Label>
            <Input
              id="description"
              v-model="newNewsletter.description"
              placeholder="Actualités du mois de janvier"
            />
          </div>

          <div class="space-y-2">
            <Label for="file">Fichier PDF</Label>
            <input
              id="file"
              ref="fileInput"
              type="file"
              accept="application/pdf"
              @change="fileSelected"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              required
            />
          </div>

          <div class="flex items-center gap-2">
            <Button type="submit" :disabled="uploading">
              <Loader2 v-if="uploading" class="mr-2 h-4 w-4 animate-spin" />
              <Upload v-else class="mr-2 h-4 w-4" />
              Publier la newsletter
            </Button>
            <p v-if="message" :class="message.includes('Erreur') ? 'text-destructive' : 'text-green-600'" class="text-sm">
              {{ message }}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Liste des newsletters -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <List class="h-5 w-5" />
          Newsletters publiées
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="newsletters.items.length" class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Publié par</TableHead>
                <TableHead>Date</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="n in newsletters.items" :key="n.id">
                <TableCell class="font-medium">{{ n.title }}</TableCell>
                <TableCell>{{ n.description || '-' }}</TableCell>
                <TableCell>
                  {{ fullName(n.publisher) }}
                </TableCell>
                <TableCell>
                  {{ new Date(n.createdAt).toLocaleDateString('fr-FR') }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <Button size="sm" variant="outline" @click="viewNewsletter(n.id)">
                      <Eye class="mr-2 h-4 w-4" />
                      Voir
                    </Button>
                    <Button size="sm" variant="destructive" @click="deleteNewsletter(n.id)">
                      <Trash2 class="mr-2 h-4 w-4" />
                      Supprimer
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-12">
          <FileText class="h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-muted-foreground">Aucune newsletter publiée</p>
        </div>

        <div class="flex items-center justify-between">
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
  FileText, Upload, Loader2, Eye, Trash2, List,
  ChevronLeft, ChevronRight
} from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'
import Input from '../components/ui/input.vue'
import Label from '../components/ui/label.vue'
import Table from '../components/ui/table.vue'
import TableHeader from '../components/ui/table-header.vue'
import TableBody from '../components/ui/table-body.vue'
import TableRow from '../components/ui/table-row.vue'
import TableHead from '../components/ui/table-head.vue'
import TableCell from '../components/ui/table-cell.vue'

type Newsletter = {
  id: string
  title: string
  description?: string
  createdAt: string
  publisher: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
  }
}

const newNewsletter = ref({
  title: '',
  description: ''
})
const fileInput = ref<HTMLInputElement>()
const selectedFile = ref<File>()
const uploading = ref(false)
const message = ref('')

const newsletters = ref({
  items: [] as Newsletter[],
  total: 0,
  page: 1,
  pageSize: 20
})

function fullName(user?: { firstName?: string | null; lastName?: string | null } | null) {
  if (!user) return '-'
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.length ? parts.join(' ') : '-'
}

function fileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  selectedFile.value = input.files?.[0]
}

async function createNewsletter() {
  if (!selectedFile.value) {
    message.value = 'Erreur: Veuillez sélectionner un fichier'
    return
  }

  uploading.value = true
  message.value = ''

  try {
    // Créer la newsletter et obtenir l'URL d'upload
    const { uploadUrl } = await api.post('/admin/newsletters', {
      title: newNewsletter.value.title,
      description: newNewsletter.value.description || undefined
    })

    // Uploader le fichier
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: selectedFile.value
    })

    if (!uploadResponse.ok) {
      throw new Error('Upload failed')
    }

    message.value = 'Newsletter publiée avec succès'
    newNewsletter.value = { title: '', description: '' }
    selectedFile.value = undefined
    if (fileInput.value) fileInput.value.value = ''
    
    await loadNewsletters()
  } catch (error) {
    console.error('Erreur:', error)
    message.value = 'Erreur lors de la publication'
  } finally {
    uploading.value = false
  }
}

async function loadNewsletters() {
  const params = new URLSearchParams({
    page: String(newsletters.value.page),
    pageSize: String(newsletters.value.pageSize)
  })
  
  const res = await api.get(`/admin/newsletters?${params}`)
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

async function deleteNewsletter(id: string) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette newsletter ?')) {
    return
  }

  try {
    await api.del(`/admin/newsletters/${id}`)
    await loadNewsletters()
  } catch (error) {
    console.error('Erreur:', error)
    alert('Erreur lors de la suppression')
  }
}

onMounted(() => {
  loadNewsletters()
})
</script>