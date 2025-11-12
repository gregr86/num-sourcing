// backend/src/index.ts
import { Elysia, t } from 'elysia'
import { cookie } from '@elysiajs/cookie'
import { cors } from '@elysiajs/cors'
import dayjs from 'dayjs'
import { prisma } from './prisma'
import { issueAccessToken, verifyPassword, getUserFromToken, normalizeEmail, hashPassword } from './auth'
import { ensureBucket, presignedPut, presignedGet, saveFile, getFile } from './storage'
import path from 'path'
import { runCronOnce } from './cron'

const PORT = Number(process.env.PORT ?? 3001)

const app = new Elysia()
  .use(cors({ origin: true, credentials: true }))
  .use(cookie())

  // Healthcheck
  .get('/health', () => ({ ok: true }))

  // --- AUTH: login ---
  .post(
    '/auth/login',
    async ({ body, cookie, set }) => {
      const { email, password } = body as { email: string; password: string }
      const e = normalizeEmail(email)

      console.log('🔐 Tentative de connexion:', e)

      // recherche insensible à la casse
      const user = await prisma.user.findFirst({
        where: { email: { equals: e, mode: 'insensitive' } }
      })
      
      console.log('👤 Utilisateur trouvé:', user ? `${user.email} (${user.role})` : 'AUCUN')

      if (!user || !user.active) {
        console.log('❌ Utilisateur non trouvé ou inactif')
        set.status = 401
        return { error: 'Invalid credentials' }
      }

      const ok = await verifyPassword(password, user.password)
      console.log('🔑 Vérification mot de passe:', ok ? 'OK' : 'ECHEC')
      
      if (!ok) {
        console.log('❌ Mot de passe incorrect')
        set.status = 401
        return { error: 'Invalid credentials' }
      }

      const token = await issueAccessToken({ id: user.id, email: user.email, role: user.role })
      cookie.access_token.set({
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 60 * 60 * 24 * 30 // 30 jours
      })
      
      console.log('✅ Connexion réussie pour:', user.email, '- Rôle:', user.role)
      
      return {
        ok: true,
        user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName }
      }
    },
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )

  // --- AUTH: me ---
  .get('/auth/me', async ({ cookie, set }) => {
    const user = await getUserFromToken(cookie.access_token?.value)
    if (!user) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }
    return { user }
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

  // --- ACCOUNT: update email ---
  .post(
    '/account/update-email',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthenticated' }
      }

      const { newEmail, password } = body as { newEmail: string; password: string }
      if (!newEmail || !password) {
        set.status = 400
        return { error: 'Missing fields' }
      }

      const me = await prisma.user.findUnique({ where: { id: auth.id } })
      if (!me) {
        set.status = 404
        return { error: 'User not found' }
      }

      const ok = await verifyPassword(password, me.password)
      if (!ok) {
        set.status = 400
        return { error: 'Wrong password' }
      }

      try {
        const updated = await prisma.user.update({
          where: { id: me.id },
          data: { email: normalizeEmail(newEmail) }
        })
        return { ok: true, email: updated.email }
      } catch {
        set.status = 409
        return { error: 'Email already in use' }
      }
    },
    { body: t.Object({ newEmail: t.String(), password: t.String() }) }
  )

  // --- ACCOUNT: update password ---
  .post(
    '/account/update-password',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthenticated' }
      }

      const { currentPassword, newPassword } = body as { currentPassword: string; newPassword: string }
      if (!currentPassword || !newPassword) {
        set.status = 400
        return { error: 'Missing fields' }
      }

      const me = await prisma.user.findUnique({ where: { id: auth.id } })
      if (!me) {
        set.status = 404
        return { error: 'User not found' }
      }

      const ok = await verifyPassword(currentPassword, me.password)
      if (!ok) {
        set.status = 400
        return { error: 'Wrong current password' }
      }

      await prisma.user.update({
        where: { id: me.id },
        data: { password: await hashPassword(newPassword) }
      })
      return { ok: true }
    },
    { body: t.Object({ currentPassword: t.String(), newPassword: t.String() }) }
  )

  // --- ACCOUNT: update profile (firstName, lastName) ---
  .patch(
    '/account/update-profile',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthenticated' }
      }

      const { firstName, lastName } = body as { firstName?: string | null; lastName?: string | null }

      try {
        const updated = await prisma.user.update({
          where: { id: auth.id },
          data: {
            firstName: firstName !== undefined ? firstName : undefined,
            lastName: lastName !== undefined ? lastName : undefined
          }
        })
        return { ok: true, user: { 
          id: updated.id, 
          email: updated.email, 
          role: updated.role,
          firstName: updated.firstName,
          lastName: updated.lastName
        }}
      } catch {
        set.status = 400
        return { error: 'Update failed' }
      }
    },
    { body: t.Object({ 
      firstName: t.Optional(t.Union([t.String(), t.Null()])),
      lastName: t.Optional(t.Union([t.String(), t.Null()]))
    }) }
  )

  // --- Mandats: réserver un numéro (format "460 M 25") ---
  .post('/mandates/reserve', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }
    if (auth.role !== 'AGENT') {
      set.status = 403
      return { error: 'Forbidden' }
    }

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
      next = await prisma.mandateNumber.findFirst({
        where: { status: 'AVAILABLE', year },
        orderBy: [{ seq: 'asc' }]
      })
    }

    if (!next) {
      set.status = 409
      return { error: 'No available number' }
    }

    const deadline = dayjs().add(7, 'day').toDate()
    await prisma.$transaction([
      prisma.mandateNumber.update({ where: { id: next.id }, data: { status: 'RESERVED' } }),
      prisma.mandateAllocation.create({
        data: { mandateNumberId: next.id, userId: auth.id, deadlineAt: deadline, status: 'RESERVED' }
      })
    ])
    return { code: next.code, deadlineAt: deadline }
  })

  // --- Mandats: URL pré-signée pour upload PDF ---
  .post(
    '/mandates/:code/upload-url',
    async ({ cookie, params, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth) {
        set.status = 401
        return { error: 'Unauthenticated' }
      }

      const { kind } = body as { kind: 'DRAFT' | 'SIGNED' }
      const alloc = await prisma.mandateAllocation.findFirst({
        where: { userId: auth.id, status: { in: ['RESERVED', 'DRAFT'] }, mandate: { code: params.code } },
        include: { mandate: true }
      })
      if (!alloc) {
        set.status = 404
        return { error: 'Allocation not found' }
      }

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

  // --- Lister MES mandats ---
  .get('/mandates/my', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }
    const rows = await prisma.mandateAllocation.findMany({
      where: { userId: auth.id, status: { in: ['RESERVED', 'DRAFT', 'SIGNED'] } },
      include: { mandate: true, files: true },
      orderBy: { reservedAt: 'desc' }
    })
    const items = rows.map((r) => ({
      id: r.id,
      code: r.mandate.code,
      status: r.status,
      deadlineAt: r.deadlineAt,
      files: r.files.map((f) => ({ id: f.id, kind: f.kind }))
    }))
    return { items }
  })

  // --- Obtenir mes fichiers pour un code ---
  .get('/mandates/:code/files', async ({ cookie, params, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }
    const alloc = await prisma.mandateAllocation.findFirst({
      where: { userId: auth.id, mandate: { code: params.code } },
      include: { files: true }
    })
    if (!alloc) {
      set.status = 404
      return { error: 'Allocation not found' }
    }
    return { files: alloc.files }
  })

  // --- URL GET pré-signée (mes fichiers) ---
  .get('/mandates/:code/files/:id/url', async ({ cookie, params, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }
    const file = await prisma.mandateFile.findFirst({
      where: { id: params.id, allocation: { userId: auth.id, mandate: { code: params.code } } }
    })
    if (!file) {
      set.status = 404
      return { error: 'File not found' }
    }
    const { presignedGet } = await import('./storage')
    const url = await presignedGet(file.storageKey, 600)
    return { url }
  })

  // --- ADMIN: emergency password reset (protégé) ---
  .post(
    '/admin/emergency-reset',
    async ({ headers, body, set }) => {
      const setup = process.env.SETUP_TOKEN
      if (!setup || headers['x-setup-token'] !== setup) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const { email, newPassword } = body as { email: string; newPassword: string }
      const e = normalizeEmail(email)
      await prisma.user.update({
        where: { email: e },
        data: { password: await hashPassword(newPassword), active: true }
      })
      return { ok: true }
    },
    { body: t.Object({ email: t.String(), newPassword: t.String() }) }
  )

  // --- ADMIN: créer un utilisateur ---
  .post(
    '/admin/users',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth || auth.role !== 'ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }
      const { email, password, role, firstName, lastName } = body as {
        email: string
        password: string
        role: 'AGENT' | 'ADMIN'
        firstName?: string
        lastName?: string
      }
      const e = normalizeEmail(email)
      const user = await prisma.user.create({
        data: { email: e, password: await hashPassword(password), role, firstName, lastName, active: true }
      })
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        active: user.active
      }
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
        role: t.Union([t.Literal('AGENT'), t.Literal('ADMIN')]),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String())
      })
    }
  )

  // --- ADMIN: liste utilisateurs ---
  .get('/admin/users', async ({ cookie, query, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const page = Math.max(1, Number((query as any).page ?? 1))
    const pageSize = Math.min(200, Math.max(1, Number((query as any).pageSize ?? 50)))
    const role = (query as any).role as 'ADMIN' | 'AGENT' | undefined
    const active = (query as any).active
    const q = (query as any).q as string | undefined

    const where: any = {}
    if (role) where.role = role
    if (typeof active !== 'undefined' && active !== '') where.active = active === 'true'
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } }
      ]
    }

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
        select: { id: true, email: true, role: true, active: true, createdAt: true, firstName: true, lastName: true },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])
    return { total, page, pageSize, items }
  })

  // --- ADMIN: modifier utilisateur ---
  .patch(
    '/admin/users/:id',
    async ({ cookie, params, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth || auth.role !== 'ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const { email, role, active, newPassword, firstName, lastName } = body as Partial<{
        email: string
        role: 'ADMIN' | 'AGENT'
        active: boolean
        newPassword: string
        firstName: string
        lastName: string
      }>
      const data: any = {}
      if (typeof email !== 'undefined') data.email = normalizeEmail(email)
      if (typeof role !== 'undefined') data.role = role
      if (typeof active !== 'undefined') data.active = active
      if (typeof firstName !== 'undefined') data.firstName = firstName
      if (typeof lastName !== 'undefined') data.lastName = lastName
      if (newPassword) data.password = await hashPassword(newPassword)

      try {
        const updated = await prisma.user.update({
          where: { id: params.id },
          data,
          select: { id: true, email: true, role: true, active: true, firstName: true, lastName: true }
        })
        return { ok: true, user: updated }
      } catch {
        set.status = 400
        return { error: 'Update failed (email pris ?)' }
      }
    },
    {
      body: t.Object({
        email: t.Optional(t.String()),
        role: t.Optional(t.Union([t.Literal('ADMIN'), t.Literal('AGENT')])),
        active: t.Optional(t.Boolean()),
        newPassword: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String())
      })
    }
  )

  // --- ADMIN: lister numéros de mandat ---
  .get('/admin/mandate-numbers', async ({ cookie, query, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const page = Math.max(1, Number((query as any).page ?? 1))
    const pageSize = Math.min(200, Math.max(1, Number((query as any).pageSize ?? 50)))
    const status = (query as any).status as 'AVAILABLE' | 'RESERVED' | 'SIGNED' | undefined
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

  // --- ADMIN: modifier numéro ---
  .patch(
    '/admin/mandate-numbers/:id',
    async ({ cookie, params, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth || auth.role !== 'ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const { code, year, seq, status } = body as Partial<{
        code: string
        year: number
        seq: number
        status: 'AVAILABLE' | 'RESERVED' | 'SIGNED'
      }>
      try {
        const updated = await prisma.mandateNumber.update({
          where: { id: params.id },
          data: { code: code ?? undefined, year: year ?? undefined, seq: seq ?? undefined, status: status ?? undefined }
        })
        return { ok: true, item: updated }
      } catch {
        set.status = 400
        return { error: 'Update failed (unique conflict or invalid data)' }
      }
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        year: t.Optional(t.Number()),
        seq: t.Optional(t.Number()),
        status: t.Optional(t.Union([t.Literal('AVAILABLE'), t.Literal('RESERVED'), t.Literal('SIGNED')]))
      })
    }
  )

  // --- ADMIN: supprimer numéro (sans allocations) ---
  .delete('/admin/mandate-numbers/:id', async ({ cookie, params, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const allocCount = await prisma.mandateAllocation.count({ where: { mandateNumberId: params.id } })
    if (allocCount > 0) {
      set.status = 409
      return { error: 'Cannot delete: allocations exist' }
    }

    await prisma.mandateNumber.delete({ where: { id: params.id } })
    return { ok: true }
  })

  // --- ADMIN: remettre un numéro en disponible (release) ---
  .post('/admin/mandate-numbers/:id/release', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth || auth.role !== 'ADMIN') {
    set.status = 403
    return { error: 'Forbidden' }
  }

  const active = await prisma.mandateAllocation.findFirst({
    where: { mandateNumberId: params.id, status: { in: ['RESERVED', 'DRAFT'] } }
  })
  if (!active) {
    set.status = 404
    return { error: 'No active allocation' }
  }

  await prisma.$transaction([
    prisma.mandateAllocation.update({ where: { id: active.id }, data: { status: 'RELEASED', releasedAt: new Date() } }),
    prisma.mandateNumber.update({ where: { id: params.id }, data: { status: 'AVAILABLE' } })
  ])
  return { ok: true }
})

  // --- ADMIN: exécuter la cron manuellement (tests) ---
  .post('/admin/cron-run', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }
    if (auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    await runCronOnce()
    return { ok: true }
  })

  // --- ADMIN: lister allocations + fichiers + agent ---
