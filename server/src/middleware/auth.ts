import type { NextFunction, Request, Response } from 'express'
import { verifyToken, type JWTPayload } from '../lib/auth.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const user = verifyToken(token)
    req.user = { ...user, organizationIds: user.organizationIds ?? [] }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireUnscopedAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.canAccessUnscoped) {
    res.status(403).json({ error: 'Not authorized for workspace-level content' })
    return
  }
  next()
}
