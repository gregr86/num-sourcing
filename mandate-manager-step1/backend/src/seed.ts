// backend/src/seed.ts
import { prisma } from './prisma'
import { hashPassword } from './auth'

async function main() {
  console.log('Seeding users...')
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sourcinginvest.local'
  const adminPass  = process.env.ADMIN_PASSWORD || 'password'
  const agentEmail = process.env.AGENT_EMAIL || 'agent@sourcinginvest.local'
  const agentPass  = process.env.AGENT_PASSWORD || 'password'

  // backend/src/seed.ts
const admin = await prisma.user.upsert({
  where: { email: adminEmail },
  update: { password: await hashPassword(adminPass), role: 'ADMIN', active: true },
  create: { email: adminEmail, password: await hashPassword(adminPass), role: 'ADMIN', active: true }
})

const agent = await prisma.user.upsert({
  where: { email: agentEmail },
  update: { password: await hashPassword(agentPass), role: 'AGENT', active: true },
  create: { email: agentEmail, password: await hashPassword(agentPass), role: 'AGENT', active: true }
})
  console.log('Admin:', admin.email, 'Agent:', agent.email)

  console.log('Seeding mandate numbers...')
  const year = new Date().getFullYear()
  const yy = String(year).slice(-2)

  const START_SEQ = Number(process.env.START_SEQ ?? 460) // point de départ 460
  const COUNT = Number(process.env.SEED_COUNT ?? 200)    // combien créer

  for (let i = 0; i < COUNT; i++) {
    const seq = START_SEQ + i
    const code = `${seq} M ${yy}`
    await prisma.mandateNumber.upsert({
      where: { code },
      update: {},
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
