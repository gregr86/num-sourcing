import { prisma } from './prisma'

async function cleanupUser(email: string) {
  try {
    console.log(`🔍 Recherche de l'utilisateur: ${email}`)
    
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    })

    if (!user) {
      console.log('❌ Utilisateur non trouvé')
      return
    }

    console.log(`✅ Utilisateur trouvé: ${user.email} (ID: ${user.id})`)
    console.log(`   - Rôle: ${user.role}`)
    console.log(`   - Actif: ${user.active}`)

    // Compter les données liées
    const tokenCount = await prisma.passwordResetToken.count({
      where: { userId: user.id }
    })
    const allocCount = await prisma.mandateAllocation.count({
      where: { userId: user.id }
    })

    console.log(`\n📊 Données à supprimer:`)
    console.log(`   - ${tokenCount} token(s) de reset`)
    console.log(`   - ${allocCount} allocation(s)`)

    console.log(`\n🗑️  Suppression en cours...`)

    await prisma.$transaction([
      // Supprimer les tokens de reset
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id }
      }),
      
      // Supprimer les fichiers liés aux allocations
      prisma.mandateFile.deleteMany({
        where: {
          allocation: {
            userId: user.id
          }
        }
      }),
      
      // Supprimer les allocations
      prisma.mandateAllocation.deleteMany({
        where: { userId: user.id }
      }),
      
      // Supprimer l'utilisateur
      prisma.user.delete({
        where: { id: user.id }
      })
    ])

    console.log(`✅ Utilisateur ${user.email} supprimé complètement\n`)

  } catch (error) {
    console.error('❌ Erreur:', error)
  } finally {
    await prisma.$disconnect()
  }
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: bun src/cleanup-user.ts email@example.com')
  process.exit(1)
}

cleanupUser(email)
