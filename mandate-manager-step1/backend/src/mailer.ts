import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST || 'localhost'
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER || ''
const pass = process.env.SMTP_PASS || ''
const from = process.env.FROM_EMAIL || 'no-reply@mandates.local'

export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true pour 465, false pour 587
  auth: user ? { user, pass } : undefined,
  tls: {
    // Ne pas échouer sur des certificats invalides
    rejectUnauthorized: false
  }
})

export async function sendEmail(to: string, subject: string, text: string) {
  try {
    await transporter.sendMail({ from, to, subject, text })
    console.log(`✅ Email envoyé à ${to}`)
  } catch (error) {
    console.error('❌ Erreur envoi email:', error)
    throw error
  }
}
