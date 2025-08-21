<template>
  <div>
    <!-- CRÉER UN UTILISATEUR -->
    <div class="card">
      <h2>Administration</h2>
      <form @submit.prevent="createUser" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
        <div>
          <label>Email</label>
          <input v-model="newUser.email" type="email" required>
        </div>
        <div>
          <label>Mot de passe</label>
          <input v-model="newUser.password" type="password" required>
        </div>
        <div>
          <label>Rôle</label>
          <select v-model="newUser.role">
            <option value="AGENT">AGENT</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <button class="btn">Créer</button>
        <span v-if="msgCreate" style="margin-left:6px">{{ msgCreate }}</span>
      </form>
    </div>

    <!-- UTILISATEURS -->
    <div class="card">
      <h3>Utilisateurs</h3>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <input placeholder="Recherche email..." v-model="usersFilters.q">
        <select v-model="usersFilters.role" style="width:160px">
          <option value="">(tous rôles)</option>
          <option value="AGENT">AGENT</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select v-model="usersFilters.active" style="width:160px">
          <option value="">(tous)</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </select>
        <button class="btn" type="button" @click="loadUsers">Rechercher</button>
      </div>

      <table v-if="users.items.length">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rôle</th>
            <th>Actif</th>
            <th>Reset MDP</th>
            <th style="width:220px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users.items" :key="u.id">
            <td><input v-model="u.email" style="width:260px"></td>
            <td>
              <select v-model="u.role">
                <option value="AGENT">AGENT</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </td>
            <td>
              <label style="display:flex;gap:6px;align-items:center">
                <input type="checkbox" v-model="u.active"> <span>{{ u.active ? 'Actif' : 'Inactif' }}</span>
              </label>
            </td>
            <td>
              <input v-model="u._newPassword" placeholder="Nouveau MDP" type="password" style="width:160px">
            </td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn" @click="saveUser(u)">Enregistrer</button>
            </td>
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

    <!-- NUMÉROS DE MANDAT -->
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
        <thead>
          <tr>
            <th>Code</th>
            <th>Année</th>
            <th>Seq</th>
            <th>Statut</th>
            <th style="width:320px">Actions</th>
          </tr>
        </thead>
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

/** ---------- Création utilisateur ---------- */
const newUser = ref<{ email: string; password: string; role: 'AGENT'|'ADMIN' }>({
  email: '',
  password: '',
  role: 'AGENT'
})
const msgCreate = ref('')

async function createUser() {
  msgCreate.value = ''
  try {
    await api.post('/admin/users', newUser.value)
    msgCreate.value = 'Utilisateur créé'
    newUser.value = { email: '', password: '', role: 'AGENT' }
    await loadUsers()
  } catch {
    msgCreate.value = 'Erreur création utilisateur'
  }
}

/** ---------- Liste & édition utilisateurs ---------- */
type UserRow = { id: string; email: string; role: 'ADMIN'|'AGENT'; active: boolean; _newPassword?: string }

const users = ref<{ items: UserRow[]; total: number; page: number; pageSize: number }>({
  items: [], total: 0, page: 1, pageSize: 50
})
const usersFilters = ref<{ q: string; role: ''|'ADMIN'|'AGENT'; active: ''|'true'|'false' }>({
  q: '', role: '', active: ''
})

async function loadUsers() {
  const p = new URLSearchParams()
  if (usersFilters.value.q) p.set('q', usersFilters.value.q)
  if (usersFilters.value.role) p.set('role', usersFilters.value.role)
  if (usersFilters.value.active) p.set('active', usersFilters.value.active)
  p.set('page', String(users.value.page))
  p.set('pageSize', String(users.value.pageSize))

  const res = await api.get(`/admin/users?${p.toString()}`)
  users.value.items = res.items.map((x: any) => ({ ...x, _newPassword: '' }))
  users.value.total = res.total
}

async function saveUser(u: UserRow) {
  const body: any = { email: u.email, role: u.role, active: u.active }
  if (u._newPassword) body.newPassword = u._newPassword
  await api.patch(`/admin/users/${u.id}`, body)
  u._newPassword = ''
  await loadUsers()
}

/** ---------- Mandats (numéros) ---------- */
type MandateRow = { id: string; code: string; year: number; seq: number; status: 'AVAILABLE'|'RESERVED'|'SIGNED' }

const mandates = ref<{ items: MandateRow[]; total: number; page: number; pageSize: number }>({
  items: [], total: 0, page: 1, pageSize: 50
})
const mandatesFilters = ref<{ q: string; year: number | ''; status: ''|'AVAILABLE'|'RESERVED'|'SIGNED' }>({
  q: '', year: new Date().getFullYear(), status: ''
})

async function loadMandates() {
  const p = new URLSearchParams()
  if (mandatesFilters.value.q) p.set('q', mandatesFilters.value.q)
  if (mandatesFilters.value.year) p.set('year', String(mandatesFilters.value.year))
  if (mandatesFilters.value.status) p.set('status', mandatesFilters.value.status)
  p.set('page', String(mandates.value.page))
  p.set('pageSize', String(mandates.value.pageSize))

  const res = await api.get(`/admin/mandate-numbers?${p.toString()}`)
  mandates.value.items = res.items
  mandates.value.total = res.total
}

async function saveMandate(m: MandateRow) {
  await api.patch(`/admin/mandate-numbers/${m.id}`, {
    code: m.code, year: m.year, seq: m.seq, status: m.status
  })
  await loadMandates()
}

async function deleteMandate(m: MandateRow) {
  if (!confirm('Supprimer ce numéro ? (possible uniquement sans allocations)')) return
  await api.del(`/admin/mandate-numbers/${m.id}`)
  await loadMandates()
}

async function releaseMandate(m: MandateRow) {
  await api.post(`/admin/mandate-numbers/${m.id}/release`)
  await loadMandates()
}

/** ---------- Init ---------- */
onMounted(async () => {
  await Promise.all([loadUsers(), loadMandates()])
})
</script>
