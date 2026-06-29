import { Router, type Request } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import {
  githubConnections,
  githubRepositories,
  organizationRepositories,
  organizations,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'
import { readGithubTokenForConnection } from '../lib/github-credentials.js'
import { encryptSecret, secretLast4 } from '../lib/secret-encryption.js'

const router = Router()

type GithubRepositoryResponse = {
  id: number
  node_id?: string
  name: string
  full_name: string
  private?: boolean
  html_url?: string
  default_branch?: string
  owner?: {
    login?: string
  }
  permissions?: Record<string, unknown>
}

type GithubUserResponse = {
  login?: string
}

router.get('/settings', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const db = getDb()
    const connectionsQuery = db
      .select()
      .from(githubConnections)
      .orderBy(desc(githubConnections.createdAt))

    const connections = user?.canAccessUnscoped
      ? await connectionsQuery
      : await db
        .select()
        .from(githubConnections)
        .where(eq(githubConnections.ownerUserId, user?.sub ?? ''))
        .orderBy(desc(githubConnections.createdAt))

    const repositories = await db
      .select()
      .from(githubRepositories)
      .where(eq(githubRepositories.active, true))
      .orderBy(githubRepositories.fullName)

    const links = await db
      .select()
      .from(organizationRepositories)
      .where(eq(organizationRepositories.organizationId, organizationId))
      .orderBy(desc(organizationRepositories.isDefault), organizationRepositories.role)

    res.json({
      connections: connections.map(serializeConnection),
      repositories: repositories.map(serializeRepository),
      organizationRepositories: links.map(serializeOrganizationRepository),
    })
  } catch (error) {
    handleRouteError(res, error, 'GITHUB_SETTINGS_FAILED', 'Could not load GitHub settings.')
  }
})

router.post('/connections', async (req, res) => {
  try {
    const body = ensureObject(req.body)
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const token = readRequiredString(body.token, 'token')
    const credentialKind = readOptionalString(body.credentialKind) ?? 'fine_grained_pat'
    const user = authenticatedUser(req)

    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const identity = await fetchGithubIdentity(token)
    const now = new Date()
    const [connection] = await getDb()
      .insert(githubConnections)
      .values({
        name: readOptionalString(body.name) ?? `${identity.login ?? 'GitHub'} connection`,
        provider: 'github',
        providerAccountLogin: identity.login,
        ownerUserId: user?.sub,
        credentialKind,
        credentialLabel: readOptionalString(body.credentialLabel),
        credentialLast4: secretLast4(token),
        encryptedCredential: encryptSecret(token),
        scopes: identity.scopes,
        status: 'active',
        metadata: {
          createdVia: 'settings',
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const repositories = await syncRepositoriesForConnection(connection.id, token)

    res.status(201).json({
      connection: serializeConnection({
        ...connection,
        providerAccountLogin: identity.login ?? null,
        scopes: identity.scopes,
        lastSyncedAt: new Date(),
      }),
      repositories: repositories.map(serializeRepository),
    })
  } catch (error) {
    handleRouteError(res, error, 'GITHUB_CONNECTION_CREATE_FAILED', 'Could not create GitHub connection.')
  }
})

router.post('/connections/:connectionId/sync', async (req, res) => {
  try {
    const connectionId = readRequiredString(req.params.connectionId, 'connectionId')
    const user = authenticatedUser(req)
    const [connection] = await getDb()
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.id, connectionId))
      .limit(1)

    if (!connection || (!user?.canAccessUnscoped && connection.ownerUserId !== user?.sub)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'GitHub connection not found.' })
      return
    }

    const token = await readGithubTokenForConnection(connection.id)
    if (!token) throw new ValidationError('GitHub connection is not active.')

    const repositories = await syncRepositoriesForConnection(connection.id, token)
    const [updated] = await getDb().select().from(githubConnections).where(eq(githubConnections.id, connection.id)).limit(1)

    res.json({
      connection: updated ? serializeConnection(updated) : serializeConnection(connection),
      repositories: repositories.map(serializeRepository),
    })
  } catch (error) {
    handleRouteError(res, error, 'GITHUB_CONNECTION_SYNC_FAILED', 'Could not sync GitHub repositories.')
  }
})

