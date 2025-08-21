// backend/src/storage.ts
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ... (tes clients s3Internal / s3Public comme tu les as maintenant)

export async function presignedGet(key: string, expiresIn = 600) {
  const cmd = new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })
  return getSignedUrl(s3Public, cmd, { expiresIn })
}

const internalEndpoint = process.env.S3_ENDPOINT!          // ex: http://minio:9000 (réseau Docker)
const publicEndpoint   = process.env.PUBLIC_S3_ENDPOINT || internalEndpoint // ex: http://localhost:9000 (depuis l'hôte)
const bucket = process.env.S3_BUCKET!
const accessKeyId = process.env.S3_ACCESS_KEY!
const secretAccessKey = process.env.S3_SECRET_KEY!

// client interne pour parler à MinIO depuis le backend
const s3Internal = new S3Client({
  region: 'eu-west-1',
  endpoint: internalEndpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey }
})

// client "public" uniquement pour SIGNER les URLs avec l'host public
const s3Public = new S3Client({
  region: 'eu-west-1',
  endpoint: publicEndpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey }
})

export async function ensureBucket() {
  try { await s3Internal.send(new HeadBucketCommand({ Bucket: bucket })) }
  catch { await s3Internal.send(new CreateBucketCommand({ Bucket: bucket })) }
}

export async function presignedPut(key: string, contentType: string) {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  // on signe avec l'endpoint public -> l’URL renvoyée contiendra localhost:9000 et sera directement utilisable depuis ta machine et le navigateur
  return getSignedUrl(s3Public, cmd, { expiresIn: 600 })
}
