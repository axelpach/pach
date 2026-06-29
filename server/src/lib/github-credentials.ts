import { eq } from 'drizzle-orm'
import { githubConnections, githubRepositories } from '../../../db/schema.js'
import { getDb } from '../db.js'
import { decryptSecret } from './secret-encryption.js'

export function readEnvGithubToken() {
  return process.env.PACH_AGENT_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null
}

export async function readGithubTokenForRepository(repositoryId: string | null | undefined) {
  if (repositoryId) {
    const db = getDb()
    const [repository] = await db
      .select()
      .from(githubRepositories)
      .where(eq(githubRepositories.id, repositoryId))
      .limit(1)

    if (repository?.connectionId) {
      const token = await readGithubTokenForConnection(repository.connectionId)
      if (token) return token
    }
  }

  return readEnvGithubToken()
}

export async function readGithubTokenForConnection(connectionId: string) {
  const db = getDb()
  const [connection] = await db
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.id, connectionId))
    .limit(1)

  if (!connection || connection.status !== 'active') return null

  const now = new Date()
  await db
    .update(githubConnections)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(githubConnections.id, connection.id))

  return decryptSecret(connection.encryptedCredential)
}
