import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response as ExpressResponse } from 'express'
import { and, desc, eq, ne } from 'drizzle-orm'
import {
  organizations,
  socialChannelConnections,
  socialChannels,
  socialConnections,
  socialProviderApps,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'
import { decryptSecret, encryptSecret, secretLast4 } from '../lib/secret-encryption.js'

const router = Router()
const publicRouter = Router()

const DEFAULT_ORGANIZATION_SCOPES = ['w_organization_social', 'r_organization_social']
const DEFAULT_MEMBER_SCOPES = ['w_member_social']
const PROVIDER_APP_PURPOSES = new Set(['organization_publishing', 'member_sharing'])
const PROVIDER_APP_STATUSES = new Set(['pending_approval', 'ready', 'needs_secret', 'needs_reconnect', 'archived'])
const LINKEDIN_AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_REST_BASE_URL = 'https://api.linkedin.com/rest'
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'
const LINKEDIN_API_VERSION = process.env.LINKEDIN_VERSION || process.env.LINKEDIN_API_VERSION || '202507'
const LINKEDIN_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const LINKEDIN_PUBLISH_ROLES = new Set([
  'ADMINISTRATOR',
  'CONTENT_ADMIN',
  'CONTENT_ADMINISTRATOR',
  'DIRECT_SPONSORED_CONTENT_POSTER',
])

type OAuthState = {
  organizationId: string
  providerAppId: string
  userId?: string
  returnTo: string
  nonce: string
  iat: number
  exp: number
}

type LinkedInProfile = {
  id: string | null
  name: string | null
  url: string | null
}

type LinkedInOrganizationDiscovery = {
  urn: string
  numericId: string
  roles: string[]
  details: Record<string, unknown> | null
}

type LinkedInTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
  token_type?: string
}

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

router.get('/linkedin/oauth/start', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    const providerAppId = readRequiredString(req.query.providerAppId, 'providerAppId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const [providerApp] = await getDb()
      .select()
      .from(socialProviderApps)
      .where(and(
        eq(socialProviderApps.id, providerAppId),
        eq(socialProviderApps.organizationId, organizationId),
      ))
      .limit(1)

    validateLinkedInProviderAppForOAuth(providerApp)

    const now = Date.now()
    const state = encodeOAuthState({
      organizationId,
      providerAppId,
      userId: user?.sub,
      returnTo: safePortalReturnTo(readOptionalString(req.query.returnTo), req),
      nonce: randomUUID(),
      iat: now,
      exp: now + LINKEDIN_OAUTH_STATE_TTL_MS,
    })

    const authorizationUrl = new URL(LINKEDIN_AUTHORIZATION_URL)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('client_id', providerApp.clientId)
    authorizationUrl.searchParams.set('redirect_uri', providerApp.redirectUri)
    authorizationUrl.searchParams.set('scope', scopesForProviderApp(providerApp).join(' '))
    authorizationUrl.searchParams.set('state', state)

    res.json({ authorizationUrl: authorizationUrl.toString() })
  } catch (error) {
    handleRouteError(res, error, 'LINKEDIN_OAUTH_START_FAILED', 'Could not start LinkedIn OAuth.')
  }
})

