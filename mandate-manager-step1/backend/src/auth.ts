import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@prisma/client'

export const normalizeEmail = (s: string) => s.trim().toLowerCase()
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12)
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)

const encoder = new TextEncoder()
const secretKey = encoder.encode(process.env.JWT_SECRET || 'change_me')


export async function issueAccessToken(user: { id: string; email: string; role: Role }) {
  const jwt = await new SignJWT({ sub: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES || '900s')
    .sign(secretKey)
  return jwt
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey)
  return payload as any
}

export type AuthUser = { id: string; email: string; role: Role }

export async function getUserFromToken(token?: string): Promise<AuthUser | null> {
  if (!token) return null
  try {
    const payload = await verifyAccessToken(token)
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } })
    if (!user || !user.active) return null
    return { id: user.id, email: user.email, role: user.role }
  } catch {
    return null
  }
}

export function mustBe(role: Role) {
  return (u: AuthUser | null) => {
    if (!u) throw new Error('UNAUTHENTICATED')
    if (u.role !== role) throw new Error('FORBIDDEN')
  }
}