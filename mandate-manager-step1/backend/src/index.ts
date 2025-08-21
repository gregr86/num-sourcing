import { Elysia, t } from 'elysia'
import { cookie } from '@elysiajs/cookie'
import { cors } from '@elysiajs/cors'
import { prisma } from './prisma'
import { issueAccessToken, verifyPassword, getUserFromToken } from './auth'
import dayjs from 'dayjs'
import { ensureBucket, presignedPut } from './storage'
import { runCronOnce } from './cron'

const app = new Elysia()
  .use(cors({ origin: true, credentials: true }))
  .use(cookie())

  .get('/health', () => ({ ok: true }))

  .post('/auth/login',
    async ({ body, set, cookie }) => {
      const { email, password } = body as { email: string; password: string }
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) { set.status = 401; return { error: 'Invalid credentials' } }
      const ok = await verifyPassword(password, user.password)
      if (!ok) { set.status = 401; return { error: 'Invalid credentials' } }
      const token = await issueAccessToken({ id: user.id, email: user.email, role: user.role })
      cookie.access_token.set({ value: token, httpOnly: true, sameSite: 'lax', secure: false, path: '/' })
      return { ok: true, role: user.role, email: user.email }
    },
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )

  .get('/auth/me', async ({ cookie, set }) => {
    const user = await getUserFromToken(cookie.access_token?.value)
    if (!user) { set.status = 401; return { error: 'Unauthenticated' } }
    return { user }
  })

  // Réserver un numéro (format "460 M 25")
  .post('/mandates/reserve', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
    // @ts-ignore
    if (auth.role !== 'AGENT') { set.status = 403; return { error: 'Forbidden' } }

    const now = new Date()
    const year = now.getFullYear()
    const yy = String(year).slice(-2)

    let next = await prisma.mandateNumber.findFirst({
      where: { status: 'AVAILABLE', year },
      orderBy: [{ seq: 'asc' }]
    })

    if (!next) {
      const START_SEQ = Number(process.env.START_SEQ ?? 460)
      const BATCH = Number(process.env.SEED_BATCH ?? 100)
      const last = await prisma.mandateNumber.findFirst({ where: { year }, orderBy: [{ seq: 'desc' }] })
      const begin = last ? last.seq + 1 : START_SEQ
      const data = Array.from({ length: BATCH }, (_, i) => {
        const seq = begin + i
        return { code: `${seq} M ${yy}`, year, seq, status: 'AVAILABLE' as const }
      })
      await prisma.mandateNumber.createMany({ data })
      next = await prisma.mandateNumber.findFirst({ where: { status: 'AVAILABLE', year }, orderBy: [{ seq: 'asc' }] })
    }

    if (!next) { set.status = 409; return { error: 'No available number' } }

    const deadline = dayjs().add(7, 'day').toDate()
    await prisma.$transaction([
      prisma.mandateNumber.update({ where: { id: next.id }, data: { status: 'RESERVED' } }),
      prisma.mandateAllocation.create({
        data: { mandateNumberId: next.id, userId: auth.id, deadlineAt: deadline, status: 'RESERVED' }
      })
    ])
    return { code: next.code, deadlineAt: deadline }
  })

  // URL pré-signée pour upload PDF
  .post('/mandates/:code/upload-url',
    async ({ cookie, params, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
      const { kind } = body as { kind: 'DRAFT' | 'SIGNED' }
      const alloc = await prisma.mandateAllocation.findFirst({
        where: { userId: auth.id, status: { in: ['RESERVED','DRAFT'] }, mandate: { code: params.code } },
        include: { mandate: true }
      })
      if (!alloc) { set.status = 404; return { error: 'Allocation not found' } }

      const key = `${params.code}/${kind.toLowerCase()}-${Date.now()}.pdf`
      const url = await presignedPut(key, 'application/pdf')

      await prisma.mandateFile.create({ data: { allocationId: alloc.id, kind, storageKey: key, sha256: '' } })
      if (kind === 'SIGNED') {
        await prisma.$transaction([
          prisma.mandateAllocation.update({ where: { id: alloc.id }, data: { status: 'SIGNED', signedAt: new Date() } }),
          prisma.mandateNumber.update({ where: { id: alloc.mandateNumberId }, data: { status: 'SIGNED' } })
        ])
      } else {
        await prisma.mandateAllocation.update({ where: { id: alloc.id }, data: { status: 'DRAFT' } })
      }
      return { uploadUrl: url, key }
    },
    { body: t.Object({ kind: t.Union([t.Literal('DRAFT'), t.Literal('SIGNED')]) }) }
  )

  // Admin: créer un utilisateur
  .post('/admin/users',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
      // @ts-ignore
      if (auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }
      const { email, password, role } = body as { email: string; password: string; role: 'AGENT' | 'ADMIN' }
      const { hashPassword } = await import('./auth')
      const user = await prisma.user.create({ data: { email, password: await hashPassword(password), role } })
      return { id: user.id, email: user.email, role: user.role }
    },
    { body: t.Object({ email: t.String(), password: t.String(), role: t.Union([t.Literal('AGENT'), t.Literal('ADMIN')]) }) }
  )

  // Admin: déclencher manuellement les relances (utile en test)
  .post('/admin/cron-run', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
    // @ts-ignore
    if (auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }
    await runCronOnce()
    return { ok: true }
  })

  // Lister les fichiers de mon allocation pour un code donné
