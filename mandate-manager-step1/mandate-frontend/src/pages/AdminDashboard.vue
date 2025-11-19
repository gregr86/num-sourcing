<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-3xl font-bold tracking-tight">Administration</h2>
      <p class="text-muted-foreground">
        Gérez les utilisateurs, mandats et allocations
      </p>
    </div>

    <!-- CRÉER UN UTILISATEUR -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <UserPlus class="h-5 w-5" />
          Créer un utilisateur
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="createUser" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-2">
              <Label for="firstName">Prénom</Label>
              <Input id="firstName" v-model="newUser.firstName" placeholder="Jean" />
            </div>
            
            <div class="space-y-2">
              <Label for="lastName">Nom</Label>
              <Input id="lastName" v-model="newUser.lastName" placeholder="Dupont" />
            </div>
            
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input id="email" v-model="newUser.email" type="email" placeholder="jean.dupont@exemple.com" required />
            </div>
            
           
            
            <div class="space-y-2">
              <Label for="role">Rôle</Label>
              <Select id="role" v-model="newUser.role">
                <option value="AGENT">AGENT</option>
                <option value="ADMIN">ADMIN</option>
              </Select>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <Button type="submit">
              <UserPlus class="mr-2 h-4 w-4" />
              Créer l'utilisateur
            </Button>
            <p v-if="msgCreate" :class="msgCreate.includes('Erreur') ? 'text-destructive' : 'text-green-600'" class="text-sm">
              {{ msgCreate }}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- ALLOUER UN NUMÉRO À UN AGENT -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <UserCog class="h-5 w-5" />
          Allouer un numéro à un agent
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="allocateMandate" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <Label for="agent">Agent</Label>
              <Select id="agent" v-model="allocation.userId" required>
                <option value="">Sélectionner un agent...</option>
                <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                  {{ fullName(agent) }} ({{ agent.email }})
                </option>
              </Select>
            </div>
            
            <div class="space-y-2">
              <Label for="mandate">Numéro de mandat</Label>
              <Select id="mandate" v-model="allocation.mandateNumberId" required>
                <option value="">Sélectionner un numéro...</option>
                <option v-for="m in availableMandates" :key="m.id" :value="m.id">
                  {{ m.code }}
                </option>
              </Select>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <Button type="submit" :disabled="!allocation.userId || !allocation.mandateNumberId">
              <CheckCircle class="mr-2 h-4 w-4" />
              Allouer le numéro
            </Button>
            <p v-if="msgAllocate" :class="msgAllocate.includes('Erreur') ? 'text-destructive' : 'text-green-600'" class="text-sm">
              {{ msgAllocate }}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- UTILISATEURS -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Users class="h-5 w-5" />
          Utilisateurs
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Input
            v-model="usersFilters.q"
            placeholder="Recherche email/nom..."
            class="max-w-xs"
          />
          <Select v-model="usersFilters.role" class="w-40">
            <option value="">(tous rôles)</option>
            <option value="AGENT">AGENT</option>
            <option value="ADMIN">ADMIN</option>
          </Select>
          <Select v-model="usersFilters.active" class="w-40">
            <option value="">(tous)</option>
            <option value="true">Actifs</option>
            <option value="false">Inactifs</option>
          </Select>
          <Button @click="loadUsers">
            <Search class="mr-2 h-4 w-4" />
            Rechercher
          </Button>
        </div>

        <div v-if="users.items.length" class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prénom</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Nouveau MDP</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="u in users.items" :key="u.id">
                <TableCell>
                  <Input v-model="u.firstName" class="w-32" />
                </TableCell>
                <TableCell>
                  <Input v-model="u.lastName" class="w-32" />
                </TableCell>
                <TableCell>
                  <Input v-model="u.email" class="w-48" />
                </TableCell>
                <TableCell>
                  <Select v-model="u.role" class="w-28">
                    <option value="AGENT">AGENT</option>
                    <option value="ADMIN">ADMIN</option>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select v-model="u.active" class="w-24">
                    <option :value="true">Oui</option>
                    <option :value="false">Non</option>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input v-model="u._newPassword" type="password" placeholder="Nouveau MDP" class="w-36" />
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <Button size="sm" @click="saveUser(u)">
                      <Save class="mr-2 h-4 w-4" />
                      Enregistrer
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      @click="deleteUser(u)"
                      :disabled="isCurrentUser(u.id)"
                    >
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
          <Users class="h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-muted-foreground">Aucun utilisateur trouvé</p>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="users.page <= 1"
              @click="users.page--; loadUsers()"
            >
              <ChevronLeft class="h-4 w-4" />
              Précédent
            </Button>
            <span class="text-sm text-muted-foreground">
              Page {{ users.page }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="users.page * users.pageSize >= users.total"
              @click="users.page++; loadUsers()"
            >
              Suivant
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
          <span class="text-sm text-muted-foreground">
            Total: {{ users.total }}
          </span>
        </div>
      </CardContent>
    </Card>

    <!-- ALLOCATIONS -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <FileText class="h-5 w-5" />
          Allocations de mandats
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Input
            v-model="allocFilters.q"
            placeholder="Recherche (code / email / nom)"
            class="max-w-xs"
          />
          <Select v-model="allocFilters.status" class="w-40">
            <option value="">(tous statuts)</option>
            <option value="RESERVED">RESERVED</option>
            <option value="DRAFT">DRAFT</option>
            <option value="SIGNED">SIGNED</option>
            <option value="RELEASED">RELEASED</option>
          </Select>
          <Button @click="loadAllocations">
            <Search class="mr-2 h-4 w-4" />
            Rechercher
          </Button>
        </div>

        <div v-if="allocs.items.length" class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="a in allocs.items" :key="a.id">
                <TableCell class="font-medium">{{ a.code }}</TableCell>
                <TableCell>
                  <Badge :variant="getStatusVariant(a.status)">
                    {{ a.status }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="space-y-1">
                    <div class="font-medium">{{ fullName(a.user) }}</div>
                    <div class="text-xs text-muted-foreground">{{ a.user?.email }}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {{ a.deadlineAt ? new Date(a.deadlineAt).toLocaleDateString('fr-FR') : '-' }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2 flex-wrap">
                    <Button
                      v-for="f in a.files"
                      :key="f.id"
                      variant="secondary"
                      size="sm"
                      @click="openAdminFile(f.id)"
                    >
                      <Eye class="mr-2 h-4 w-4" />
                      {{ f.kind }}
                    </Button>
                    
                    <template v-if="['RESERVED', 'DRAFT'].includes(a.status)">
                      <label 
                        class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 cursor-pointer"
                        :class="{ 'opacity-50 pointer-events-none': adminUploading[a.code]?.DRAFT }"
                      >
                        <Loader2 v-if="adminUploading[a.code]?.DRAFT" class="mr-2 h-4 w-4 animate-spin" />
                        <Upload v-else class="mr-2 h-4 w-4" />
                        + Brouillon
                        <input
                          type="file"
                          accept="application/pdf"
                          @change="adminFileChosen($event, a.code, 'DRAFT')"
                          class="hidden"
                          :disabled="adminUploading[a.code]?.DRAFT"
                        />
                      </label>
                      
                      <label 
                        class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 px-3 cursor-pointer"
                        :class="{ 'opacity-50 pointer-events-none': adminUploading[a.code]?.SIGNED }"
                      >
                        <Loader2 v-if="adminUploading[a.code]?.SIGNED" class="mr-2 h-4 w-4 animate-spin" />
                        <CheckCircle v-else class="mr-2 h-4 w-4" />
                        + Signé
                        <input
                          type="file"
                          accept="application/pdf"
                          @change="adminFileChosen($event, a.code, 'SIGNED')"
                          class="hidden"
                          :disabled="adminUploading[a.code]?.SIGNED"
                        />
                      </label>
                      
                      <Button
                        size="sm"
                        variant="destructive"
                        @click="releaseAllocation(a)"
                        title="Libérer cette allocation et remettre le numéro disponible"
                      >
                        <Unlock class="mr-2 h-4 w-4" />
                        Libérer
                      </Button>
                    </template>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-12">
          <FileText class="h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-muted-foreground">Aucune allocation trouvée</p>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="allocs.page <= 1"
              @click="allocs.page--; loadAllocations()"
            >
              <ChevronLeft class="h-4 w-4" />
              Précédent
            </Button>
            <span class="text-sm text-muted-foreground">
              Page {{ allocs.page }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="allocs.page * allocs.pageSize >= allocs.total"
              @click="allocs.page++; loadAllocations()"
            >
              Suivant
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
          <span class="text-sm text-muted-foreground">
            Total: {{ allocs.total }}
          </span>
        </div>
      </CardContent>
    </Card>

    <!-- CRÉER UN NUMÉRO DE MANDAT -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Hash class="h-5 w-5" />
          Créer un nouveau numéro de mandat
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="createMandateNumber" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="space-y-2">
              <Label for="newMandateYear">Année</Label>
              <Input 
                id="newMandateYear" 
                v-model.number="newMandate.year" 
                type="number" 
                :placeholder="String(new Date().getFullYear())" 
              />
            </div>
            
            <div class="space-y-2">
              <Label for="newMandateSeq">Numéro (seq)</Label>
              <Input 
                id="newMandateSeq" 
                v-model.number="newMandate.seq" 
                type="number" 
                placeholder="Auto si vide" 
              />
            </div>
            
            <div class="space-y-2">
              <Label for="newMandateCode">Code (optionnel)</Label>
              <Input 
                id="newMandateCode" 
                v-model="newMandate.code" 
                placeholder="Ex: 500 M 25" 
              />
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <Button type="submit">
              <Hash class="mr-2 h-4 w-4" />
              Créer le numéro
            </Button>
            <p v-if="msgCreateMandate" :class="msgCreateMandate.includes('Erreur') || msgCreateMandate.includes('❌') ? 'text-destructive' : 'text-green-600'" class="text-sm">
              {{ msgCreateMandate }}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>


    <!-- NUMÉROS DE MANDAT -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Hash class="h-5 w-5" />
          Numéros de mandat
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Input
            v-model="mandatesFilters.q"
            placeholder="Recherche code..."
            class="max-w-xs"
          />
          <Input
            v-model.number="mandatesFilters.year"
            type="number"
            placeholder="Année"
            class="w-32"
          />
          <Select v-model="mandatesFilters.status" class="w-40">
            <option value="">(tous statuts)</option>
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="RESERVED">RESERVED</option>
            <option value="SIGNED">SIGNED</option>
          </Select>
          <Button @click="loadMandates">
            <Search class="mr-2 h-4 w-4" />
            Rechercher
          </Button>
          
          <Button variant="outline" @click="syncMandateStatuses">
            <RotateCcw class="mr-2 h-4 w-4" />
            Synchroniser statuts
          </Button>
        </div>

        <div v-if="mandates.items.length" class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Année</TableHead>
                <TableHead>Seq</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="m in mandates.items" :key="`${m.id}-${m.status}`">
                <TableCell>
                  <Input v-model="m.code" class="w-32" />
                </TableCell>
                <TableCell>
                  <Input v-model.number="m.year" type="number" class="w-24" />
                </TableCell>
                <TableCell>
                  <Input v-model.number="m.seq" type="number" class="w-24" />
                </TableCell>
                <TableCell>
                  <select 
                    v-model="m.status" 
                    class="flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="RESERVED">RESERVED</option>
                    <option value="SIGNED">SIGNED</option>
                  </select>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <Button size="sm" @click="saveMandate(m)">
                      <Save class="mr-2 h-4 w-4" />
                      Enregistrer
                    </Button>
                    <Button size="sm" variant="destructive" @click="deleteMandate(m)">
                      <Trash2 class="mr-2 h-4 w-4" />
                      Supprimer
                    </Button>
                    <Button size="sm" variant="outline" @click="releaseMandate(m)">
                      <RotateCcw class="mr-2 h-4 w-4" />
                      Libérer
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-12">
          <Hash class="h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-muted-foreground">Aucun numéro trouvé</p>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="mandates.page <= 1"
              @click="mandates.page--; loadMandates()"
            >
              <ChevronLeft class="h-4 w-4" />
              Précédent
            </Button>
            <span class="text-sm text-muted-foreground">
              Page {{ mandates.page }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="mandates.page * mandates.pageSize >= mandates.total"
              @click="mandates.page++; loadMandates()"
            >
              Suivant
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
          <span class="text-sm text-muted-foreground">
            Total: {{ mandates.total }}
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import { api } from '../utils/api'
import {
  UserPlus, Users, FileText, Hash, Search, Save, Trash2,
  RotateCcw, Eye, ChevronLeft, ChevronRight, Upload, CheckCircle, Loader2, Unlock, UserCog
} from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import CardHeader from '../components/ui/card-header.vue'
import CardTitle from '../components/ui/card-title.vue'
import CardContent from '../components/ui/card-content.vue'
import Input from '../components/ui/input.vue'
import Label from '../components/ui/label.vue'
import Select from '../components/ui/select.vue'
import Badge from '../components/ui/badge.vue'
import Table from '../components/ui/table.vue'
import TableHeader from '../components/ui/table-header.vue'
import TableBody from '../components/ui/table-body.vue'
import TableRow from '../components/ui/table-row.vue'
import TableHead from '../components/ui/table-head.vue'
import TableCell from '../components/ui/table-cell.vue'

type FileKind = 'DRAFT' | 'SIGNED'

// Création de numéro de mandat
const newMandate = ref({
  year: new Date().getFullYear(),
  seq: undefined as number | undefined,
  code: ''
})
const msgCreateMandate = ref('')

async function createMandateNumber() {
  msgCreateMandate.value = ''
  try {
    const body: any = {}
    if (newMandate.value.year) body.year = newMandate.value.year
    if (newMandate.value.seq) body.seq = newMandate.value.seq
    if (newMandate.value.code) body.code = newMandate.value.code
    
    const res = await api.post('/admin/mandate-numbers', body)
    msgCreateMandate.value = `✅ Numéro ${res.item.code} créé avec succès`
    
    // Reset form
    newMandate.value = {
      year: new Date().getFullYear(),
      seq: undefined,
      code: ''
    }
    
    await loadMandates()
  } catch (error: any) {
    msgCreateMandate.value = `❌ Erreur: ${error?.message || 'Erreur lors de la création'}`
  }
}


const newUser = ref<{
  firstName?: string
  lastName?: string
  email: string
  role: 'AGENT' | 'ADMIN'
}>({ email: '', role: 'AGENT' })
const msgCreate = ref('')

async function createUser() {
  msgCreate.value = ''
  try {
    await api.post('/admin/users', newUser.value)
    msgCreate.value = '✅ Utilisateur créé ! Un email a été envoyé pour activer le compte.'
    newUser.value = { email: '', role: 'AGENT' }
    await loadUsers()
    await loadAgents()
  } catch (error: any) {
    msgCreate.value = `❌ Erreur: ${error?.message || 'Erreur lors de la création'}`
  }
}

const allocation = ref({
  userId: '',
  mandateNumberId: ''
})
const msgAllocate = ref('')
const agents = ref<UserRow[]>([])
const availableMandates = computed(() => 
  mandates.value.items.filter(m => m.status === 'AVAILABLE')
)

async function loadAgents() {
  const res = await api.get('/admin/users?role=AGENT&active=true&pageSize=200')
  agents.value = res.items
}

async function allocateMandate() {
  msgAllocate.value = ''
  try {
    const res = await api.post('/admin/allocate-mandate', allocation.value)
    msgAllocate.value = `Numéro ${res.code} alloué avec succès`
    allocation.value = { userId: '', mandateNumberId: '' }
    await Promise.all([loadAllocations(), loadMandates()])
  } catch (error: any) {
    msgAllocate.value = error?.message || 'Erreur lors de l\'allocation'
  }
}

type UserRow = {
  id: string
  firstName?: string | null
  lastName?: string | null
  email: string
  role: 'ADMIN' | 'AGENT'
  active: boolean
  _newPassword?: string
}
const users = ref({ items: [] as UserRow[], total: 0, page: 1, pageSize: 50 })
const usersFilters = ref({ q: '', role: '', active: '' })

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
  const body: any = {
    email: u.email,
    role: u.role,
    active: u.active,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null
  }
  if (u._newPassword) body.newPassword = u._newPassword
  await api.patch(`/admin/users/${u.id}`, body)
  u._newPassword = ''
  await loadUsers()
}

// ID de l'utilisateur connecté (à récupérer du store auth si disponible)
const currentUserId = ref<string | null>(null)

function isCurrentUser(userId: string) {
  return currentUserId.value === userId
}

async function deleteUser(u: UserRow) {
  const userName = fullName(u) !== '-' ? fullName(u) : u.email
  
  if (!confirm(`⚠️ Voulez-vous désactiver l'utilisateur "${userName}" ?\n\nLe compte sera désactivé mais les données seront conservées.\nVous pourrez le réactiver en changeant son statut.`)) {
    return
  }
  
  try {
    await api.del(`/admin/users/${u.id}`)
    alert(`✅ Utilisateur "${userName}" désactivé avec succès`)
    await loadUsers()
    await loadAgents()
  } catch (error: any) {
    if (error?.message?.includes('Cannot delete your own account')) {
      alert('❌ Vous ne pouvez pas désactiver votre propre compte')
    } else {
      alert(`❌ Erreur: ${error?.message || 'Erreur lors de la désactivation'}`)
    }
  }
}


type FileRow = { id: string; kind: 'DRAFT' | 'SIGNED'; createdAt?: string }
type AllocRow = {
  id: string
  code?: string
  mandateNumberId?: string
  status: 'RESERVED' | 'DRAFT' | 'SIGNED' | 'RELEASED'
  deadlineAt?: string | null
  user?: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
  } | null
  files: FileRow[]
}
const allocs = ref({ items: [] as AllocRow[], total: 0, page: 1, pageSize: 50 })
const allocFilters = ref({ q: '', status: '' })
const adminUploading = reactive<Record<string, Record<FileKind, boolean>>>({})

async function loadAllocations() {
  const p = new URLSearchParams()
  if (allocFilters.value.q) p.set('q', allocFilters.value.q)
  if (allocFilters.value.status) p.set('status', allocFilters.value.status)
  p.set('page', String(allocs.value.page))
  p.set('pageSize', String(allocs.value.pageSize))
  const res = await api.get(`/admin/mandate-allocations?${p.toString()}`)
  allocs.value.items = res.items
  allocs.value.total = res.total
  await loadMandates()
}

function fullName(u?: { firstName?: string | null; lastName?: string | null } | null) {
  if (!u) return '-'
  const f = [u.firstName, u.lastName].filter(Boolean).join(' ')
  return f || '-'
}

async function openAdminFile(fileId: string) {
  try {
    const { url } = await api.get(`/admin/files/${fileId}/url`)
    window.open(url, '_blank')
  } catch (error) {
    console.error('Erreur ouverture fichier:', error)
    alert('Impossible d\'ouvrir le fichier')
  }
}

async function adminFileChosen(e: Event, code: string, kind: FileKind) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  if (!adminUploading[code]) {
    adminUploading[code] = { DRAFT: false, SIGNED: false }
  }
  
  adminUploading[code][kind] = true
  
  try {
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
    
    await loadAllocations()
  } catch (error) {
    console.error('Erreur upload:', error)
    alert('Erreur lors de l\'upload')
  } finally {
    adminUploading[code][kind] = false
    input.value = ''
  }
}

async function releaseAllocation(alloc: AllocRow) {
  if (!confirm(`Voulez-vous vraiment libérer l'allocation ${alloc.code} ?`)) {
    return
  }
  
  try {
    await api.post(`/admin/mandate-numbers/${alloc.mandateNumberId}/release`)
    await api.patch(`/admin/mandate-allocations/${alloc.id}`, {
      status: 'RELEASED'
    })
    await loadAllocations()
    alert(`L'allocation ${alloc.code} a été libérée avec succès`)
  } catch (error) {
    console.error('Erreur lors de la libération:', error)
    alert('Erreur lors de la libération de l\'allocation')
  }
}

function getStatusVariant(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
    RESERVED: 'warning',
    DRAFT: 'secondary',
    SIGNED: 'success',
    RELEASED: 'outline',
    AVAILABLE: 'default'
  }
  return variants[status] || 'default'
}

type MandateRow = {
  id: string
  code: string
  year: number
  seq: number
  status: 'AVAILABLE' | 'RESERVED' | 'SIGNED'
}
const mandates = ref({ items: [] as MandateRow[], total: 0, page: 1, pageSize: 50 })
const mandatesFilters = ref({ q: '', year: new Date().getFullYear(), status: '' })

async function loadMandates() {
  const p = new URLSearchParams()
  if (mandatesFilters.value.q) p.set('q', mandatesFilters.value.q)
  if (mandatesFilters.value.year) p.set('year', String(mandatesFilters.value.year))
  if (mandatesFilters.value.status) p.set('status', mandatesFilters.value.status)
  p.set('page', String(mandates.value.page))
  p.set('pageSize', String(mandates.value.pageSize))
  
  // Ajouter timestamp pour éviter le cache
  p.set('_t', String(Date.now()))
  
  const res = await api.get(`/admin/mandate-numbers?${p.toString()}`)
  
  // ✅ FORCER la réactivité en recréant complètement l'objet
  mandates.value = {
    items: res.items.map((item: any) => ({
      id: item.id,
      code: item.code,
      year: item.year,
      seq: item.seq,
      status: item.status
    })),
    total: res.total,
    page: mandates.value.page,
    pageSize: mandates.value.pageSize
  }
  
  console.log('🔄 Mandats rechargés, 460 M 25:', mandates.value.items.find(m => m.code === '460 M 25'))
}

async function saveMandate(m: MandateRow) {
  await api.patch(`/admin/mandate-numbers/${m.id}`, {
    code: m.code,
    year: m.year,
    seq: m.seq,
    status: m.status
  })
  await loadMandates()
}

async function deleteMandate(m: MandateRow) {
  if (!confirm('Supprimer ce numéro ?')) return
  await api.del(`/admin/mandate-numbers/${m.id}`)
  await loadMandates()
}

async function releaseMandate(m: MandateRow) {
  await api.post(`/admin/mandate-numbers/${m.id}/release`)
  await loadMandates()
}

async function syncMandateStatuses() {
  try {
    await api.post('/admin/sync-mandate-statuses')
    await Promise.all([loadAllocations(), loadMandates()])
    alert('Synchronisation des statuts terminée')
  } catch (error) {
    console.error('Erreur lors de la synchronisation:', error)
    alert('Erreur lors de la synchronisation des statuts')
  }
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadAgents(), loadAllocations(), loadMandates()])
})
</script>