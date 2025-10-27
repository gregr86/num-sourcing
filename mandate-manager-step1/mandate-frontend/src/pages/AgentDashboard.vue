<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Tableau de bord Agent</h2>
        <p class="text-muted-foreground">Gérez vos mandats et réservations</p>
      </div>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Réserver un nouveau numéro</CardTitle>
        <CardDescription>
          Réservez un numéro de mandat pour démarrer une nouvelle procédure
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button @click="reserve" :disabled="reserving" size="lg">
          <svg
            v-if="reserving"
            class="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {{ reserving ? 'Réservation...' : 'Réserver un numéro' }}
        </Button>
        <p v-if="reserveError" class="mt-2 text-sm text-destructive">{{ reserveError }}</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Mes mandats</CardTitle>
        <CardDescription>Liste de tous vos mandats actifs et leur statut</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="items.length > 0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date limite</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="m in items" :key="m.id">
                <TableCell class="font-mono font-medium">
                  <div class="flex items-center gap-2">
                    {{ m.code }}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6"
                      @click="copy(m.code)"
                      title="Copier le code"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="h-3 w-3"
                      >
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </svg>
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :variant="getBadgeVariant(m.status)">
                    {{ m.status }}
                  </Badge>
                </TableCell>
                <TableCell>
                  {{ m.deadlineAt ? new Date(m.deadlineAt).toLocaleDateString('fr-FR') : '-' }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <label>
                      <Button variant="secondary" size="sm" as="span">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="mr-2 h-4 w-4"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        Brouillon
                      </Button>
                      <input
                        type="file"
                        accept="application/pdf"
                        class="hidden"
                        @change="fileChosen($event, m.code, 'DRAFT')"
                      />
                    </label>
                    
                    <label>
                      <Button variant="default" size="sm" as="span">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="mr-2 h-4 w-4"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M16 13H8" />
                          <path d="M16 17H8" />
                          <path d="M10 9H8" />
                        </svg>
                        Signé
                      </Button>
                      <input
                        type="file"
                        accept="application/pdf"
                        class="hidden"
                        @change="fileChosen($event, m.code, 'SIGNED')"
                      />
                    </label>

                    <Button
                      v-for="f in m.files"
                      :key="f.id"
                      variant="outline"
                      size="sm"
                      @click="viewFile(m.code, f.id)"
                    >
                      Voir {{ f.kind === 'DRAFT' ? 'brouillon' : 'signé' }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-12 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-12 w-12 text-muted-foreground mb-4"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          <h3 class="text-lg font-semibold">Aucun mandat</h3>
          <p class="text-sm text-muted-foreground mt-1">
            Commencez par réserver votre premier numéro de mandat
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../utils/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'

type FileKind = 'DRAFT' | 'SIGNED'
type Item = {
  id: string
  code: string
  status: string
  deadlineAt?: string | null
  files: { id: string; kind: FileKind }[]
}

const items = ref<Item[]>([])
const reserving = ref(false)
const reserveError = ref('')

function getBadgeVariant(status: string) {
  const variants: Record<string, any> = {
    RESERVED: 'warning',
    DRAFT: 'secondary',
    SIGNED: 'success',
    AVAILABLE: 'outline'
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