.get('/mandates/:code/files', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
  const alloc = await prisma.mandateAllocation.findFirst({
    where: { userId: auth.id, mandate: { code: params.code } },
    include: { files: true }
  })
  if (!alloc) { set.status = 404; return { error: 'Allocation not found' } }
  return { files: alloc.files } // [{id, kind, storageKey, ...}]
})

// Obtenir une URL pré-signée de téléchargement pour un fileId
.get('/mandates/:code/files/:id/url', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
  const file = await prisma.mandateFile.findFirst({
    where: { id: params.id, allocation: { userId: auth.id, mandate: { code: params.code } } }
  })
  if (!file) { set.status = 404; return { error: 'File not found' } }
  const { presignedGet } = await import('./storage')
  const url = await presignedGet(file.storageKey, 600)
  return { url }
})

// --- LIST MY MANDATES ---
.get('/mandates/my', async ({ cookie, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
  const rows = await prisma.mandateAllocation.findMany({
    where: { userId: auth.id, status: { in: ['RESERVED','DRAFT','SIGNED'] } },
    include: { mandate: true, files: true },
    orderBy: { reservedAt: 'desc' }
  })
  const items = rows.map(r => ({
    id: r.id,
    code: r.mandate.code,
    status: r.status,
    deadlineAt: r.deadlineAt,
    files: r.files.map(f => ({ id: f.id, kind: f.kind }))
  }))
  return { items }
})

// --- FILE DOWNLOAD URL (GET presigned) ---
.get('/mandates/:code/files/:id/url', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }
  const file = await prisma.mandateFile.findFirst({
    where: { id: params.id, allocation: { userId: auth.id, mandate: { code: params.code } } }
  })
  if (!file) { set.status = 404; return { error: 'File not found' } }
  const { presignedGet } = await import('./storage')
  const url = await presignedGet(file.storageKey, 600)
  return { url }
})

// --- AUTH: logout ---
.post('/auth/logout', async ({ cookie }) => {
  cookie.access_token.set({
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0
  })
  return { ok: true }
})

// === ACCOUNT: update email ===
.post('/account/update-email',
  async ({ cookie, body, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }

    const { newEmail, password } = body as { newEmail: string; password: string }
    if (!newEmail || !password) { set.status = 400; return { error: 'Missing fields' } }

    const me = await prisma.user.findUnique({ where: { id: auth.id } })
    if (!me) { set.status = 404; return { error: 'User not found' } }

    const ok = await verifyPassword(password, me.password)
    if (!ok) { set.status = 400; return { error: 'Wrong password' } }

    try {
      const updated = await prisma.user.update({ where: { id: me.id }, data: { email: newEmail } })
      return { ok: true, email: updated.email }
    } catch {
      set.status = 409; return { error: 'Email already in use' }
    }
  },
  { body: t.Object({ newEmail: t.String(), password: t.String() }) }
)

// === ACCOUNT: update password ===
.post('/account/update-password',
  async ({ cookie, body, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) { set.status = 401; return { error: 'Unauthenticated' } }

    const { currentPassword, newPassword } = body as { currentPassword: string; newPassword: string }
    if (!currentPassword || !newPassword) { set.status = 400; return { error: 'Missing fields' } }

    const me = await prisma.user.findUnique({ where: { id: auth.id } })
    if (!me) { set.status = 404; return { error: 'User not found' } }

    const ok = await verifyPassword(currentPassword, me.password)
    if (!ok) { set.status = 400; return { error: 'Wrong current password' } }

    const { hashPassword } = await import('./auth')
    await prisma.user.update({ where: { id: me.id }, data: { password: await hashPassword(newPassword) } })
    return { ok: true }
  },
  { body: t.Object({ currentPassword: t.String(), newPassword: t.String() }) }
)