router.post('/organization-repositories', async (req, res) => {
  try {
    const body = ensureObject(req.body)
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const repositoryId = readRequiredString(body.repositoryId, 'repositoryId')
    const role = readOptionalString(body.role) ?? 'primary'
    const user = authenticatedUser(req)

    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const db = getDb()
    const [repository] = await db.select().from(githubRepositories).where(eq(githubRepositories.id, repositoryId)).limit(1)
    if (!repository) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Repository not found.' })
      return
    }

    const existingLinks = await db
      .select()
      .from(organizationRepositories)
      .where(eq(organizationRepositories.organizationId, organizationId))

    const existing = existingLinks.find((link) => link.repositoryId === repositoryId)
    const activeLinkCount = existingLinks.filter((link) => link.active && link.id !== existing?.id).length
    const isDefault = readOptionalBoolean(body.isDefault) ?? activeLinkCount === 0
    const now = new Date()

    if (isDefault) {
      await db
        .update(organizationRepositories)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(organizationRepositories.organizationId, organizationId))
    }

    const values = {
      role,
      isDefault,
      active: true,
      metadata: ensureRecord(body.metadata),
      updatedAt: now,
    }

    const [link] = existing
      ? await db
        .update(organizationRepositories)
        .set(values)
        .where(eq(organizationRepositories.id, existing.id))
        .returning()
      : await db
        .insert(organizationRepositories)
        .values({
          organizationId,
          repositoryId,
          ...values,
          createdAt: now,
        })
        .returning()

    res.status(existing ? 200 : 201).json({ organizationRepository: serializeOrganizationRepository(link) })
  } catch (error) {
    handleRouteError(res, error, 'ORGANIZATION_REPOSITORY_LINK_FAILED', 'Could not link repository.')
  }
})

