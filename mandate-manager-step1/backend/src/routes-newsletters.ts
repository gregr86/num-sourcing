// backend/src/routes-newsletter.ts
// Routes à ajouter dans index.ts

import { prisma } from './prisma'
import { getUserFromToken, hashPassword } from './auth'
import { presignedPut, presignedGet, saveFile } from './storage'
import { sendAccountCreationEmail, sendPasswordResetEmail } from './email-templates'
import crypto from 'crypto'

// ==================== NEWSLETTERS ====================

// [ADMIN] Créer une newsletter
export async function createNewsletter(cookie: any, body: any, set: any) {
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

  // Générer la clé de stockage
  const timestamp = Date.now()
  const key = `newsletters/${timestamp}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`

  // Créer l'enregistrement
  const newsletter = await prisma.newsletter.create({
    data: {
      title,
      description,
      storageKey: key,
      publishedBy: auth.id
    }
  })

  // Générer l'URL de upload
  const uploadUrl = await presignedPut(key, 'application/pdf')

  return { newsletter, uploadUrl, key }
}

// [ADMIN] Liste des newsletters
export async function listNewsletters(cookie: any, query: any, set: any) {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth || auth.role !== 'ADMIN') {
    set.status = 403
    return { error: 'Forbidden' }
  }

  const page = Math.max(1, Number(query.page ?? 1))
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 20)))

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
}

// [ADMIN] Supprimer une newsletter
export async function deleteNewsletter(cookie: any, params: any, set: any) {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth || auth.role !== 'ADMIN') {
    set.status = 403
    return { error: 'Forbidden' }
  }

  await prisma.newsletter.delete({ where: { id: params.id } })
  return { ok: true }
}

// [AGENT] Liste des newsletters (lecture seule)
export async function listNewslettersAgent(cookie: any, query: any, set: any) {
  const auth = await getUserFromToken(cookie.access_token?.value)
  if (!auth) {
    set.status = 401
    return { error: 'Unauthenticated' }
  }

  const page = Math.max(1, Number(query.page ?? 1))
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 20)))

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
}

// [AGENT] Télécharger une newsletter
export async function downloadNewsletter(cookie: any, params: any, set: any) {
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
}

// ==================== PASSWORD RESET ====================

// Générer un token de réinitialisation
export async function generateResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours

  await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt
    }
  })

  return token
}

// [PUBLIC] Demander une réinitialisation
export async function requestPasswordReset(body: any, set: any) {
  const { email } = body as { email: string }
  if (!email) {
    set.status = 400
    return { error: 'Email required' }
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } }
  })

  // Ne pas révéler si l'utilisateur existe ou non
  if (!user) {
    return { ok: true, message: 'If the email exists, a reset link has been sent' }
  }

  const token = await generateResetToken(user.id)
  await sendPasswordResetEmail(user.email, user.firstName, token)

  return { ok: true, message: 'Reset link sent' }
}

// [PUBLIC] Réinitialiser le mot de passe avec token
export async function resetPasswordWithToken(body: any, set: any) {
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

  // Mettre à jour le mot de passe
  await prisma.user.update({
    where: { id: resetToken.userId },
    data: {
      password: await hashPassword(newPassword),
      active: true
    }
  })

  // Marquer le token comme utilisé
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { used: true }
  })

  return { ok: true }
}

// [PUBLIC] Vérifier la validité d'un token
export async function checkResetToken(query: any, set: any) {
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
}