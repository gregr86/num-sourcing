import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST || 'mailhog'
const port = Number(process.env.SMTP_PORT || 1025)
const user = process.env.SMTP_USER || ''
const pass = process.env.SMTP_PASS || ''

export const transporter = nodemailer.createTransport({
  host, port, secure: false, auth: user ? { user, pass } : undefined
})

export async function sendEmail(to: string, subject: string, text: string) {
  await transporter.sendMail({ from: 'no-reply@mandates.local', to, subject, text })
}
