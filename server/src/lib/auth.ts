import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.ZERO_AUTH_SECRET || ''
const JWT_EXPIRES_IN = '7d'

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('ZERO_AUTH_SECRET not set — auth will fail at runtime')
}

export interface JWTPayload {
  sub: string
  email: string
  name: string | null
  canAccessUnscoped: boolean
  organizationIds: string[]
  iat?: number
  exp?: number
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload
}
