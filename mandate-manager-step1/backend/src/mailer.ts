import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST || 'localhost'
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER || ''
const pass = process.env.SMTP_PASS || ''
const from = process.env.FROM_EMAIL || 'no-reply@mandates.local'

export const transporter = nodemailer.createTransport({
  host,
  port,
  // Sur le port 587, secure doit être FALSE (on utilise STARTTLS après la connexion)
  secure: false, 
  // ✅ FORCE IPV4 : Indispensable avec Bun pour éviter les timeouts
  family: 4, 
  auth: user ? { user, pass } : undefined,
  tls: {
    // Permet d'accepter les certificats OVH même si la chaîne de confiance est complexe
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  },
  // Délais augmentés pour la stabilité
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  logger: true,
  debug: true
})

export async function sendEmail(to: string, subject: string, text: string) {
  try {
    console.log(`📨 Connexion Exchange ${host}:${port} pour ${to}...`)
    const info = await transporter.sendMail({ from, to, subject, text })
    console.log(`✅ Email envoyé via Exchange (ID: ${info.messageId})`)
  } catch (error) {
    console.error('❌ Erreur Exchange:', error)
    throw error
  }
}