publicRouter.get('/linkedin/oauth/callback', async (req, res) => {
  let returnTo = defaultSocialReturnTo(req)
  try {
    const state = decodeOAuthState(readRequiredString(req.query.state, 'state'))
    returnTo = state.returnTo

    const linkedinError = readOptionalString(req.query.error)
    if (linkedinError) {
      const description = readOptionalString(req.query.error_description) ?? linkedinError
      redirectWithLinkedInResult(res, returnTo, 'failed', description)
      return
    }

    const code = readRequiredString(req.query.code, 'code')
    const result = await completeLinkedInOAuth(code, state)
    redirectWithLinkedInResult(
      res,
      returnTo,
      'connected',
      result.channels.length > 0
        ? `LinkedIn connected. ${result.channels.length} page${result.channels.length === 1 ? '' : 's'} synced.`
        : 'LinkedIn connected. No pages were returned by LinkedIn.',
      { pages: String(result.channels.length) },
    )
  } catch (error) {
    console.error('LINKEDIN_OAUTH_CALLBACK_FAILED', error)
    redirectWithLinkedInResult(res, returnTo, 'failed', error instanceof Error ? error.message : 'LinkedIn OAuth failed.')
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

async function completeLinkedInOAuth(code: string, state: OAuthState) {
  const db = getDb()
  const [providerApp] = await db
    .select()
    .from(socialProviderApps)
    .where(and(
      eq(socialProviderApps.id, state.providerAppId),
      eq(socialProviderApps.organizationId, state.organizationId),
    ))
    .limit(1)

  validateLinkedInProviderAppForOAuth(providerApp)

  const clientSecret = decryptSecret(providerApp.encryptedClientSecret)
  const token = await exchangeLinkedInCode(code, providerApp, clientSecret)
  const accessToken = readRequiredString(token.access_token, 'access_token')
  const scopes = readTokenScopes(token.scope, scopesForProviderApp(providerApp))
  const now = new Date()

  const [profile, acls] = await Promise.all([
    fetchLinkedInProfile(accessToken).catch((error) => {
      console.warn('LINKEDIN_PROFILE_DISCOVERY_FAILED', error)
      return null
    }),
    fetchLinkedInOrganizationAcls(accessToken).catch((error) => {
      console.warn('LINKEDIN_ORGANIZATION_ACL_DISCOVERY_FAILED', error)
      return []
    }),
  ])

  const organizationsDiscovered = await discoverLinkedInOrganizations(accessToken, acls)
  const roleAssignee = firstRoleAssignee(acls)
  const providerAccountId = profile?.id ?? roleAssignee ?? `pach-user:${state.userId ?? 'unknown'}`
  const providerAccountName = profile?.name ?? linkedInMemberLabel(roleAssignee) ?? 'LinkedIn member'

  const connection = await upsertLinkedInConnection({
    organizationId: state.organizationId,
    providerAppId: providerApp.id,
    userId: state.userId,
    providerAccountId,
    providerAccountName,
    providerAccountUrl: profile?.url,
    scopes,
    token,
    now,
    profile,
    roleAssignee,
    discoveredOrganizations: organizationsDiscovered,
  })

  const channels = []
  for (const organization of organizationsDiscovered) {
    const channel = await upsertLinkedInChannel({
      organizationId: state.organizationId,
      connectionId: connection.id,
      organization,
      scopes,
      now,
    })
    channels.push(channel)
  }

  return { connection, channels }
}

async function exchangeLinkedInCode(
  code: string,
  providerApp: typeof socialProviderApps.$inferSelect,
  clientSecret: string,
): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('redirect_uri', providerApp.redirectUri)
  body.set('client_id', providerApp.clientId)
  body.set('client_secret', clientSecret)

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })

  const payload = await readResponseJson(response)
  if (!response.ok) {
    throw new ValidationError(readLinkedInError(payload, `LinkedIn token exchange failed with ${response.status}.`))
  }

  return payload as LinkedInTokenResponse
}

async function fetchLinkedInProfile(accessToken: string): Promise<LinkedInProfile | null> {
  const response = await fetch(LINKEDIN_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!response.ok) return null

  const payload = ensureRecord(await response.json().catch(() => ({})))
  const firstName = readOptionalString(payload.given_name)
  const lastName = readOptionalString(payload.family_name)
  const fallbackName = [firstName, lastName].filter(Boolean).join(' ') || null
  const name = readOptionalString(payload.name) ?? fallbackName
  return {
    id: readOptionalString(payload.sub),
    name,
    url: readOptionalString(payload.profile),
  }
}

async function fetchLinkedInOrganizationAcls(accessToken: string) {
  const url = new URL(`${LINKEDIN_REST_BASE_URL}/organizationAcls`)
  url.searchParams.set('q', 'roleAssignee')
  url.searchParams.set('state', 'APPROVED')

  const payload = await fetchLinkedInRestJson(accessToken, url)
  const elements = Array.isArray(payload.elements) ? payload.elements : []
  return elements.filter(isRecord)
}

