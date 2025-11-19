// backend/src/index.ts
import { Elysia, t } from 'elysia'
import { cookie } from '@elysiajs/cookie'
import { cors } from '@elysiajs/cors'
import dayjs from 'dayjs'
import crypto from 'crypto'
import { prisma } from './prisma'
import { issueAccessToken, verifyPassword, getUserFromToken, normalizeEmail, hashPassword } from './auth'
import { ensureBucket, presignedPut, presignedGet, saveFile, getFile } from './storage'
import { sendAccountCreationEmail, sendPasswordResetEmail } from './email-templates'
import path from 'path'
import './cron-enhanced'

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

      const user = await prisma.user.findFirst({
        where: { email: { equals: e, mode: 'insensitive' } }
      })
      
      console.log('👤 Utilisateur trouvé:', user ? `${user.email} (${user.role})` : 'AUCUN')

      if (!user) {
        console.log('❌ Utilisateur non trouvé')
        set.status = 401
        return { error: 'Invalid credentials' }
      }

      if (!user.active) {
        console.log('❌ Compte inactif - validation email requise')
        set.status = 403
        return { error: 'Account not activated. Please check your email to activate your account.' }
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
        maxAge: 60 * 60 * 24 * 30
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

  // --- AUTH: request password reset ---
  .post(
    '/auth/request-reset',
    async ({ body, set }) => {
      const { email } = body as { email: string }
      if (!email) {
        set.status = 400
        return { error: 'Email required' }
      }

      const user = await prisma.user.findFirst({
        where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } }
      })

      if (!user) {
        return { ok: true, message: 'If the email exists, a reset link has been sent' }
      }

      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
      
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt }
      })

      await sendPasswordResetEmail(user.email, user.firstName, token)

      return { ok: true, message: 'Reset link sent' }
    },
    { body: t.Object({ email: t.String() }) }
  )

  // --- AUTH: reset password with token ---
  .post(
    '/auth/reset-password',
    async ({ body, set }) => {
      const { token, newPassword } = body as { token: string; newPassword: string }
      
      if (!token || !newPassword) {
        set.status = 400
        return { error: 'Token and password required' }
      }

      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token },
        include: { user: true }
      })

      if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
        set.status = 400
        return { error: 'Invalid or expired token' }
      }

      await prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          password: await hashPassword(newPassword),
          active: true
        }
      })

      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      })

      return { ok: true }
    },
    { body: t.Object({ token: t.String(), newPassword: t.String() }) }
  )

  // --- AUTH: check reset token ---
  .get('/auth/check-reset-token', async ({ query, set }) => {
    const { token } = query as { token: string }
    
    if (!token) {
      set.status = 400
      return { valid: false, error: 'Token required' }
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true }
        }
      }
    })

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return { valid: false }
    }

    return {
      valid: true,
      user: {
        email: resetToken.user.email,
        firstName: resetToken.user.firstName,
        lastName: resetToken.user.lastName
      }
    }
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

  // --- ACCOUNT: update profile ---
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

  // --- MANDATES: reserve ---
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
      prisma.mandateNumber.update({ 
        where: { id: next.id }, 
        data: { status: 'RESERVED' }
      }),
      prisma.mandateAllocation.create({
        data: { mandateNumberId: next.id, userId: auth.id, deadlineAt: deadline, status: 'RESERVED' }
      })
    ])
    
    return { code: next.code, deadlineAt: deadline }
  })

  // --- MANDATES: upload URL ---
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

  // --- MANDATES: my list ---
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

  // --- MANDATES: files for code ---
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

  // --- MANDATES: file download URL ---
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
    const url = await presignedGet(file.storageKey, 600)
    return { url }
  })

  // --- NEWSLETTERS: list (agent) ---
  .get('/newsletters', async ({ cookie, query, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }

    const page = Math.max(1, Number((query as any).page ?? 1))
    const pageSize = Math.min(50, Math.max(1, Number((query as any).pageSize ?? 20)))

    const [total, items] = await Promise.all([
      prisma.newsletter.count(),
      prisma.newsletter.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    return { total, page, pageSize, items }
  })

  // --- NEWSLETTERS: download ---
  .get('/newsletters/:id/download', async ({ cookie, params, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth) {
      set.status = 401
      return { error: 'Unauthenticated' }
    }

    const newsletter = await prisma.newsletter.findUnique({
      where: { id: params.id }
    })

    if (!newsletter) {
      set.status = 404
      return { error: 'Newsletter not found' }
    }

    const url = await presignedGet(newsletter.storageKey, 600)
    return { url }
  })

  // --- ADMIN: emergency password reset ---
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

  // --- ADMIN: create user ---
.post(
  '/admin/users',
  async ({ cookie, body, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }
    
    const { email, role, firstName, lastName } = body as {
      email: string
      role: 'AGENT' | 'ADMIN'
      firstName?: string
      lastName?: string
    }
    
    const e = normalizeEmail(email)
    
    // Générer un mot de passe temporaire aléatoire (non utilisable)
    const tempPassword = crypto.randomBytes(32).toString('hex')
    
    try {
      const user = await prisma.user.create({
        data: { 
          email: e, 
          password: await hashPassword(tempPassword), 
          role, 
          firstName, 
          lastName, 
          active: false // Inactif jusqu'à validation par email
        }
      })

      // Générer un token de reset valide 7 jours
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt }
      })

      // Envoyer l'email de création de compte
      await sendAccountCreationEmail(user.email, user.firstName, token)

      console.log(`✅ Utilisateur créé: ${user.email} - Email envoyé`)

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        active: user.active
      }
    } catch (error: any) {
      console.error('❌ Erreur création utilisateur:', error)
      if (error.code === 'P2002') {
        set.status = 409
        return { error: 'Email already exists' }
      }
      set.status = 500
      return { error: 'Failed to create user' }
    }
  },
  {
    body: t.Object({
      email: t.String(),
      role: t.Union([t.Literal('AGENT'), t.Literal('ADMIN')]),
      firstName: t.Optional(t.String()),
      lastName: t.Optional(t.String())
    })
  }
)


  // --- ADMIN: list users ---
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

  // --- ADMIN: update user ---
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

