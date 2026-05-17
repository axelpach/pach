import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { getDb } from '../db.js'
import { users } from '../../../db/schema.js'
import { signToken, verifyPassword } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

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

  const token = signToken({ sub: user.id, email: user.email, name: user.name })
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