async function discoverLinkedInOrganizations(accessToken: string, acls: Record<string, unknown>[]): Promise<LinkedInOrganizationDiscovery[]> {
  const organizationsByUrn = new Map<string, Set<string>>()
  for (const acl of acls) {
    const urn = readOrganizationUrn(acl)
    if (!urn) continue
    const roles = organizationsByUrn.get(urn) ?? new Set<string>()
    const role = readOptionalString(acl.role)
    if (role) roles.add(role)
    organizationsByUrn.set(urn, roles)
  }

  const organizations: LinkedInOrganizationDiscovery[] = []
  for (const [urn, roleSet] of organizationsByUrn) {
    const numericId = readLinkedInOrganizationId(urn)
    if (!numericId) continue
    const details = await fetchLinkedInOrganization(accessToken, numericId).catch((error) => {
      console.warn('LINKEDIN_ORGANIZATION_DISCOVERY_FAILED', { organization: urn, error })
      return null
    })
    organizations.push({
      urn,
      numericId,
      roles: Array.from(roleSet).sort(),
      details,
    })
  }
  return organizations
}

async function fetchLinkedInOrganization(accessToken: string, organizationId: string) {
  const url = new URL(`${LINKEDIN_REST_BASE_URL}/organizations/${encodeURIComponent(organizationId)}`)
  return fetchLinkedInRestJson(accessToken, url)
}

async function fetchLinkedInRestJson(accessToken: string, url: URL) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Linkedin-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })

  const payload = await readResponseJson(response)
  if (!response.ok) {
    throw new ValidationError(readLinkedInError(payload, `LinkedIn API request failed with ${response.status}.`))
  }
  return ensureRecord(payload)
}

async function upsertLinkedInConnection({
  organizationId,
  providerAppId,
  userId,
  providerAccountId,
  providerAccountName,
  providerAccountUrl,
  scopes,
  token,
  now,
  profile,
  roleAssignee,
  discoveredOrganizations,
}: {
  organizationId: string
  providerAppId: string
  userId?: string
  providerAccountId: string
  providerAccountName: string
  providerAccountUrl?: string | null
  scopes: string[]
  token: LinkedInTokenResponse
  now: Date
  profile: LinkedInProfile | null
  roleAssignee: string | null
  discoveredOrganizations: LinkedInOrganizationDiscovery[]
}) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(socialConnections)
    .where(and(
      eq(socialConnections.provider, 'linkedin'),
      eq(socialConnections.providerAppId, providerAppId),
      eq(socialConnections.providerAccountId, providerAccountId),
    ))
    .limit(1)

  const values = {
    organizationId,
    providerAppId,
    connectedByUserId: userId ?? null,
    provider: 'linkedin',
    providerAccountId,
    providerAccountName,
    providerAccountUrl: providerAccountUrl ?? null,
    scopes,
    credentialKind: 'oauth2',
    encryptedAccessToken: token.access_token ? encryptSecret(token.access_token) : null,
    encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : null,
    tokenExpiresAt: secondsFromNow(token.expires_in, now),
    refreshTokenExpiresAt: secondsFromNow(token.refresh_token_expires_in, now),
    status: 'active',
    statusMessage: null,
    lastRefreshedAt: now,
    metadata: {
      ...(existing?.metadata ?? {}),
      linkedin: {
        providerAppId,
        tokenType: token.token_type ?? 'Bearer',
        profile,
        roleAssignee,
        discoveredOrganizations: discoveredOrganizations.map((organization) => ({
          urn: organization.urn,
          numericId: organization.numericId,
          roles: organization.roles,
        })),
      },
      lastOAuthAt: now.toISOString(),
    },
    updatedAt: now,
  } satisfies Partial<typeof socialConnections.$inferInsert>

  const [connection] = existing
    ? await db.update(socialConnections).set(values).where(eq(socialConnections.id, existing.id)).returning()
    : await db.insert(socialConnections).values({ ...values, createdAt: now }).returning()

  return connection
}