// --- ADMIN: lister les utilisateurs ---
.get('/admin/users', async ({ cookie, query, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  // @ts-ignore
  if (!auth || auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }

  const page = Math.max(1, Number((query as any).page ?? 1))
  const pageSize = Math.min(200, Math.max(1, Number((query as any).pageSize ?? 50)))
  const role = (query as any).role as ('ADMIN'|'AGENT') | undefined
  const active = (query as any).active
  const q = (query as any).q as string | undefined

  const where: any = {}
  if (role) where.role = role
  if (typeof active !== 'undefined') where.active = active === 'true'
  if (q) where.email = { contains: q, mode: 'insensitive' }

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      select: { id: true, email: true, role: true, active: true, createdAt: true },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])
  return { total, page, pageSize, items }
})

// --- ADMIN: modifier un utilisateur (email, role, active, reset MDP) ---
.patch('/admin/users/:id', async ({ cookie, params, body, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  // @ts-ignore
  if (!auth || auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }

  const { email, role, active, newPassword } = body as Partial<{ email: string; role: 'ADMIN'|'AGENT'; active: boolean; newPassword: string }>
  const data: any = {}
  if (typeof email !== 'undefined') data.email = email
  if (typeof role !== 'undefined') data.role = role
  if (typeof active !== 'undefined') data.active = active

  if (typeof newPassword !== 'undefined' && newPassword) {
    const { hashPassword } = await import('./auth')
    data.password = await hashPassword(newPassword)
  }

  try {
    const updated = await prisma.user.update({ where: { id: params.id }, data, select: { id: true, email: true, role: true, active: true } })
    return { ok: true, user: updated }
  } catch {
    set.status = 400; return { error: 'Update failed (email déjà pris ?)' }
  }
})

// === ADMIN: lister les numéros de mandat ===
.get('/admin/mandate-numbers', async ({ cookie, query, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  // @ts-ignore
  if (!auth || auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }

  const page = Math.max(1, Number((query as any).page ?? 1))
  const pageSize = Math.min(200, Math.max(1, Number((query as any).pageSize ?? 50)))
  const status = (query as any).status as ('AVAILABLE'|'RESERVED'|'SIGNED') | undefined
  const year = (query as any).year ? Number((query as any).year) : undefined
  const q = (query as any).q as string | undefined

  const where: any = {}
  if (status) where.status = status
  if (year) where.year = year
  if (q) where.code = { contains: q }

  const [total, items] = await Promise.all([
    prisma.mandateNumber.count({ where }),
    prisma.mandateNumber.findMany({
      where,
      orderBy: [{ year: 'desc' }, { seq: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  return { total, page, pageSize, items }
})

// === ADMIN: modifier un numéro ===
.patch('/admin/mandate-numbers/:id',
  async ({ cookie, params, body, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    // @ts-ignore
    if (!auth || auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }

    const { code, year, seq, status } = body as Partial<{ code: string; year: number; seq: number; status: 'AVAILABLE'|'RESERVED'|'SIGNED' }>
    try {
      const updated = await prisma.mandateNumber.update({
        where: { id: params.id },
        data: { code: code ?? undefined, year: year ?? undefined, seq: seq ?? undefined, status: status ?? undefined }
      })
      return { ok: true, item: updated }
    } catch (e: any) {
      set.status = 400
      return { error: 'Update failed (unique conflict or invalid data)' }
    }
  },
  { body: t.Object({
      code: t.Optional(t.String()),
      year: t.Optional(t.Number()),
      seq: t.Optional(t.Number()),
      status: t.Optional(t.Union([t.Literal('AVAILABLE'), t.Literal('RESERVED'), t.Literal('SIGNED')]))
    }) }
)

// === ADMIN: supprimer un numéro (si aucune allocation) ===
.delete('/admin/mandate-numbers/:id', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  // @ts-ignore
  if (!auth || auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }

  const allocCount = await prisma.mandateAllocation.count({ where: { mandateNumberId: params.id } })
  if (allocCount > 0) { set.status = 409; return { error: 'Cannot delete: allocations exist' } }

  await prisma.mandateNumber.delete({ where: { id: params.id } })
  return { ok: true }
})

// === ADMIN: remettre un n° en disponible (release allocation) ===
.post('/admin/mandate-numbers/:id/release', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  // @ts-ignore
  if (!auth || auth.role !== 'ADMIN') { set.status = 403; return { error: 'Forbidden' } }

  const active = await prisma.mandateAllocation.findFirst({
    where: { mandateNumberId: params.id, status: { in: ['RESERVED','DRAFT'] } }
  })
  if (!active) { set.status = 404; return { error: 'No active allocation' } }

  await prisma.$transaction([
    prisma.mandateAllocation.update({ where: { id: active.id }, data: { status: 'RELEASED', releasedAt: new Date() } }),
    prisma.mandateNumber.update({ where: { id: params.id }, data: { status: 'AVAILABLE' } })
  ])
  return { ok: true }
})

  .listen(3000)

ensureBucket().catch((e) => console.error('ensureBucket error:', e))
console.log(`🚀 Elysia running at http://localhost:3000`)
