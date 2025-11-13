// backend/src/email-templates.ts
import { sendEmail } from './mailer'

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

export async function sendAccountCreationEmail(
  email: string,
  firstName: string | null,
  token: string
) {
  const resetLink = `${BASE_URL}/reset-password?token=${token}`
  const name = firstName || email.split('@')[0]
  
  const subject = 'Bienvenue sur Mandate Manager'
  const text = `
Bonjour ${name},

Votre compte a été créé sur Mandate Manager.

Pour définir votre mot de passe et activer votre compte, veuillez cliquer sur le lien ci-dessous :
${resetLink}

Ce lien est valide pendant 7 jours.

Cordialement,
L'équipe Mandate Manager
  `.trim()

  await sendEmail(email, subject, text)
}

export async function sendDraftReminderEmail(
  email: string,
  firstName: string | null,
  mandateCode: string,
  deadline: Date
) {
  const name = firstName || email.split('@')[0]
  const deadlineStr = deadline.toLocaleDateString('fr-FR')
  
  const subject = `Rappel : Dépôt du mandat ${mandateCode} (brouillon)`
  const text = `
Bonjour ${name},

Nous vous rappelons que vous avez réservé le numéro de mandat ${mandateCode}.

Merci de déposer le mandat en version brouillon avant le ${deadlineStr}.

Vous pouvez vous connecter à votre espace agent pour effectuer ce dépôt :
${BASE_URL}/agent

Cordialement,
L'équipe Mandate Manager
  `.trim()

  await sendEmail(email, subject, text)
}

export async function sendSignedReminderEmail(
  email: string,
  firstName: string | null,
  mandateCode: string,
  deadline: Date
) {
  const name = firstName || email.split('@')[0]
  const deadlineStr = deadline.toLocaleDateString('fr-FR')
  
  const subject = `Rappel : Dépôt du mandat ${mandateCode} (signé)`
  const text = `
Bonjour ${name},

Nous vous rappelons que vous avez déposé le brouillon du mandat ${mandateCode}.

Merci de déposer le mandat signé avant le ${deadlineStr}.

Vous pouvez vous connecter à votre espace agent pour effectuer ce dépôt :
${BASE_URL}/agent

Cordialement,
L'équipe Mandate Manager
  `.trim()

  await sendEmail(email, subject, text)
}

export async function sendMandateExpiredEmail(
  email: string,
  firstName: string | null,
  mandateCode: string
) {
  const name = firstName || email.split('@')[0]
  
  const subject = `Numéro ${mandateCode} récupéré`
  const text = `
Bonjour ${name},

Le délai de dépôt du mandat ${mandateCode} est dépassé.

Le numéro a été automatiquement remis en disponibilité.

Cordialement,
L'équipe Mandate Manager
  `.trim()

  await sendEmail(email, subject, text)
}

export async function sendPasswordResetEmail(
  email: string,
  firstName: string | null,
  token: string
) {
  const resetLink = `${BASE_URL}/reset-password?token=${token}`
  const name = firstName || email.split('@')[0]
  
  const subject = 'Réinitialisation de votre mot de passe'
  const text = `
Bonjour ${name},

Vous avez demandé la réinitialisation de votre mot de passe.

Pour définir un nouveau mot de passe, veuillez cliquer sur le lien ci-dessous :
${resetLink}

Ce lien est valide pendant 24 heures.

Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.

Cordialement,
L'équipe Mandate Manager
  `.trim()

  await sendEmail(email, subject, text)
}