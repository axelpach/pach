import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { organizationApiKeys } from '../../../db/schema.js'
import { getDb } from '../db.js'

export const ORGANIZATION_API_KEY_PREFIX = 'pach_sk_'

export const ORGANIZATION_API_KEY_SCOPES = [
  'marketing:write',
  'docs:write',
  'analytics:write',
  '*',
] as const

export type OrganizationApiKeyScope = typeof ORGANIZATION_API_KEY_SCOPES[number]

export function generateOrganizationApiKeySecret() {
  return `${ORGANIZATION_API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function hashOrganizationApiKey(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

export function organizationApiKeyPrefix(secret: string) {
  return secret.slice(0, 18)
}

export function extractApiKeyToken(headers: {
  authorization?: string | string[]
  'x-pach-api-key'?: string | string[]
  'x-pach-write-token'?: string | string[]
  'x-pach-marketing-token'?: string | string[]
  'x-pach-public-write-token'?: string | string[]
}) {
  const explicit =
    firstHeader(headers['x-pach-api-key']) ||
    firstHeader(headers['x-pach-write-token']) ||
    firstHeader(headers['x-pach-marketing-token']) ||
    firstHeader(headers['x-pach-public-write-token'])
  const bearer = firstHeader(headers.authorization)?.replace(/^Bearer\s+/i, '')
  return (explicit || bearer || '').trim()
}

export function isOrganizationApiKeyScope(value: string): value is OrganizationApiKeyScope {
  return (ORGANIZATION_API_KEY_SCOPES as readonly string[]).includes(value)
}

export function normalizeOrganizationApiKeyScopes(value: unknown, fallback: OrganizationApiKeyScope[] = ['marketing:write']) {
  if (!Array.isArray(value)) return fallback
  const scopes = value.filter((entry): entry is OrganizationApiKeyScope => typeof entry === 'string' && isOrganizationApiKeyScope(entry))
  return scopes.length ? Array.from(new Set(scopes)) : fallback
}

export async function validateOrganizationApiKey({
  token,
  organizationId,
  scope,
}: {
  token: string
  organizationId: string
  scope: OrganizationApiKeyScope
}) {
  if (!token.startsWith(ORGANIZATION_API_KEY_PREFIX)) return null

  const [apiKey] = await getDb()
    .select()
    .from(organizationApiKeys)
    .where(and(
      eq(organizationApiKeys.organizationId, organizationId),
      eq(organizationApiKeys.tokenHash, hashOrganizationApiKey(token)),
      eq(organizationApiKeys.status, 'active'),
      isNull(organizationApiKeys.revokedAt),
    ))
    .limit(1)

  if (!apiKey) return null

  const scopes = apiKey.scopes ?? []
  if (!scopes.includes('*') && !scopes.includes(scope)) return null

  await getDb()
    .update(organizationApiKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizationApiKeys.id, apiKey.id))

  return apiKey
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
