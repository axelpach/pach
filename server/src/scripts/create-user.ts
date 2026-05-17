import 'dotenv/config'
import { getDb, getConnection } from '../db.js'
import { users } from '../../../db/schema.js'
import { hashPassword } from '../lib/auth.js'

const [, , email, password, ...nameParts] = process.argv
const name = nameParts.join(' ') || null

if (!email || !password) {
  console.error('Usage: tsx src/scripts/create-user.ts <email> <password> [name]')
  process.exit(1)
}

const db = getDb()
const passwordHash = await hashPassword(password)

const [user] = await db
  .insert(users)
  .values({ email, passwordHash, name })
  .returning({ id: users.id, email: users.email, name: users.name })

console.log('Created user:', user)
await getConnection().end()
