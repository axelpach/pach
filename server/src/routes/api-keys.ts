import { Router, type Request } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { organizationApiKeys, organizations } from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'
import {
  generateOrganizationApiKeySecret,
  hashOrganizationApiKey,
  normalizeOrganizationApiKeyScopes,
  organizationApiKeyPrefix,
} from '../lib/organization-api-key.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const keys = await getDb()
      .select()
      .from(organizationApiKeys)
      .where(eq(organizationApiKeys.organizationId, organizationId))
      .orderBy(desc(organizationApiKeys.createdAt))

    res.json({ apiKeys: keys.map(serializeApiKey) })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('API key list failed', error)
    res.status(500).json({ error: 'API_KEY_LIST_FAILED', message: 'Could not list API keys.' })
  }
})

router.post('/', async (req, res) => {
  try {
    const body = req.body ?? {}
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const name = readRequiredString(body.name, 'name')
    const scopes = normalizeOrganizationApiKeyScopes(body.scopes)
    const user = authenticatedUser(req)

    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const secret = generateOrganizationApiKeySecret()
    const now = new Date()
    const [apiKey] = await getDb()
      .insert(organizationApiKeys)
      .values({
        organizationId,
        name,
        tokenPrefix: organizationApiKeyPrefix(secret),
        tokenHash: hashOrganizationApiKey(secret),
        scopes,
        status: 'active',
        createdByUserId: user?.sub,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    res.status(201).json({ apiKey: serializeApiKey(apiKey), secret })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('API key create failed', error)
    res.status(500).json({ error: 'API_KEY_CREATE_FAILED', message: 'Could not create API key.' })
  }
})

router.delete('/:apiKeyId', async (req, res) => {
  try {
    const apiKeyId = readRequiredString(req.params.apiKeyId, 'apiKeyId')
    const user = authenticatedUser(req)
    const [apiKey] = await getDb().select().from(organizationApiKeys).where(eq(organizationApiKeys.id, apiKeyId)).limit(1)

    if (!apiKey || !(await canAccessOrganization(apiKey.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'API key not found.' })
      return
    }

    const now = new Date()
    const [revoked] = await getDb()
      .update(organizationApiKeys)
      .set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(and(eq(organizationApiKeys.id, apiKey.id), eq(organizationApiKeys.organizationId, apiKey.organizationId)))
      .returning()

    res.json({ ok: true, apiKey: serializeApiKey(revoked) })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('API key revoke failed', error)
    res.status(500).json({ error: 'API_KEY_REVOKE_FAILED', message: 'Could not revoke API key.' })
  }
})

async function canAccessOrganization(organizationId: string, user: JWTPayload | undefined) {
  const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  if (!organization) return false
  return user?.canAccessUnscoped || user?.organizationIds.includes(organization.id) || false
}

function authenticatedUser(req: Request) {
  return (req as Request & { user?: JWTPayload }).user
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required.`)
  return value.trim()
}

function serializeApiKey(apiKey: typeof organizationApiKeys.$inferSelect) {
  return {
    id: apiKey.id,
    organizationId: apiKey.organizationId,
    name: apiKey.name,
    tokenPrefix: apiKey.tokenPrefix,
    scopes: apiKey.scopes ?? [],
    status: apiKey.status,
    lastUsedAt: apiKey.lastUsedAt?.getTime() ?? null,
    revokedAt: apiKey.revokedAt?.getTime() ?? null,
    createdAt: apiKey.createdAt.getTime(),
    updatedAt: apiKey.updatedAt.getTime(),
  }
}

class ValidationError extends Error {}

export default router
