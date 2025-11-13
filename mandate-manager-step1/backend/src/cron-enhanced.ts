// backend/src/cron-enhanced.ts
import cron from 'node-cron'
import dayjs from 'dayjs'
import { prisma } from './prisma'
import {
  sendDraftReminderEmail,
  sendSignedReminderEmail,
  sendMandateExpiredEmail
} from './email-templates'

export async function runCronOnce() {
  const now = new Date()
  console.log('🔄 Exécution du cron:', now.toISOString())

  // 1. Gérer les mandats expirés
  await handleExpiredMandates(now)
  
  // 2. Envoyer les rappels J+7 après réservation (dépôt brouillon)
  await sendDraftReminders()
  
  // 3. Envoyer les rappels J+7 après dépôt brouillon (dépôt signé)
  await sendSignedReminders()
}

async function handleExpiredMandates(now: Date) {
  const overdue = await prisma.mandateAllocation.findMany({
    where: { 
      status: { in: ['RESERVED', 'DRAFT'] }, 
      deadlineAt: { lt: now } 
    },
    include: { user: true, mandate: true }
  })

  for (const alloc of overdue) {
    try {
      await prisma.$transaction([
        prisma.mandateAllocation.update({
          where: { id: alloc.id },
          data: { status: 'RELEASED', releasedAt: now }
        }),
        prisma.mandateNumber.update({
          where: { id: alloc.mandateNumberId },
          data: { status: 'AVAILABLE' }
        })
      ])

      if (alloc.user?.email && alloc.mandate?.code) {
        await sendMandateExpiredEmail(
          alloc.user.email,
          alloc.user.firstName,
          alloc.mandate.code
        )
      }
      
      console.log('✅ Mandat expiré libéré:', alloc.mandate?.code)
    } catch (error) {
      console.error('❌ Erreur libération mandat:', alloc.id, error)
    }
  }
}

async function sendDraftReminders() {
  // Récupérer les allocations en statut RESERVED créées il y a 7 jours
  const sevenDaysAgo = dayjs().subtract(7, 'day').startOf('day').toDate()
  const eightDaysAgo = dayjs().subtract(8, 'day').startOf('day').toDate()

  const allocations = await prisma.mandateAllocation.findMany({
    where: {
      status: 'RESERVED',
      reservedAt: {
        gte: eightDaysAgo,
        lt: sevenDaysAgo
      }
    },
    include: { user: true, mandate: true }
  })

  for (const alloc of allocations) {
    try {
      if (alloc.user?.email && alloc.mandate?.code && alloc.deadlineAt) {
        await sendDraftReminderEmail(
          alloc.user.email,
          alloc.user.firstName,
          alloc.mandate.code,
          alloc.deadlineAt
        )
        console.log('📧 Rappel brouillon envoyé:', alloc.mandate.code, '→', alloc.user.email)
      }
    } catch (error) {
      console.error('❌ Erreur envoi rappel brouillon:', alloc.id, error)
    }
  }
}

async function sendSignedReminders() {
  // Trouver les allocations en DRAFT depuis 7 jours
  const sevenDaysAgo = dayjs().subtract(7, 'day').startOf('day').toDate()
  const eightDaysAgo = dayjs().subtract(8, 'day').startOf('day').toDate()

  const allocations = await prisma.mandateAllocation.findMany({
    where: {
      status: 'DRAFT',
      // On cherche celles qui sont passées en DRAFT il y a 7 jours
      // En pratique, on devrait avoir un champ draftUploadedAt, mais on peut utiliser la date du premier fichier DRAFT
    },
    include: {
      user: true,
      mandate: true,
      files: {
        where: { kind: 'DRAFT' },
        orderBy: { createdAt: 'asc' },
        take: 1
      }
    }
  })

  for (const alloc of allocations) {
    try {
      const draftFile = alloc.files[0]
      if (!draftFile) continue

      const draftDate = dayjs(draftFile.createdAt)
      const daysSinceDraft = dayjs().diff(draftDate, 'day')

      // Envoyer le rappel seulement si c'est pile 7 jours après le dépôt du brouillon
      if (daysSinceDraft === 7 && alloc.user?.email && alloc.mandate?.code && alloc.deadlineAt) {
        await sendSignedReminderEmail(
          alloc.user.email,
          alloc.user.firstName,
          alloc.mandate.code,
          alloc.deadlineAt
        )
        console.log('📧 Rappel signé envoyé:', alloc.mandate.code, '→', alloc.user.email)
      }
    } catch (error) {
      console.error('❌ Erreur envoi rappel signé:', alloc.id, error)
    }
  }
}

// Planifier le cron tous les jours à 07:00
cron.schedule('0 7 * * *', () => {
  console.log('⏰ Déclenchement du cron planifié')
  runCronOnce().catch(error => {
    console.error('❌ Erreur dans le cron:', error)
  })
})

console.log('✅ Cron configuré : exécution quotidienne à 07:00')