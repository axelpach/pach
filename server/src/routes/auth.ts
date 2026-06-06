import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { getDb } from '../db.js'
import { organizationMemberships, users } from '../../../db/schema.js'
import { signToken, verifyPassword } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

async function buildSessionForUser(user: typeof users.$inferSelect) {
  const db = getDb()
  const memberships = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, user.id))

  const organizationIds = memberships.map((membership) => membership.organizationId)

  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    canAccessUnscoped: user.canAccessUnscoped,
    organizationIds,
  })

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canAccessUnscoped: user.canAccessUnscoped,
      organizationIds,
    },
  }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }

  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  res.json(await buildSessionForUser(user))
})

router.get('/me', requireAuth, async (req, res) => {
  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.sub)).limit(1)

  if (!user) {
    res.status(401).json({ error: 'User not found' })
    return
  }

  const session = await buildSessionForUser(user)
  const currentToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null
  const currentOrganizationIds = [...(req.user?.organizationIds ?? [])].sort()
  const freshOrganizationIds = [...session.user.organizationIds].sort()
  const tokenPayloadIsFresh =
    req.user?.email === session.user.email &&
    req.user?.name === session.user.name &&
    req.user?.canAccessUnscoped === session.user.canAccessUnscoped &&
    currentOrganizationIds.length === freshOrganizationIds.length &&
    currentOrganizationIds.every((id, index) => id === freshOrganizationIds[index])

  res.json({
    ...session,
    token: tokenPayloadIsFresh && currentToken ? currentToken : session.token,
  })
})

export default router
