import { Router, type Request } from 'express'
import { and, desc, eq, ne } from 'drizzle-orm'
import {
  organizations,
  socialProviderApps,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'
import { encryptSecret, secretLast4 } from '../lib/secret-encryption.js'

const router = Router()

const DEFAULT_ORGANIZATION_SCOPES = ['w_organization_social', 'r_organization_social']
const DEFAULT_MEMBER_SCOPES = ['w_member_social']
const PROVIDER_APP_PURPOSES = new Set(['organization_publishing', 'member_sharing'])
const PROVIDER_APP_STATUSES = new Set(['pending_approval', 'ready', 'needs_secret', 'needs_reconnect', 'archived'])

router.get('/settings', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const providerApps = await getDb()
      .select()
      .from(socialProviderApps)
      .where(and(
        eq(socialProviderApps.organizationId, organizationId),
        ne(socialProviderApps.status, 'archived'),
      ))
      .orderBy(desc(socialProviderApps.createdAt))

    res.json({
      providerApps: providerApps.map(serializeProviderApp),
      defaults: {
        linkedinRedirectUri: defaultLinkedInRedirectUri(req),
        organizationScopes: DEFAULT_ORGANIZATION_SCOPES,
        memberScopes: DEFAULT_MEMBER_SCOPES,
      },
    })
  } catch (error) {
    handleRouteError(res, error, 'SOCIAL_SETTINGS_FAILED', 'Could not load social settings.')
  }
})