async function upsertLinkedInChannel({
  organizationId,
  connectionId,
  organization,
  scopes,
  now,
}: {
  organizationId: string
  connectionId: string
  organization: LinkedInOrganizationDiscovery
  scopes: string[]
  now: Date
}) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(socialChannels)
    .where(and(
      eq(socialChannels.provider, 'linkedin'),
      eq(socialChannels.externalId, organization.urn),
    ))
    .limit(1)

  if (existing && existing.organizationId !== organizationId) {
    throw new ValidationError('This LinkedIn page is already connected to another organization in Pach.')
  }

  const vanityName = readOptionalString(organization.details?.vanityName)
  const displayName = readLinkedInOrganizationDisplayName(organization) ?? `LinkedIn Page ${organization.numericId}`
  const values = {
    organizationId,
    provider: 'linkedin',
    kind: 'organization',
    externalId: organization.urn,
    displayName,
    handle: vanityName ? `@${vanityName}` : null,
    url: vanityName ? `https://www.linkedin.com/company/${vanityName}/` : null,
    status: 'active',
    metadata: {
      ...(existing?.metadata ?? {}),
      linkedinOrganizationId: organization.numericId,
      roles: organization.roles,
      source: 'oauth_discovery',
    },
    updatedAt: now,
  } satisfies Partial<typeof socialChannels.$inferInsert>

  const [channel] = existing
    ? await db.update(socialChannels).set(values).where(eq(socialChannels.id, existing.id)).returning()
    : await db.insert(socialChannels).values({ ...values, createdAt: now }).returning()

  await upsertLinkedInChannelConnection({
    organizationId,
    channelId: channel.id,
    connectionId,
    roles: organization.roles,
    scopes,
    now,
  })

  return channel
}

async function upsertLinkedInChannelConnection({
  organizationId,
  channelId,
  connectionId,
  roles,
  scopes,
  now,
}: {
  organizationId: string
  channelId: string
  connectionId: string
  roles: string[]
  scopes: string[]
  now: Date
}) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(socialChannelConnections)
    .where(and(
      eq(socialChannelConnections.channelId, channelId),
      eq(socialChannelConnections.connectionId, connectionId),
    ))
    .limit(1)

  const canPublish = scopes.includes('w_organization_social') && roles.some((role) => LINKEDIN_PUBLISH_ROLES.has(role))
  const capabilities = ['read_social', ...(canPublish ? ['publish_post'] : [])]
  const values = {
    organizationId,
    channelId,
    connectionId,
    capabilities,
    status: 'active',
    statusMessage: canPublish ? null : 'LinkedIn did not return a publishing role for this page.',
    lastCheckedAt: now,
    metadata: {
      ...(existing?.metadata ?? {}),
      roles,
      source: 'oauth_discovery',
    },
    updatedAt: now,
  } satisfies Partial<typeof socialChannelConnections.$inferInsert>

  const [link] = existing
    ? await db.update(socialChannelConnections).set(values).where(eq(socialChannelConnections.id, existing.id)).returning()
    : await db.insert(socialChannelConnections).values({ ...values, createdAt: now }).returning()

  return link
}

function validateLinkedInProviderAppForOAuth(
  providerApp: typeof socialProviderApps.$inferSelect | undefined,
): asserts providerApp is typeof socialProviderApps.$inferSelect & { encryptedClientSecret: string } {
  if (!providerApp) throw new ValidationError('LinkedIn developer app not found.')
  if (providerApp.provider !== 'linkedin') throw new ValidationError('Only LinkedIn developer apps can start this OAuth flow.')
  if (providerApp.status === 'archived') throw new ValidationError('This LinkedIn developer app is archived.')
  if (providerApp.status === 'needs_secret' || !providerApp.encryptedClientSecret) {
    throw new ValidationError('Add the LinkedIn client secret before connecting LinkedIn.')
  }
  if (providerApp.status === 'needs_reconnect') throw new ValidationError('Resolve this LinkedIn developer app before starting a new connection.')
  if (providerApp.status !== 'ready') {
    throw new ValidationError('LinkedIn has not approved this developer app yet. Mark it ready after Community Management access is approved.')
  }
}

function scopesForProviderApp(providerApp: typeof socialProviderApps.$inferSelect) {
  return providerApp.scopesRequested?.length ? providerApp.scopesRequested : defaultScopesForPurpose(providerApp.purpose)
}

function encodeOAuthState(state: OAuthState) {
  const body = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
  const signature = createHmac('sha256', oauthStateSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

function decodeOAuthState(value: string): OAuthState {
  const [body, signature] = value.split('.')
  if (!body || !signature) throw new ValidationError('Invalid LinkedIn OAuth state.')

  const expected = createHmac('sha256', oauthStateSecret()).update(body).digest('base64url')
  if (!safeEqual(signature, expected)) throw new ValidationError('Invalid LinkedIn OAuth state.')

  const state = ensureRecord(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))) as Partial<OAuthState>
  if (
    !state.organizationId ||
    !state.providerAppId ||
    !state.returnTo ||
    !state.nonce ||
    typeof state.iat !== 'number' ||
    typeof state.exp !== 'number'
  ) {
    throw new ValidationError('Invalid LinkedIn OAuth state.')
  }
  if (Date.now() > state.exp) throw new ValidationError('LinkedIn OAuth state expired. Start the connection again.')
  return state as OAuthState
}

