<template>
  <div>
    <!-- CRÉER UN UTILISATEUR -->
    <div class="card">
      <h2>Administration</h2>
      <form @submit.prevent="createUser" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
        <div><label>Prénom</label><input v-model="newUser.firstName"></div>
        <div><label>Nom</label><input v-model="newUser.lastName"></div>
        <div><label>Email</label><input v-model="newUser.email" type="email" required></div>
        <div><label>Mot de passe</label><input v-model="newUser.password" type="password" required></div>
        <div><label>Rôle</label>
          <select v-model="newUser.role"><option value="AGENT">AGENT</option><option value="ADMIN">ADMIN</option></select>
        </div>
        <button class="btn">Créer</button>
        <span v-if="msgCreate" style="margin-left:6px">{{ msgCreate }}</span>
      </form>
    </div>

    <!-- UTILISATEURS -->
    <div class="card">
      <h3>Utilisateurs</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <input placeholder="Recherche email/nom..." v-model="usersFilters.q">
        <select v-model="usersFilters.role" style="width:160px">
          <option value="">(tous rôles)</option><option value="AGENT">AGENT</option><option value="ADMIN">ADMIN</option>
        </select>
        <select v-model="usersFilters.active" style="width:160px">
          <option value="">(tous)</option><option value="true">Actifs</option><option value="false">Inactifs</option>
        </select>
        <button class="btn" type="button" @click="loadUsers">Rechercher</button>
      </div>

      <table v-if="users.items.length">
        <thead><tr><th>Prénom</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Actif</th><th>Reset MDP</th><th>Actions</th></tr></thead>
        <tbody>
          <tr v-for="u in users.items" :key="u.id">
            <td><input v-model="u.firstName" style="width:140px"></td>
            <td><input v-model="u.lastName" style="width:140px"></td>
            <td><input v-model="u.email" style="width:240px"></td>
            <td>
              <select v-model="u.role"><option value="AGENT">AGENT</option><option value="ADMIN">ADMIN</option></select>
            </td>
            <td>
              <select v-model="u.active"><option :value="true">true</option><option :value="false">false</option></select>
            </td>
            <td><input v-model="u._newPassword" placeholder="Nouveau MDP" type="password" style="width:160px"></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" @click="saveUser(u)">Enregistrer</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else>Aucun utilisateur.</p>

      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="btn" :disabled="users.page<=1" @click="users.page--; loadUsers()">◀ Page précédente</button>
        <span>Page {{ users.page }}</span>
        <button class="btn" :disabled="users.page*users.pageSize >= users.total" @click="users.page++; loadUsers()">Page suivante ▶</button>
        <span style="margin-left:8px;color:#475569">Total: {{ users.total }}</span>
      </div>
    </div>

    <!-- ALLOCATIONS (qui a réservé quoi + accès aux PDF) -->
    <div class="card">
      <h3>Allocations de mandats</h3>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <input placeholder="Recherche (code / email / nom)" v-model="allocFilters.q" style="width:260px">
        <select v-model="allocFilters.status" style="width:160px">
          <option value="">(tous statuts)</option>
          <option value="RESERVED">RESERVED</option>
          <option value="DRAFT">DRAFT</option>
          <option value="SIGNED">SIGNED</option>
          <option value="RELEASED">RELEASED</option>
        </select>
        <button class="btn" type="button" @click="loadAllocations">Rechercher</button>
      </div>

      <table v-if="allocs.items.length">
        <thead>
          <tr>
            <th>Code</th>
            <th>Statut</th>
            <th>Agent</th>
            <th>Deadline</th>
            <th>Fichiers</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in allocs.items" :key="a.id">
            <td>{{ a.code }}</td>
            <td><span class="badge" :class="'badge--'+a.status">{{ a.status }}</span></td>
            <td>
              <div>{{ fullName(a.user) }}</div>
              <div style="font-size:12px;color:#475569">{{ a.user?.email }}</div>
            </td>
            <td>{{ a.deadlineAt ? new Date(a.deadlineAt).toLocaleDateString() : '-' }}</td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <button v-for="f in a.files" :key="f.id" class="btn" style="background:#64748b" @click="openAdminFile(f.id)">
                Voir {{ f.kind }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>Aucune allocation.</p>

      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="btn" :disabled="allocs.page<=1" @click="allocs.page--; loadAllocations()">◀ Page précédente</button>
        <span>Page {{ allocs.page }}</span>
        <button class="btn" :disabled="allocs.page*allocs.pageSize >= allocs.total" @click="allocs.page++; loadAllocations()">Page suivante ▶</button>
        <span style="margin-left:8px;color:#475569">Total: {{ allocs.total }}</span>
      </div>
    </div>

    <!-- NUMÉROS DE MANDAT (édition / suppression / release) -->
    <div class="card">
      <h3>Numéros de mandat</h3>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <input placeholder="Recherche code..." v-model="mandatesFilters.q">
        <input placeholder="Année" v-model.number="mandatesFilters.year" type="number" style="width:120px">
        <select v-model="mandatesFilters.status" style="width:160px">
          <option value="">(tous statuts)</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="RESERVED">RESERVED</option>
          <option value="SIGNED">SIGNED</option>
        </select>
        <button class="btn" type="button" @click="loadMandates">Rechercher</button>
      </div>

      <table v-if="mandates.items.length">
        <thead><tr><th>Code</th><th>Année</th><th>Seq</th><th>Statut</th><th style="width:320px">Actions</th></tr></thead>
        <tbody>
          <tr v-for="m in mandates.items" :key="m.id">
            <td><input v-model="m.code" style="width:160px"></td>
            <td><input v-model.number="m.year" type="number" style="width:90px"></td>
            <td><input v-model.number="m.seq" type="number" style="width:90px"></td>
            <td>
              <select v-model="m.status">
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="RESERVED">RESERVED</option>
                <option value="SIGNED">SIGNED</option>
              </select>
            </td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn" @click="saveMandate(m)">Enregistrer</button>
              <button class="btn" style="background:#e11d48" @click="deleteMandate(m)">Supprimer</button>
              <button class="btn" style="background:#0ea5e9" @click="releaseMandate(m)">Remettre en dispo</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>Aucun résultat.</p>

      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="btn" :disabled="mandates.page<=1" @click="mandates.page--; loadMandates()">◀ Page précédente</button>
        <span>Page {{ mandates.page }}</span>
        <button class="btn" :disabled="mandates.page*mandates.pageSize >= mandates.total" @click="mandates.page++; loadMandates()">Page suivante ▶</button>
        <span style="margin-left:8px;color:#475569">Total: {{ mandates.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../utils/api'

/* ---------- Create user ---------- */
const newUser = ref<{ firstName?: string; lastName?: string; email: string; password: string; role: 'AGENT'|'ADMIN' }>({ email:'', password:'', role:'AGENT' })
const msgCreate = ref('')
async function createUser() {
  msgCreate.value = ''
  try { await api.post('/admin/users', newUser.value); msgCreate.value='Utilisateur créé'; newUser.value={ email:'', password:'', role:'AGENT' }; await loadUsers() }
  catch { msgCreate.value='Erreur création utilisateur' }
}

/* ---------- Users list ---------- */
type UserRow = { id: string; firstName?: string|null; lastName?: string|null; email: string; role: 'ADMIN'|'AGENT'; active: boolean; _newPassword?: string }
const users = ref({ items: [] as UserRow[], total: 0, page: 1, pageSize: 50 })
const usersFilters = ref({ q:'', role:'', active:'' })
async function loadUsers() {
  const p = new URLSearchParams()
  if (usersFilters.value.q) p.set('q', usersFilters.value.q)
  if (usersFilters.value.role) p.set('role', usersFilters.value.role)
  if (usersFilters.value.active) p.set('active', usersFilters.value.active)
  p.set('page', String(users.value.page)); p.set('pageSize', String(users.value.pageSize))
  const res = await api.get(`/admin/users?${p.toString()}`)
  users.value.items = res.items.map((x: any) => ({ ...x, _newPassword: '' }))
  users.value.total = res.total
}
async function saveUser(u: UserRow) {
  const body: any = { email: u.email, role: u.role, active: u.active, firstName: u.firstName ?? null, lastName: u.lastName ?? null }
  if (u._newPassword) body.newPassword = u._newPassword
  await api.patch(`/admin/users/${u.id}`, body)
  u._newPassword = ''
  await loadUsers()
}

/* ---------- Allocations ---------- */
type FileRow = { id: string; kind: 'DRAFT'|'SIGNED'; createdAt?: string }
type AllocRow = { id: string; code?: string; status: 'RESERVED'|'DRAFT'|'SIGNED'|'RELEASED'; deadlineAt?: string|null; user?: { id: string; email: string; firstName?: string|null; lastName?: string|null }|null; files: FileRow[] }
const allocs = ref({ items: [] as AllocRow[], total: 0, page: 1, pageSize: 50 })
const allocFilters = ref({ q:'', status:'' })
async function loadAllocations() {
  const p = new URLSearchParams()
  if (allocFilters.value.q) p.set('q', allocFilters.value.q)
  if (allocFilters.value.status) p.set('status', allocFilters.value.status)
  p.set('page', String(allocs.value.page)); p.set('pageSize', String(allocs.value.pageSize))
  const res = await api.get(`/admin/mandate-allocations?${p.toString()}`)
  allocs.value.items = res.items
  allocs.value.total = res.total
}
function fullName(u?: {firstName?: string|null; lastName?: string|null} | null) {
  if (!u) return '-'
  const f = [u.firstName, u.lastName].filter(Boolean).join(' ')
  return f || '-'
}
async function openAdminFile(fileId: string) {
  const { url } = await api.get(`/admin/files/${fileId}/url`)
  window.open(url, '_blank')
}

/* ---------- Mandate numbers ---------- */
type MandateRow = { id: string; code: string; year: number; seq: number; status: 'AVAILABLE'|'RESERVED'|'SIGNED' }
const mandates = ref({ items: [] as MandateRow[], total: 0, page: 1, pageSize: 50 })
const mandatesFilters = ref({ q:'', year: new Date().getFullYear(), status:'' })
async function loadMandates() {
  const p = new URLSearchParams()
  if (mandatesFilters.value.q) p.set('q', mandatesFilters.value.q)
  if (mandatesFilters.value.year) p.set('year', String(mandatesFilters.value.year))
  if (mandatesFilters.value.status) p.set('status', mandatesFilters.value.status)
  p.set('page', String(mandates.value.page)); p.set('pageSize', String(mandates.value.pageSize))
  const res = await api.get(`/admin/mandate-numbers?${p.toString()}`)
  mandates.value.items = res.items; mandates.value.total = res.total
}
async function saveMandate(m: MandateRow) { await api.patch(`/admin/mandate-numbers/${m.id}`, { code: m.code, year: m.year, seq: m.seq, status: m.status }); await loadMandates() }
async function deleteMandate(m: MandateRow) { if (!confirm('Supprimer ce numéro ? (possible uniquement sans allocations)')) return; await api.del(`/admin/mandate-numbers/${m.id}`); await loadMandates() }
async function releaseMandate(m: MandateRow) { await api.post(`/admin/mandate-numbers/${m.id}/release`); await loadMandates() }

/* ---------- init ---------- */
onMounted(async () => { await Promise.all([loadUsers(), loadAllocations(), loadMandates()]) })
</script>
