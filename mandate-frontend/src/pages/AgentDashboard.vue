<template>
  <div>
    <div class="card">
      <h2>Tableau de bord Agent</h2>
      <p>Réserver un numéro et déposer votre mandat.</p>
      <button class="btn" @click="reserve" :disabled="reserving">Réserver un n°</button>
      <span v-if="reserveError" style="color:#dc2626;margin-left:8px">{{ reserveError }}</span>
    </div>

    <div class="card">
      <h3>Mes mandats</h3>
      <table v-if="items.length">
        <thead><tr><th>Code</th><th>Statut</th><th>Deadline</th><th>Actions</th></tr><button class="btn" style="background:#0ea5e9" @click="copy(m.code)">Copier le code</button>
</thead>
        <tbody>
          <tr v-for="m in items" :key="m.id">
            <td>{{ m.code }}</td>
            <td><span class="badge" :class="'badge--'+m.status">{{ m.status }}</span></td>
            <td>{{ m.deadlineAt ? new Date(m.deadlineAt).toLocaleDateString() : '-' }}</td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <label class="btn" style="background:#334155">
                Déposer brouillon
                <input type="file" accept="application/pdf" @change="fileChosen($event, m.code, 'DRAFT')" style="display:none" />
              </label>
              <label class="btn" style="background:#059669">
                Déposer signé
                <input type="file" accept="application/pdf" @change="fileChosen($event, m.code, 'SIGNED')" style="display:none" />
              </label>
              <button class="btn" style="background:#64748b" v-for="f in m.files" :key="f.id" @click="viewFile(m.code, f.id)">Voir fichier</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>Pas encore de mandats.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../utils/api'
type FileKind = 'DRAFT' | 'SIGNED'
type Item = { id: string; code: string; status: string; deadlineAt?: string | null; files: { id: string; kind: FileKind }[] }
const items = ref<Item[]>([])
const reserving = ref(false)
const reserveError = ref('')

async function fetchMy() {
  const res = await api.get('/mandates/my')
  items.value = res.items
}
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text) } catch {}
}
async function reserve() {
  reserving.value = true; reserveError.value = ''
  try { await api.post('/mandates/reserve'); await fetchMy() }
  catch { reserveError.value = 'Aucun numéro disponible' }
  finally { reserving.value = false }
}
async function fileChosen(e: Event, code: string, kind: FileKind) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]; if (!file) return
  const { uploadUrl } = await api.post(`/mandates/${encodeURIComponent(code)}/upload-url`, { kind })
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })
  if (!r.ok) { alert('Upload échoué'); return }
  await fetchMy()
}
async function viewFile(code: string, id: string) {
  const { url } = await api.get(`/mandates/${encodeURIComponent(code)}/files/${id}/url`)
  window.open(url, '_blank')
}
onMounted(fetchMy)
</script>