function oauthStateSecret() {
  return process.env.LINKEDIN_OAUTH_STATE_SECRET || process.env.ZERO_AUTH_SECRET || 'pach-local-linkedin-oauth-state'
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function defaultPortalBaseUrl(req?: Request) {
  const configured = process.env.PUBLIC_PORTAL_URL || process.env.PORTAL_BASE_URL || process.env.FRONTEND_URL
  if (configured) return configured.replace(/\/+$/, '')
  const origin = req?.get('origin')
  if (origin) return origin.replace(/\/+$/, '')
  const referer = req?.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin
    } catch {
      return 'http://localhost:5175'
    }
  }
  return 'http://localhost:5175'
}

function defaultSocialReturnTo(req?: Request) {
  return `${defaultPortalBaseUrl(req)}/settings/social`
}

function safePortalReturnTo(value: string | null, req: Request) {
  const base = defaultPortalBaseUrl(req)
  if (!value) return `${base}/settings/social`
  try {
    const candidate = new URL(value, base)
    if (candidate.origin === new URL(base).origin) return candidate.toString()
  } catch {
    return `${base}/settings/social`
  }
  return `${base}/settings/social`
}

function redirectWithLinkedInResult(
  res: ExpressResponse,
  returnTo: string,
  status: 'connected' | 'failed',
  message: string,
  extras: Record<string, string> = {},
) {
  const url = new URL(returnTo)
  url.searchParams.set('linkedin', status)
  url.searchParams.set('message', message)
  for (const [key, value] of Object.entries(extras)) {
    url.searchParams.set(key, value)
  }
  res.redirect(url.toString())
}

function readTokenScopes(value: unknown, fallback: string[]) {
  const scopeText = readOptionalString(value)
  if (!scopeText) return fallback
  return Array.from(new Set(scopeText.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean)))
}

function secondsFromNow(value: unknown, now: Date) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return new Date(now.getTime() + value * 1000)
}

function firstRoleAssignee(acls: Record<string, unknown>[]) {
  for (const acl of acls) {
    const roleAssignee = readOptionalString(acl.roleAssignee)
    if (roleAssignee) return roleAssignee
  }
  return null
}

function linkedInMemberLabel(roleAssignee: string | null) {
  if (!roleAssignee) return null
  const id = roleAssignee.split(':').at(-1)
  return id ? `LinkedIn member ${id}` : null
}

function readOrganizationUrn(acl: Record<string, unknown>) {
  for (const key of ['organization', 'organizationTarget']) {
    const urn = normalizeLinkedInOrganizationUrn(readOptionalString(acl[key]))
    if (urn) return urn
  }

  for (const value of Object.values(acl)) {
    const urn = normalizeLinkedInOrganizationUrn(typeof value === 'string' ? value : null)
    if (urn) return urn
  }
  return null
}

function normalizeLinkedInOrganizationUrn(value: string | null) {
  if (!value) return null
  const match = value.match(/urn:li:organization:\d+/)
  return match?.[0] ?? null
}

function readLinkedInOrganizationId(urn: string) {
  return urn.match(/urn:li:organization:(\d+)/)?.[1] ?? null
}

function readLinkedInOrganizationDisplayName(organization: LinkedInOrganizationDiscovery) {
  const details = organization.details
  if (!details) return null
  return (
    readOptionalString(details.localizedName) ||
    readLocalizedText(details.name) ||
    readLocalizedText(details.localizedName) ||
    readOptionalString(details.vanityName)
  )
}

function readLocalizedText(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  for (const entry of Object.values(value)) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim()
  }
  return null
}

async function readResponseJson(response: globalThis.Response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text }
  }
}

function readLinkedInError(payload: unknown, fallback: string) {
  const body = ensureRecord(payload)
  return (
    readOptionalString(body.error_description) ||
    readOptionalString(body.message) ||
    readOptionalString(body.error) ||
    fallback
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

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

export { publicRouter as publicSocialRouter }
export default router