.get('/admin/mandate-allocations', async ({ cookie, query, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth || auth.role !== 'ADMIN') {
    set.status = 403
    return { error: 'Forbidden' }
  }

  const page = Math.max(1, Number((query as any).page ?? 1))
  const pageSize = Math.min(200, Math.max(1, Number((query as any).pageSize ?? 50)))
  const status = (query as any).status as 'RESERVED' | 'DRAFT' | 'SIGNED' | 'RELEASED' | undefined
  const q = (query as any).q as string | undefined
  const userId = (query as any).userId as string | undefined

  const where: any = {}
  if (status) {
    // ✅ NOUVEAU: Gérer les statuts multiples séparés par virgule
    if (status.includes(',')) {
      where.status = { in: status.split(',') }
    } else {
      where.status = status
    }
  }
  if (userId) where.userId = userId
  if (q) {
    where.OR = [
      { mandate: { code: { contains: q } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { firstName: { contains: q, mode: 'insensitive' } } },
      { user: { lastName: { contains: q, mode: 'insensitive' } } }
    ]
  } // ✅ ACCOLADE FERMANTE AJOUTÉE ICI !

  const [total, rows] = await Promise.all([
    prisma.mandateAllocation.count({ where }),
    prisma.mandateAllocation.findMany({
      where,
      include: { user: true, mandate: true, files: true },
      orderBy: [{ reservedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  const items = rows.map((r) => ({
    id: r.id,
    code: r.mandate?.code,
    mandateNumberId: r.mandateNumberId,
    status: r.status,
    deadlineAt: r.deadlineAt,
    reservedAt: r.reservedAt,
    user: r.user
      ? { id: r.user.id, email: r.user.email, firstName: r.user.firstName, lastName: r.user.lastName }
      : null,
    files: r.files.map((f) => ({ id: f.id, kind: f.kind, createdAt: f.createdAt }))
  }))

  return { total, page, pageSize, items }
})


  // --- ADMIN: URL GET pré-signée pour n'importe quel fichier ---
  .get('/admin/files/:id/url', async ({ cookie, params, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    const file = await prisma.mandateFile.findUnique({ where: { id: params.id } })
    if (!file) {
      set.status = 404
      return { error: 'File not found' }
    }
    const { presignedGet } = await import('./storage')
    const url = await presignedGet(file.storageKey, 600)
    return { url }
  })

  // ✅ NOUVELLE ROUTE ELYSIA: Synchroniser les statuts entre numéros et allocations
  .post('/admin/sync-mandate-statuses', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    try {
      // Récupérer toutes les allocations actives
      const allocations = await prisma.mandateAllocation.findMany({
        where: {
          status: { in: ['RESERVED', 'DRAFT', 'SIGNED'] }
        },
        include: { mandate: true }
      })
      
      // Mettre à jour le statut des numéros de mandats selon leurs allocations
      for (const alloc of allocations) {
        if (alloc.mandate) {
          let newStatus: 'AVAILABLE' | 'RESERVED' | 'SIGNED' = 'AVAILABLE'
          
          if (alloc.status === 'RESERVED') newStatus = 'RESERVED'
          else if (alloc.status === 'DRAFT') newStatus = 'RESERVED'
          else if (alloc.status === 'SIGNED') newStatus = 'SIGNED'
          
          // Mettre à jour le statut du numéro si nécessaire
          if (alloc.mandate.status !== newStatus) {
            await prisma.mandateNumber.update({
              where: { id: alloc.mandate.id },
              data: { status: newStatus }
            })
          }
        }
      }
      
      // Libérer les numéros qui n'ont plus d'allocations actives
      await prisma.mandateNumber.updateMany({
        where: {
          status: { in: ['RESERVED', 'SIGNED'] },
          allocations: {
            none: {
              status: { in: ['RESERVED', 'DRAFT', 'SIGNED'] }
            }
          }
        },
        data: { status: 'AVAILABLE' }
      })
      
      return { success: true, message: 'Statuts synchronisés avec succès' }
    } catch (error) {
      console.error('Erreur sync statuts:', error)
      set.status = 500
      return { error: 'Erreur lors de la synchronisation' }
    }
  })

  // ✅ NOUVELLE ROUTE ELYSIA: Mettre à jour une allocation spécifique
  .patch('/admin/mandate-allocations/:id', async ({ cookie, params, body, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    try {
      const { status } = body as { status: 'RESERVED' | 'DRAFT' | 'SIGNED' | 'RELEASED' }
      
      if (!['RESERVED', 'DRAFT', 'SIGNED', 'RELEASED'].includes(status)) {
        set.status = 400
        return { error: 'Statut invalide' }
      }
      
      const allocation = await prisma.mandateAllocation.update({
        where: { id: params.id },
        data: { 
          status,
          releasedAt: status === 'RELEASED' ? new Date() : undefined
        },
        include: { mandate: true }
      })
      
      // Mettre à jour le statut du numéro associé si nécessaire
      if (allocation.mandate) {
        let mandateStatus: 'AVAILABLE' | 'RESERVED' | 'SIGNED' = 'AVAILABLE'
        if (status === 'RESERVED' || status === 'DRAFT') mandateStatus = 'RESERVED'
        else if (status === 'SIGNED') mandateStatus = 'SIGNED'
        else if (status === 'RELEASED') mandateStatus = 'AVAILABLE'
        
        await prisma.mandateNumber.update({
          where: { id: allocation.mandate.id },
          data: { status: mandateStatus }
        })
      }
      
      return allocation
    } catch (error) {
      console.error('Erreur mise à jour allocation:', error)
      set.status = 500
      return { error: 'Erreur lors de la mise à jour' }
    }
  }, {
    body: t.Object({
      status: t.Union([
        t.Literal('RESERVED'),
        t.Literal('DRAFT'), 
        t.Literal('SIGNED'),
        t.Literal('RELEASED')
      ])
    })
  })

// --- STORAGE: Upload de fichiers ---
.put('/storage/upload/:token', async ({ params, request, query, set }) => {
  try {
    const key = (query as any).key
    if (!key) {
      set.status = 400
      return { error: 'Missing key parameter' }
    }

    // Lire le corps de la requête comme buffer
    const buffer = Buffer.from(await request.arrayBuffer())
    
    // Sauvegarder le fichier
    await saveFile(key, buffer)
    
    return { ok: true }
  } catch (error) {
    console.error('Erreur upload:', error)
    set.status = 500
    return { error: 'Upload failed' }
  }
})

// --- STORAGE: Téléchargement de fichiers ---
.get('/storage/download/:key', async ({ params, set }) => {
  try {
    const key = decodeURIComponent(params.key)
    const buffer = await getFile(key)
    
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${path.basename(key)}"`,
      }
    })
  } catch (error) {
    console.error('Erreur download:', error)
    set.status = 404
    return { error: 'File not found' }
  }
})

// ----- BOOTSTRAP & START -----
async function ensureBootstrapAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@sourcinginvest.local')
  const pass = process.env.ADMIN_PASSWORD || 'password'
  const exists = await prisma.user.findUnique({ where: { email } })
  if (!exists) {
    await prisma.user.create({
      data: {
        email,
        password: await hashPassword(pass),
        role: 'ADMIN',
        active: true,
        firstName: 'Admin',
        lastName: 'Bootstrap'
      }
    })
    console.log('Bootstrap admin created:', email)
  }
}

await ensureBucket().catch((e) => console.error('ensureBucket error:', e))
await ensureBootstrapAdmin().catch((e) => console.error('bootstrap admin error:', e))

app.listen(PORT)
console.log(`🚀 Elysia running at http://localhost:${PORT}`)
