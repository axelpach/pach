import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../db/schema.js'

const connectionString = process.env.DATABASE_URL || 'postgres://pach:pach@localhost:5435/pach'

let _client: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!_db) {
    _client = postgres(connectionString)
    _db = drizzle(_client, { schema })
  }
  return _db
}

export function getConnection() {
  if (!_client) getDb()
  return _client!
}
