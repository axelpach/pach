import { Router, type Request } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { organizationApiKeys, organizationCredentials, organizations } from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'
import { encryptSecret, secretLast4 } from '../lib/secret-encryption.js'
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
    const credentials = await getDb()
      .select()
      .from(organizationCredentials)
      .where(eq(organizationCredentials.organizationId, organizationId))
      .orderBy(desc(organizationCredentials.createdAt))

    res.json({
      apiKeys: keys.map(serializeApiKey),
      credentials: credentials.map(serializeCredential),
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('API key list failed', error)
    res.status(500).json({ error: 'API_KEY_LIST_FAILED', message: 'Could not list API keys.' })
  }
})

router.post('/credentials', async (req, res) => {
  try {
    const body = req.body ?? {}
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const name = readRequiredString(body.name, 'name')
    const provider = readProvider(body.provider)
    const envVarName = readCredentialEnvVarName(body.envVarName)
    const secret = readRequiredString(body.secret, 'secret')
    const allowedUses = normalizeCredentialUses(body.allowedUses)
    const user = authenticatedUser(req)

    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const now = new Date()
    const [existing] = await getDb()
      .select()
      .from(organizationCredentials)
      .where(and(
        eq(organizationCredentials.organizationId, organizationId),
        eq(organizationCredentials.envVarName, envVarName),
      ))
      .limit(1)

    if (existing?.status === 'active') {
      res.status(409).json({ error: 'CONFLICT', message: 'That environment alias is already in use.' })
      return
    }

    const values = {
      organizationId,
      name,
      provider,
      kind: 'api_key',
      envVarName,
      encryptedSecret: encryptSecret(secret),
      secretLast4: secretLast4(secret),
      allowedUses,
      status: 'active',
      statusMessage: null,
      revokedAt: null,
      createdByUserId: user?.sub,
      updatedAt: now,
    }
    const [credential] = existing
      ? await getDb().update(organizationCredentials).set(values).where(eq(organizationCredentials.id, existing.id)).returning()
      : await getDb().insert(organizationCredentials).values({ ...values, createdAt: now }).returning()

    res.status(201).json({ credential: serializeCredential(credential) })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('Organization credential create failed', error)
    res.status(500).json({ error: 'CREDENTIAL_CREATE_FAILED', message: 'Could not save provider credential.' })
  }
})

router.patch('/credentials/:credentialId', async (req, res) => {
  try {
    const credentialId = readRequiredString(req.params.credentialId, 'credentialId')
    const user = authenticatedUser(req)
    const [existing] = await getDb()
      .select()
      .from(organizationCredentials)
      .where(eq(organizationCredentials.id, credentialId))
      .limit(1)

    if (!existing || !(await canAccessOrganization(existing.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Provider credential not found.' })
      return
    }
    if (existing.status !== 'active') {
      res.status(409).json({ error: 'CONFLICT', message: 'Revoked credentials cannot be edited. Add a replacement credential instead.' })
      return
    }

    const body = req.body ?? {}
    const secret = readOptionalString(body.secret)
    const envVarName = body.envVarName === undefined ? undefined : readCredentialEnvVarName(body.envVarName)
    if (envVarName && envVarName !== existing.envVarName) {
      const [duplicate] = await getDb()
        .select({ id: organizationCredentials.id })
        .from(organizationCredentials)
        .where(and(
          eq(organizationCredentials.organizationId, existing.organizationId),
          eq(organizationCredentials.envVarName, envVarName),
        ))
        .limit(1)
      if (duplicate) {
        res.status(409).json({ error: 'CONFLICT', message: 'That environment alias is already in use.' })
        return
      }
    }
    const updates = {
      ...(body.name === undefined ? {} : { name: readRequiredString(body.name, 'name') }),
      ...(body.provider === undefined ? {} : { provider: readProvider(body.provider) }),
      ...(envVarName === undefined ? {} : { envVarName }),
      ...(body.allowedUses === undefined ? {} : { allowedUses: normalizeCredentialUses(body.allowedUses) }),
      ...(secret ? { encryptedSecret: encryptSecret(secret), secretLast4: secretLast4(secret) } : {}),
      updatedAt: new Date(),
    }

    const [credential] = await getDb()
      .update(organizationCredentials)
      .set(updates)
      .where(eq(organizationCredentials.id, existing.id))
      .returning()

    res.json({ credential: serializeCredential(credential) })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('Organization credential update failed', error)
    res.status(500).json({ error: 'CREDENTIAL_UPDATE_FAILED', message: 'Could not update provider credential.' })
  }
})

router.delete('/credentials/:credentialId', async (req, res) => {
  try {
    const credentialId = readRequiredString(req.params.credentialId, 'credentialId')
    const user = authenticatedUser(req)
    const [existing] = await getDb()
      .select()
      .from(organizationCredentials)
      .where(eq(organizationCredentials.id, credentialId))
      .limit(1)

    if (!existing || !(await canAccessOrganization(existing.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Provider credential not found.' })
      return
    }

    const now = new Date()
    const [credential] = await getDb()
      .update(organizationCredentials)
      .set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(eq(organizationCredentials.id, existing.id))
      .returning()

    res.json({ ok: true, credential: serializeCredential(credential) })
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: 'VALIDATION', message: error.message })
      return
    }
    console.error('Organization credential revoke failed', error)
    res.status(500).json({ error: 'CREDENTIAL_REVOKE_FAILED', message: 'Could not revoke provider credential.' })
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

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readProvider(value: unknown) {
  const provider = readRequiredString(value, 'provider').toLowerCase().replace(/[\s-]+/g, '_')
  if (!/^[a-z0-9][a-z0-9_]*$/.test(provider)) throw new ValidationError('provider must use letters, numbers, or underscores.')
  return provider
}

const RESERVED_CREDENTIAL_ENV_VARS = new Set([
  'PATH',
  'HOME',
  'NODE_OPTIONS',
  'PACH_MCP_TOKEN',
  'PACH_AGENT_TOKEN',
])

function readCredentialEnvVarName(value: unknown) {
  const envVarName = readRequiredString(value, 'envVarName').toUpperCase()
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envVarName)) throw new ValidationError('envVarName must be a valid uppercase environment variable name.')
  if (envVarName.startsWith('PACH_') || RESERVED_CREDENTIAL_ENV_VARS.has(envVarName)) {
    throw new ValidationError('envVarName cannot replace a Pach or system environment variable.')
  }
  return envVarName
}

function normalizeCredentialUses(value: unknown) {
  const uses = Array.isArray(value) ? value.filter((entry): entry is string => entry === 'editorial') : []
  if (uses.length === 0) throw new ValidationError('Select at least one allowed use.')
  return Array.from(new Set(uses))
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

function serializeCredential(credential: typeof organizationCredentials.$inferSelect) {
  return {
    id: credential.id,
    organizationId: credential.organizationId,
    name: credential.name,
    provider: credential.provider,
    kind: credential.kind,
    envVarName: credential.envVarName,
    secretLast4: credential.secretLast4,
    allowedUses: credential.allowedUses ?? [],
    status: credential.status,
    statusMessage: credential.statusMessage,
    lastUsedAt: credential.lastUsedAt?.getTime() ?? null,
    revokedAt: credential.revokedAt?.getTime() ?? null,
    createdAt: credential.createdAt.getTime(),
    updatedAt: credential.updatedAt.getTime(),
  }
}

class ValidationError extends Error {}

export default router