router.delete('/organization-repositories/:linkId', async (req, res) => {
  try {
    const linkId = readRequiredString(req.params.linkId, 'linkId')
    const user = authenticatedUser(req)
    const db = getDb()
    const [link] = await db.select().from(organizationRepositories).where(eq(organizationRepositories.id, linkId)).limit(1)

    if (!link || !(await canAccessOrganization(link.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Repository link not found.' })
      return
    }

    const now = new Date()
    const [updated] = await db
      .update(organizationRepositories)
      .set({ active: false, isDefault: false, updatedAt: now })
      .where(eq(organizationRepositories.id, link.id))
      .returning()

    if (link.isDefault) {
      const [replacement] = await db
        .select()
        .from(organizationRepositories)
        .where(and(eq(organizationRepositories.organizationId, link.organizationId), eq(organizationRepositories.active, true)))
        .limit(1)

      if (replacement) {
        await db
          .update(organizationRepositories)
          .set({ isDefault: true, updatedAt: now })
          .where(eq(organizationRepositories.id, replacement.id))
      }
    }

    res.json({ ok: true, organizationRepository: serializeOrganizationRepository(updated) })
  } catch (error) {
    handleRouteError(res, error, 'ORGANIZATION_REPOSITORY_UNLINK_FAILED', 'Could not unlink repository.')
  }
})

async function syncRepositoriesForConnection(connectionId: string, token: string) {
  const identity = await fetchGithubIdentity(token)
  const repositories = await fetchGithubRepositories(token)
  const db = getDb()
  const now = new Date()
  const saved = []

  for (const repository of repositories) {
    const owner = repository.owner?.login ?? repository.full_name.split('/')[0]
    const name = repository.name
    const fullName = repository.full_name
    const [existing] = await db
      .select()
      .from(githubRepositories)
      .where(eq(githubRepositories.fullName, fullName))
      .limit(1)

    const values = {
      connectionId,
      githubId: String(repository.id),
      nodeId: repository.node_id,
      projectKey: existing?.projectKey ?? projectKeyForRepository(owner, name),
      owner,
      name,
      fullName,
      defaultBranch: repository.default_branch ?? existing?.defaultBranch ?? 'main',
      htmlUrl: repository.html_url,
      isPrivate: Boolean(repository.private),
      permissions: repository.permissions ?? {},
      active: true,
      metadata: {
        ...(existing?.metadata ?? {}),
        source: 'github_sync',
      },
      updatedAt: now,
    }

    const [row] = existing
      ? await db.update(githubRepositories).set(values).where(eq(githubRepositories.id, existing.id)).returning()
      : await db.insert(githubRepositories).values({ ...values, createdAt: now }).returning()

    saved.push(row)
  }

  await db
    .update(githubConnections)
    .set({
      providerAccountLogin: identity.login,
      scopes: identity.scopes,
      status: 'active',
      statusMessage: null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(githubConnections.id, connectionId))

  return saved
}

async function fetchGithubIdentity(token: string) {
  const response = await fetch('https://api.github.com/user', {
    headers: githubHeaders(token),
  })
  const scopes = parseGithubScopes(response.headers.get('x-oauth-scopes'))
  const user = await readGithubResponse<GithubUserResponse>(response, 'GitHub token validation failed')
  return {
    login: user.login,
    scopes,
  }
}

async function fetchGithubRepositories(token: string) {
  const repositories: GithubRepositoryResponse[] = []
  for (let page = 1; page <= 20; page += 1) {
    const url = new URL('https://api.github.com/user/repos')
    url.searchParams.set('affiliation', 'owner,collaborator,organization_member')
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const response = await fetch(url, { headers: githubHeaders(token) })
    const pageItems = await readGithubResponse<GithubRepositoryResponse[]>(response, 'GitHub repository sync failed')
    repositories.push(...pageItems)
    if (pageItems.length < 100) break
  }
  return repositories
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function readGithubResponse<T>(response: Response, context: string) {
  const body = await response.text()
  if (!response.ok) {
    throw new ValidationError(`${context}: ${response.status} ${body.slice(0, 240)}`)
  }
  return JSON.parse(body) as T
}

async function canAccessOrganization(organizationId: string, user: JWTPayload | undefined) {
  const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  if (!organization) return false
  return user?.canAccessUnscoped || user?.organizationIds.includes(organization.id) || false
}

function authenticatedUser(req: Request) {
  return req.user
}

function serializeConnection(connection: typeof githubConnections.$inferSelect) {
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    providerAccountLogin: connection.providerAccountLogin,
    ownerUserId: connection.ownerUserId,
    credentialKind: connection.credentialKind,
    credentialLabel: connection.credentialLabel,
    credentialLast4: connection.credentialLast4,
    scopes: connection.scopes ?? [],
    status: connection.status,
    statusMessage: connection.statusMessage,
    lastSyncedAt: connection.lastSyncedAt?.getTime() ?? null,
    lastUsedAt: connection.lastUsedAt?.getTime() ?? null,
    createdAt: connection.createdAt.getTime(),
    updatedAt: connection.updatedAt.getTime(),
  }
}

function serializeRepository(repository: typeof githubRepositories.$inferSelect) {
  return {
    id: repository.id,
    connectionId: repository.connectionId,
    githubId: repository.githubId,
    nodeId: repository.nodeId,
    projectKey: repository.projectKey,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    htmlUrl: repository.htmlUrl,
    isPrivate: repository.isPrivate,
    permissions: repository.permissions ?? {},
    active: repository.active,
    createdAt: repository.createdAt.getTime(),
    updatedAt: repository.updatedAt.getTime(),
  }
}

function serializeOrganizationRepository(link: typeof organizationRepositories.$inferSelect) {
  return {
    id: link.id,
    organizationId: link.organizationId,
    repositoryId: link.repositoryId,
    role: link.role,
    isDefault: link.isDefault,
    active: link.active,
    metadata: link.metadata ?? {},
    createdAt: link.createdAt.getTime(),
    updatedAt: link.updatedAt.getTime(),
  }
}

function parseGithubScopes(value: string | null) {
  return value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? []
}

function projectKeyForRepository(owner: string, name: string) {
  return `github-${owner}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function ensureObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function ensureRecord(value: unknown) {
  return ensureObject(value)
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required.`)
  return value.trim()
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function handleRouteError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown, code: string, message: string) {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: 'VALIDATION', message: error.message })
    return
  }
  console.error(code, error)
  res.status(500).json({ error: code, message })
}

class ValidationError extends Error {}

export default router