// --- ADMIN: delete (deactivate) user ---
.delete('/admin/users/:id', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth || auth.role !== 'ADMIN') {
    set.status = 403
    return { error: 'Forbidden' }
  }

  // Empêcher de se supprimer soi-même
  if (auth.id === params.id) {
    set.status = 400
    return { error: 'Cannot delete your own account' }
  }

  try {
    // Vérifier si l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, firstName: true, lastName: true, active: true }
    })

    if (!user) {
      set.status = 404
      return { error: 'User not found' }
    }

    console.log(`🔒 Désactivation de l'utilisateur: ${user.email}`)

    // ✅ Désactiver l'utilisateur et supprimer les tokens de reset
    await prisma.$transaction([
      // 1. Désactiver le compte
      prisma.user.update({
        where: { id: params.id },
        data: { active: false }
      }),
      
      // 2. Supprimer les tokens de reset pour empêcher la réactivation par email
      prisma.passwordResetToken.deleteMany({
        where: { userId: params.id }
      })
    ])

    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
    console.log(`✅ Utilisateur ${userName} (${user.email}) désactivé - connexion impossible`)
    console.log(`📁 Allocations, fichiers et données conservés`)

    return { 
      ok: true,
      message: `User ${userName} deactivated successfully`
    }
  } catch (error: any) {
    console.error('❌ Error deactivating user:', error)
    set.status = 500
    return { error: 'Failed to deactivate user' }
  }
})



  // --- ADMIN: list mandate numbers ---
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

  // --- ADMIN: update mandate number ---
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

  // --- ADMIN: delete mandate number ---
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

  // --- ADMIN: release mandate number ---
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

  // --- ADMIN: run cron manually ---
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
    const { runCronOnce } = await import('./cron-enhanced')
    await runCronOnce()
    return { ok: true }
  })

  // --- ADMIN: allocate mandate ---
  .post(
    '/admin/allocate-mandate',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth || auth.role !== 'ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const { userId, mandateNumberId } = body as { userId: string; mandateNumberId: string }
      
      const mandate = await prisma.mandateNumber.findUnique({
        where: { id: mandateNumberId }
      })
      
      if (!mandate) {
        set.status = 404
        return { error: 'Mandate number not found' }
      }
      
      if (mandate.status !== 'AVAILABLE') {
        set.status = 409
        return { error: 'Mandate number is not available' }
      }
      
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })
      
      if (!user) {
        set.status = 404
        return { error: 'User not found' }
      }
      
      if (user.role !== 'AGENT') {
        set.status = 400
        return { error: 'User must be an agent' }
      }

      const now = new Date()
      const deadline = dayjs().add(7, 'day').toDate()

      await prisma.$transaction([
        prisma.mandateNumber.update({
          where: { id: mandateNumberId },
          data: { status: 'RESERVED' }
        }),
        prisma.mandateAllocation.create({
          data: {
            mandateNumberId,
            userId,
            status: 'RESERVED',
            deadlineAt: deadline,
            reservedAt: now
          }
        })
      ])

      return { ok: true, code: mandate.code, deadlineAt: deadline }
    },
    {
      body: t.Object({
        userId: t.String(),
        mandateNumberId: t.String()
      })
    }
  )

  // --- ADMIN: list allocations ---
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
    }

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

  // --- ADMIN: get file URL ---
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
    const url = await presignedGet(file.storageKey, 600)
    return { url }
  })

  // --- ADMIN: sync mandate statuses ---
  .post('/admin/sync-mandate-statuses', async ({ cookie, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    try {
      const allocations = await prisma.mandateAllocation.findMany({
        where: { status: { in: ['RESERVED', 'DRAFT', 'SIGNED'] } },
        include: { mandate: true }
      })
      
      for (const alloc of allocations) {
        if (alloc.mandate) {
          let newStatus: 'AVAILABLE' | 'RESERVED' | 'SIGNED' = 'AVAILABLE'
          if (alloc.status === 'RESERVED' || alloc.status === 'DRAFT') {
            newStatus = 'RESERVED'
          } else if (alloc.status === 'SIGNED') {
            newStatus = 'SIGNED'
          }
          
          if (alloc.mandate.status !== newStatus) {
            await prisma.mandateNumber.update({
              where: { id: alloc.mandate.id },
              data: { status: newStatus }
            })
          }
        }
      }
      
      await prisma.mandateNumber.updateMany({
        where: {
          status: { in: ['RESERVED', 'SIGNED'] },
          allocations: {
            none: { status: { in: ['RESERVED', 'DRAFT', 'SIGNED'] } }
          }
        },
        data: { status: 'AVAILABLE' }
      })
      
      return { success: true, message: 'Statuts synchronisés' }
    } catch (error) {
      console.error('Erreur sync:', error)
      set.status = 500
      return { error: 'Erreur lors de la synchronisation' }
    }
  })

  // --- ADMIN: update allocation ---
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

  // --- ADMIN: create newsletter ---
  .post(
    '/admin/newsletters',
    async ({ cookie, body, set }) => {
      const auth = await getUserFromToken(cookie.access_token?.value)
      if (!auth || auth.role !== 'ADMIN') {
        set.status = 403
        return { error: 'Forbidden' }
      }

      const { title, description } = body as { title: string; description?: string }
      if (!title) {
        set.status = 400
        return { error: 'Title required' }
      }

      const timestamp = Date.now()
      const key = `newsletters/${timestamp}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`

      const newsletter = await prisma.newsletter.create({
        data: {
          title,
          description,
          storageKey: key,
          publishedBy: auth.id
        }
      })

      const uploadUrl = await presignedPut(key, 'application/pdf')
      return { newsletter, uploadUrl, key }
    },
    { body: t.Object({ title: t.String(), description: t.Optional(t.String()) }) }
  )

  // --- ADMIN: list newsletters ---
  .get('/admin/newsletters', async ({ cookie, query, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const page = Math.max(1, Number((query as any).page ?? 1))
    const pageSize = Math.min(50, Math.max(1, Number((query as any).pageSize ?? 20)))

    const [total, items] = await Promise.all([
      prisma.newsletter.count(),
      prisma.newsletter.findMany({
        include: {
          publisher: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    return { total, page, pageSize, items }
  })

  // --- ADMIN: delete newsletter ---
  .delete('/admin/newsletters/:id', async ({ cookie, params, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    await prisma.newsletter.delete({ where: { id: params.id } })
    return { ok: true }
  })

  // --- ADMIN: create mandate number ---
  .post('/admin/mandate-numbers', async ({ cookie, body, set }) => {
    const auth = await getUserFromToken(cookie.access_token?.value)
    if (!auth || auth.role !== 'ADMIN') {
      set.status = 403
      return { error: 'Forbidden' }
    }

    const { code, year, seq } = body as {
      code?: string
      year?: number
      seq?: number
    }

    try {
      // Si aucune donnée fournie, générer automatiquement
      const currentYear = new Date().getFullYear()
      const targetYear = year ?? currentYear
      const yy = String(targetYear).slice(-2)

      let targetSeq: number
      let targetCode: string

      if (seq !== undefined) {
        // Utiliser le seq fourni
        targetSeq = seq
        targetCode = code ?? `${seq} M ${yy}`
      } else {
        // Trouver le prochain numéro disponible
        const last = await prisma.mandateNumber.findFirst({
          where: { year: targetYear },
          orderBy: { seq: 'desc' }
        })
        const START_SEQ = Number(process.env.START_SEQ ?? 460)
        targetSeq = last ? last.seq + 1 : START_SEQ
        targetCode = code ?? `${targetSeq} M ${yy}`
      }

      const created = await prisma.mandateNumber.create({
        data: {
          code: targetCode,
          year: targetYear,
          seq: targetSeq,
          status: 'AVAILABLE'
        }
      })

      return { ok: true, item: created }
    } catch (error: any) {
      console.error('Erreur création numéro:', error)
      if (error.code === 'P2002') {
        set.status = 409
        return { error: 'Ce numéro existe déjà (code ou seq dupliqué)' }
      }
      set.status = 500
      return { error: 'Erreur lors de la création' }
    }
  }, {
    body: t.Object({
      code: t.Optional(t.String()),
      year: t.Optional(t.Number()),
      seq: t.Optional(t.Number())
    })
  })


  // --- STORAGE: upload ---
  .put('/storage/upload/:token', async ({ params, request, query, set }) => {
    try {
      const key = (query as any).key
      if (!key) {
        set.status = 400
        return { error: 'Missing key parameter' }
      }

      const buffer = Buffer.from(await request.arrayBuffer())
      await saveFile(key, buffer)
      
      return { ok: true }
    } catch (error) {
      console.error('Erreur upload:', error)
      set.status = 500
      return { error: 'Upload failed' }
    }
  })

  // --- STORAGE: download ---
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