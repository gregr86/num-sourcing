// backend/src/seed.ts
import { prisma } from './prisma'
import { normalizeEmail, hashPassword } from './auth'

async function upsertUserSafe(params: {
  email: string
  password: string
  role: 'ADMIN' | 'AGENT'
  firstName?: string
  lastName?: string
}) {
  const email = normalizeEmail(params.email)
  const passwordHash = await hashPassword(params.password)

  // Recherche insensible à la casse pour éviter les doublons "Foo@..."/"foo@..."
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true }
  })

  if (existing) {
    // Mise à jour par id (et on normalise l'email stocké)
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        password: passwordHash,
        role: params.role,
        active: true,
        firstName: params.firstName,
        lastName: params.lastName
      }
    })
  }

  // Création si inexistant
  return prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role: params.role,
      active: true,
      firstName: params.firstName,
      lastName: params.lastName
    }
  })
}

async function main() {
  console.log('Seeding users...')

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sourcinginvest.local'
  const adminPass  = process.env.ADMIN_PASSWORD || 'password'
  const agentEmail = process.env.AGENT_EMAIL || 'agent@sourcinginvest.local'
  const agentPass  = process.env.AGENT_PASSWORD || 'password'

  const admin = await upsertUserSafe({
    email: adminEmail,
    password: adminPass,
    role: 'ADMIN',
    firstName: 'Greg',
    lastName: 'Admin'
  })

  const agent = await upsertUserSafe({
    email: agentEmail,
    password: agentPass,
    role: 'AGENT',
    firstName: 'Agent',
    lastName: 'Test'
  })

  console.log('Admin:', admin.email, 'Agent:', agent.email)

  console.log('Seeding mandate numbers...')
  const year = new Date().getFullYear()
  const yy = String(year).slice(-2)

  const START_SEQ = Number(process.env.START_SEQ ?? 460) // point de départ 460
  const COUNT     = Number(process.env.SEED_COUNT ?? 200) // combien créer

  for (let i = 0; i < COUNT; i++) {
    const seq  = START_SEQ + i
    const code = `${seq} M ${yy}`
    await prisma.mandateNumber.upsert({
      where: { code },
      update: {}, // idempotent
      create: { code, year, seq, status: 'AVAILABLE' }
    })
  }

  console.log('Done.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
