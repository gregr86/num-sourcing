<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-3xl font-bold tracking-tight">Tableau de bord Agent</h2>
      <p class="text-muted-foreground">
        Gérez vos numéros de mandat et téléchargez vos documents
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Réserver un numéro</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Cliquez sur le bouton ci-dessous pour obtenir un nouveau numéro de mandat.
        </p>
        <Button @click="reserve" :disabled="reserving">
          <Plus v-if="!reserving" class="mr-2 h-4 w-4" />
          <Loader2 v-else class="mr-2 h-4 w-4 animate-spin" />
          Réserver un numéro
        </Button>
        <p v-if="reserveError" class="text-sm text-destructive">
          {{ reserveError }}
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Mes mandats</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="items.length" class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="m in items" :key="m.id">
                <TableCell class="font-medium">
                  <div class="flex items-center gap-2">
                    {{ m.code }}
                    <Button
                      variant="ghost"
                      size="icon"
                      @click="copy(m.code)"
                      title="Copier le code"
                    >
                      <Copy class="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :variant="getStatusVariant(m.status)">
                    {{ m.status }}
                  </Badge>
                </TableCell>
                <TableCell>
                  {{ m.deadlineAt ? new Date(m.deadlineAt).toLocaleDateString('fr-FR') : '-' }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <!-- Bouton Upload Brouillon -->
                    <label class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 cursor-pointer">
                      <Upload class="mr-2 h-4 w-4" />
                      Brouillon
                      <input
                        type="file"
                        accept="application/pdf"
                        @change="fileChosen($event, m.code, 'DRAFT')"
                        class="hidden"
                      />
                    </label>
                    
                    <!-- Bouton Upload Signé -->
                    <label class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 px-3 cursor-pointer">
                      <CheckCircle class="mr-2 h-4 w-4" />
                      Signé
                      <input
                        type="file"
                        accept="application/pdf"
                        @change="fileChosen($event, m.code, 'SIGNED')"
                        class="hidden"
                      />
                    </label>
                    
                    <!-- Boutons pour voir les fichiers -->
                    <Button
                      v-for="f in m.files"
                      :key="f.id"
                      variant="secondary"
                      size="sm"
                      @click="viewFile(m.code, f.id)"
                    >
                      <Eye class="mr-2 h-4 w-4" />
                      {{ f.kind }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-12 text-center">
          <FileText class="h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-muted-foreground">Aucun mandat pour le moment</p>
          <p class="text-sm text-muted-foreground">Commencez par réserver un numéro</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../utils/api'
import { Plus, Loader2, Copy, Upload, CheckCircle, Eye, FileText } from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'
import Badge from '../components/ui/badge.vue'
import Table from '../components/ui/table.vue'
import TableHeader from '../components/ui/table-header.vue'
import TableBody from '../components/ui/table-body.vue'
import TableRow from '../components/ui/table-row.vue'
import TableHead from '../components/ui/table-head.vue'
import TableCell from '../components/ui/table-cell.vue'

type FileKind = 'DRAFT' | 'SIGNED'
type Item = { id: string; code: string; status: string; deadlineAt?: string | null; files: { id: string; kind: FileKind }[] }

const items = ref<Item[]>([])
const reserving = ref(false)
const reserveError = ref('')

function getStatusVariant(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
    RESERVED: 'warning',
    DRAFT: 'secondary',
    SIGNED: 'success',
    AVAILABLE: 'default'
  }
  return variants[status] || 'default'
}

async function fetchMy() {
  const res = await api.get('/mandates/my')
  items.value = res.items
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {}
}

async function reserve() {
  reserving.value = true
  reserveError.value = ''
  try {
    await api.post('/mandates/reserve')
    await fetchMy()
  } catch {
    reserveError.value = 'Aucun numéro disponible'
  } finally {
    reserving.value = false
  }
}

async function fileChosen(e: Event, code: string, kind: FileKind) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const { uploadUrl } = await api.post(`/mandates/${encodeURIComponent(code)}/upload-url`, { kind })
  const r = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file
  })
  if (!r.ok) {
    alert('Upload échoué')
    return
  }
  await fetchMy()
}

async function viewFile(code: string, id: string) {
  const { url } = await api.get(`/mandates/${encodeURIComponent(code)}/files/${id}/url`)
  window.open(url, '_blank')
}

onMounted(fetchMy)
</script>