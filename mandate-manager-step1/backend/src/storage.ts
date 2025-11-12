// backend/src/storage.ts
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'

// Dossier de stockage local
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage')

export async function ensureBucket() {
  // Créer le dossier de stockage s'il n'existe pas
  if (!existsSync(STORAGE_DIR)) {
    await mkdir(STORAGE_DIR, { recursive: true })
    console.log('📁 Dossier de stockage créé:', STORAGE_DIR)
  }
}

export async function presignedPut(key: string, contentType: string) {
  // Générer un token unique pour l'upload
  const uploadToken = crypto.randomBytes(32).toString('hex')
  
  // Retourner l'URL d'upload (qui sera traitée par notre endpoint)
  return `/api/storage/upload/${uploadToken}?key=${encodeURIComponent(key)}`
}

export async function presignedGet(key: string, expiresIn = 600) {
  // Retourner l'URL de téléchargement (qui sera traitée par notre endpoint)
  return `/api/storage/download/${encodeURIComponent(key)}`
}

export async function saveFile(key: string, buffer: Buffer) {
  // Créer le chemin complet du fichier
  const filePath = path.join(STORAGE_DIR, key)
  
  // Créer les sous-dossiers si nécessaire
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  
  // Sauvegarder le fichier
  await writeFile(filePath, buffer)
  console.log('💾 Fichier sauvegardé:', key)
}

export async function getFile(key: string): Promise<Buffer> {
  const filePath = path.join(STORAGE_DIR, key)
  return await readFile(filePath)
}

export function getFilePath(key: string): string {
  return path.join(STORAGE_DIR, key)
}