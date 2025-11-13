// backend/src/index-modifications.ts
// Ce fichier contient les modifications à apporter au fichier index.ts existant

// ============= IMPORTS À AJOUTER EN HAUT DU FICHIER =============
import { sendAccountCreationEmail } from './email-templates'
import { generateResetToken } from './routes-newsletter'
import './cron-enhanced' // Remplace l'import de './cron'

// ============= ROUTES À AJOUTER =============

// --- NEWSLETTERS (ADMIN) ---
app.post(
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

app.get('/admin/newsletters', async ({ cookie, query, set }) => {
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

app.delete('/admin/newsletters/:id', async ({ cookie, params, set }) => {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth || auth.role !== 'ADMIN') {
    set.status = 403
    return { error: 'Forbidden' }
  }

  await prisma.newsletter.delete({ where: { id: params.id } })
  return { ok: true }
})

// --- NEWSLETTERS (AGENT) ---
app.get('/newsletters', async ({ cookie, query, set }) => {
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

app.get('/newsletters/:id/download', async ({ cookie, params, set }) => {
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

// --- PASSWORD RESET ---
app.post(
  '/auth/request-reset',
  async ({ body, set }) => {
    const { email } = body as { email: string }
    if (!email) {
      set.status = 400
      return { error: 'Email required' }
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } }
    })

    if (!user) {
      return { ok: true, message: 'If the email exists, a reset link has been sent' }
    }

    const token = await generateResetToken(user.id)
    await sendPasswordResetEmail(user.email, user.firstName, token)

    return { ok: true, message: 'Reset link sent' }
  },
  { body: t.Object({ email: t.String() }) }
)

app.post(
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

app.get('/auth/check-reset-token', async ({ query, set }) => {
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

// ============= MODIFICATION DE LA ROUTE CREATEUSER =============
// Dans la route POST /admin/users, ajouter après la création de l'utilisateur :

// Générer un token de reset et envoyer l'email
const token = await generateResetToken(user.id)
await sendAccountCreationEmail(user.email, user.firstName, token)