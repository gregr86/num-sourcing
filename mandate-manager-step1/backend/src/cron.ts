import cron from 'node-cron'
import dayjs from 'dayjs'
import { prisma } from './prisma'
import { sendEmail } from './mailer'

export async function runCronOnce() {
  const now = new Date()

  // Overdue -> release
  const overdue = await prisma.mandateAllocation.findMany({
    where: { status: { in: ['RESERVED','DRAFT'] }, deadlineAt: { lt: now } },
    include: { user: true, mandate: true }
  })
  for (const a of overdue) {
    await prisma.$transaction([
      prisma.mandateAllocation.update({ where: { id: a.id }, data: { status: 'RELEASED', releasedAt: now } }),
      prisma.mandateNumber.update({ where: { id: a.mandateNumberId }, data: { status: 'AVAILABLE' } })
    ])
    if (a.user?.email && a.mandate?.code)
      await sendEmail(a.user.email, `Numéro ${a.mandate.code} récupéré`, `Le délai est dépassé, le numéro est remis en disponible.`)
  }

  // R1 (J+3) & R2 (J+6)
  const allocs = await prisma.mandateAllocation.findMany({
    where: { status: { in: ['RESERVED','DRAFT'] } },
    include: { user: true, mandate: true }
  })
  const today = dayjs().startOf('day')
  for (const a of allocs) {
    if (!a.user?.email || !a.mandate?.code) continue
    const r1 = dayjs(a.reservedAt).add(3, 'day').startOf('day')
    const r2 = dayjs(a.reservedAt).add(6, 'day').startOf('day')
    if (today.isSame(r1)) await sendEmail(a.user.email, `Rappel (R1) - ${a.mandate.code}`, `Merci de déposer le mandat signé avant le ${dayjs(a.deadlineAt).format('DD/MM/YYYY')}.`)
    if (today.isSame(r2)) await sendEmail(a.user.email, `Dernier rappel (R2) - ${a.mandate.code}`, `Dernier rappel avant récupération automatique à l'échéance.`)
  }
}

// Planifié 07:00 tous les jours
cron.schedule('0 7 * * *', () => runCronOnce())