router.post('/provider-apps', async (req, res) => {
  try {
    const body = ensureObject(req.body)
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const provider = readOptionalString(body.provider) ?? 'linkedin'
    const purpose = readPurpose(body.purpose)
    const clientSecret = readOptionalString(body.clientSecret)
    const now = new Date()
    const [providerApp] = await getDb()
      .insert(socialProviderApps)
      .values({
        organizationId,
        createdByUserId: user?.sub,
        provider,
        purpose,
        name: readRequiredString(body.name, 'name'),
        clientId: readRequiredString(body.clientId, 'clientId'),
        encryptedClientSecret: clientSecret ? encryptSecret(clientSecret) : null,
        clientSecretLast4: clientSecret ? secretLast4(clientSecret) : null,
        redirectUri: readOptionalString(body.redirectUri) ?? defaultLinkedInRedirectUri(req),
        scopesRequested: readScopes(body.scopesRequested, defaultScopesForPurpose(purpose)),
        status: clientSecret ? readStatus(body.status, 'pending_approval') : 'needs_secret',
        statusMessage: readOptionalString(body.statusMessage),
        metadata: ensureRecord(body.metadata),
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    res.status(201).json({ providerApp: serializeProviderApp(providerApp) })
  } catch (error) {
    handleRouteError(res, error, 'SOCIAL_PROVIDER_APP_CREATE_FAILED', 'Could not create social provider app.')
  }
})

router.patch('/provider-apps/:providerAppId', async (req, res) => {
  try {
    const providerAppId = readRequiredString(req.params.providerAppId, 'providerAppId')
    const body = ensureObject(req.body)
    const user = authenticatedUser(req)
    const [existing] = await getDb().select().from(socialProviderApps).where(eq(socialProviderApps.id, providerAppId)).limit(1)

    if (!existing || !(await canAccessOrganization(existing.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Provider app not found.' })
      return
    }

    const clientSecret = readOptionalString(body.clientSecret)
    const updates: Partial<typeof socialProviderApps.$inferInsert> = {
      updatedAt: new Date(),
    }
    if ('name' in body) updates.name = readRequiredString(body.name, 'name')
    if ('clientId' in body) updates.clientId = readRequiredString(body.clientId, 'clientId')
    if ('redirectUri' in body) updates.redirectUri = readRequiredString(body.redirectUri, 'redirectUri')
    if ('purpose' in body) updates.purpose = readPurpose(body.purpose)
    if ('scopesRequested' in body) updates.scopesRequested = readScopes(body.scopesRequested, existing.scopesRequested ?? [])
    if ('status' in body) updates.status = readStatus(body.status, existing.status)
    if ('statusMessage' in body) updates.statusMessage = readOptionalString(body.statusMessage)
    if ('metadata' in body) updates.metadata = ensureRecord(body.metadata)
    if (clientSecret) {
      updates.encryptedClientSecret = encryptSecret(clientSecret)
      updates.clientSecretLast4 = secretLast4(clientSecret)
      if (!('status' in body) && existing.status === 'needs_secret') updates.status = 'pending_approval'
    }
    if (!clientSecret && !existing.encryptedClientSecret && updates.status && updates.status !== 'needs_secret') {
      throw new ValidationError('Client secret is required before this app can leave needs_secret status.')
    }

    const [providerApp] = await getDb()
      .update(socialProviderApps)
      .set(updates)
      .where(eq(socialProviderApps.id, existing.id))
      .returning()

    res.json({ providerApp: serializeProviderApp(providerApp) })
  } catch (error) {
    handleRouteError(res, error, 'SOCIAL_PROVIDER_APP_UPDATE_FAILED', 'Could not update social provider app.')
  }
})

router.delete('/provider-apps/:providerAppId', async (req, res) => {
  try {
    const providerAppId = readRequiredString(req.params.providerAppId, 'providerAppId')
    const user = authenticatedUser(req)
    const [existing] = await getDb().select().from(socialProviderApps).where(eq(socialProviderApps.id, providerAppId)).limit(1)

    if (!existing || !(await canAccessOrganization(existing.organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Provider app not found.' })
      return
    }

    const [providerApp] = await getDb()
      .update(socialProviderApps)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(socialProviderApps.id, existing.id))
      .returning()

    res.json({ ok: true, providerApp: serializeProviderApp(providerApp) })
  } catch (error) {
    handleRouteError(res, error, 'SOCIAL_PROVIDER_APP_ARCHIVE_FAILED', 'Could not archive social provider app.')
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

function serializeProviderApp(providerApp: typeof socialProviderApps.$inferSelect) {
  return {
    id: providerApp.id,
    organizationId: providerApp.organizationId,
    provider: providerApp.provider,
    purpose: providerApp.purpose,
    name: providerApp.name,
    clientId: providerApp.clientId,
    hasClientSecret: Boolean(providerApp.encryptedClientSecret),
    clientSecretLast4: providerApp.clientSecretLast4,
    redirectUri: providerApp.redirectUri,
    scopesRequested: providerApp.scopesRequested ?? [],
    status: providerApp.status,
    statusMessage: providerApp.statusMessage,
    metadata: providerApp.metadata ?? {},
    createdAt: providerApp.createdAt.getTime(),
    updatedAt: providerApp.updatedAt.getTime(),
  }
}

function defaultLinkedInRedirectUri(req: Request) {
  const baseUrl =
    process.env.PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    `${req.protocol}://${req.get('host')}`
  return `${baseUrl.replace(/\/+$/, '')}/social/linkedin/oauth/callback`
}

function defaultScopesForPurpose(purpose: string) {
  return purpose === 'member_sharing' ? DEFAULT_MEMBER_SCOPES : DEFAULT_ORGANIZATION_SCOPES
}

function readPurpose(value: unknown) {
  const purpose = readOptionalString(value) ?? 'organization_publishing'
  if (!PROVIDER_APP_PURPOSES.has(purpose)) throw new ValidationError('Unsupported provider app purpose.')
  return purpose
}

function readStatus(value: unknown, fallback: string) {
  const status = readOptionalString(value) ?? fallback
  if (!PROVIDER_APP_STATUSES.has(status)) throw new ValidationError('Unsupported provider app status.')
  return status
}

function readScopes(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const scopes = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return Array.from(new Set(scopes))
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
