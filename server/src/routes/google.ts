import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response as ExpressResponse } from 'express'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  activityEvents,
  googleConnections,
  mktContentOutputs,
  organizations,
  searchConsoleMetricSnapshots,
  searchConsoleProperties,
  searchConsoleSitemaps,
  searchConsoleUrlInspections,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import type { JWTPayload } from '../lib/auth.js'
import { decryptSecret, encryptSecret } from '../lib/secret-encryption.js'

const router = Router()
const publicRouter = Router()

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const SEARCH_CONSOLE_API_BASE = 'https://www.googleapis.com/webmasters/v3'
const URL_INSPECTION_API_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const DEFAULT_SEARCH_CONSOLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/webmasters',
]

type OAuthState = {
  organizationId: string
  userId?: string
  returnTo: string
  nonce: string
  iat: number
  exp: number
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  id_token?: string
}

type GoogleUserInfo = {
  sub: string | null
  email: string | null
  name: string | null
  picture: string | null
}

type SearchConsoleSiteEntry = {
  siteUrl: string
  permissionLevel: string | null
}

type SearchAnalyticsRow = {
  keys?: unknown[]
  clicks?: unknown
  impressions?: unknown
  ctr?: unknown
  position?: unknown
}

router.get('/search-console/settings', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const googleConfig = googleOAuthConfig(req)
    res.json({
      defaults: {
        configured: Boolean(googleConfig.clientId && googleConfig.clientSecret),
        redirectUri: defaultGoogleRedirectUri(req),
        scopes: DEFAULT_SEARCH_CONSOLE_SCOPES,
      },
    })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_SETTINGS_FAILED', 'Could not load Google Search settings.')
  }
})

router.get('/search-console/oauth/start', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    const user = authenticatedUser(req)
    if (!(await canAccessOrganization(organizationId, user))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }

    const { clientId } = requireGoogleOAuthConfig(req)
    const now = Date.now()
    const state = encodeOAuthState({
      organizationId,
      userId: user?.sub,
      returnTo: safePortalReturnTo(readOptionalString(req.query.returnTo), req),
      nonce: randomUUID(),
      iat: now,
      exp: now + GOOGLE_OAUTH_STATE_TTL_MS,
    })

    const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_URL)
    authorizationUrl.searchParams.set('client_id', clientId)
    authorizationUrl.searchParams.set('redirect_uri', defaultGoogleRedirectUri(req))
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('scope', DEFAULT_SEARCH_CONSOLE_SCOPES.join(' '))
    authorizationUrl.searchParams.set('access_type', 'offline')
    authorizationUrl.searchParams.set('prompt', 'consent')
    authorizationUrl.searchParams.set('include_granted_scopes', 'true')
    authorizationUrl.searchParams.set('state', state)

    res.json({ authorizationUrl: authorizationUrl.toString() })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_OAUTH_START_FAILED', 'Could not start Google Search OAuth.')
  }
})

publicRouter.get('/search-console/oauth/callback', async (req, res) => {
  let returnTo = defaultGoogleReturnTo(req)
  try {
    const state = decodeOAuthState(readRequiredString(req.query.state, 'state'))
    returnTo = state.returnTo

    const googleError = readOptionalString(req.query.error)
    if (googleError) {
      redirectWithGoogleResult(res, returnTo, 'failed', readOptionalString(req.query.error_description) ?? googleError)
      return
    }

    const code = readRequiredString(req.query.code, 'code')
    const connection = await completeGoogleOAuth(code, state, req)
    redirectWithGoogleResult(res, returnTo, 'connected', `Google Search Console connected: ${connection.providerAccountEmail ?? connection.providerAccountName ?? 'Google account'}`)
  } catch (error) {
    console.error('GOOGLE_SEARCH_OAUTH_CALLBACK_FAILED', error)
    redirectWithGoogleResult(res, returnTo, 'failed', error instanceof Error ? error.message : 'Google Search Console OAuth failed.')
  }
})

router.post('/search-console/properties/sync', async (req, res) => {
  try {
    const body = ensureRecord(req.body)
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const connection = await requireGoogleConnection({
      organizationId,
      connectionId: readOptionalString(body.connectionId),
      user: authenticatedUser(req),
    })
    const accessToken = await accessTokenForConnection(connection, req)
    const sites = await fetchSearchConsoleSites(accessToken)
    const properties = await upsertSearchConsoleProperties({
      organizationId,
      connectionId: connection.id,
      sites,
    })

    await recordGoogleActivity({
      organizationId,
      eventType: 'search_console_properties_synced',
      summary: `Synced ${properties.length} Search Console propert${properties.length === 1 ? 'y' : 'ies'}`,
      details: { count: properties.length },
    })

    res.json({ ok: true, properties: properties.map(serializeDates) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_PROPERTIES_SYNC_FAILED', 'Could not sync Search Console properties.')
  }
})

router.post('/search-console/properties/:propertyId/select', async (req, res) => {
  try {
    const propertyId = readRequiredString(req.params.propertyId, 'propertyId')
    const [property] = await getDb().select().from(searchConsoleProperties).where(eq(searchConsoleProperties.id, propertyId)).limit(1)
    if (!property || !(await canAccessOrganization(property.organizationId, authenticatedUser(req)))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Search Console property not found.' })
      return
    }

    const now = new Date()
    await getDb()
      .update(searchConsoleProperties)
      .set({ selected: false, updatedAt: now })
      .where(eq(searchConsoleProperties.organizationId, property.organizationId))
    const [updated] = await getDb()
      .update(searchConsoleProperties)
      .set({ selected: true, status: 'active', updatedAt: now })
      .where(eq(searchConsoleProperties.id, property.id))
      .returning()

    res.json({ ok: true, property: serializeDates(updated) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_PROPERTY_SELECT_FAILED', 'Could not select Search Console property.')
  }
})

router.post('/search-console/sitemaps/submit', async (req, res) => {
  try {
    const body = ensureRecord(req.body)
    const property = await requireSearchConsoleProperty({
      propertyId: readRequiredString(body.propertyId, 'propertyId'),
      user: authenticatedUser(req),
    })
    const connection = await requireGoogleConnection({
      organizationId: property.organizationId,
      connectionId: property.connectionId,
      user: authenticatedUser(req),
    })
    const sitemapUrl = readOptionalString(body.sitemapUrl) ?? defaultSitemapUrl(property.siteUrl)
    const accessToken = await accessTokenForConnection(connection, req)
    await submitSitemap({ accessToken, siteUrl: property.siteUrl, sitemapUrl })

    const now = new Date()
    const [existing] = await getDb()
      .select()
      .from(searchConsoleSitemaps)
      .where(and(eq(searchConsoleSitemaps.propertyId, property.id), eq(searchConsoleSitemaps.sitemapUrl, sitemapUrl)))
      .limit(1)
    const values = {
      organizationId: property.organizationId,
      propertyId: property.id,
      siteUrl: property.siteUrl,
      sitemapUrl,
      status: 'submitted',
      lastSubmittedAt: now,
      error: null,
      metadata: { source: 'pach_submit' },
      updatedAt: now,
    } satisfies Partial<typeof searchConsoleSitemaps.$inferInsert>
    const [sitemap] = existing
      ? await getDb().update(searchConsoleSitemaps).set(values).where(eq(searchConsoleSitemaps.id, existing.id)).returning()
      : await getDb().insert(searchConsoleSitemaps).values({ ...values, createdAt: now }).returning()

    await recordGoogleActivity({
      organizationId: property.organizationId,
      eventType: 'search_console_sitemap_submitted',
      summary: `Submitted sitemap ${sitemapUrl}`,
      details: { propertyId: property.id, siteUrl: property.siteUrl, sitemapUrl },
    })

    res.json({ ok: true, sitemap: serializeDates(sitemap) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_SITEMAP_SUBMIT_FAILED', 'Could not submit Search Console sitemap.')
  }
})

router.post('/search-console/search-analytics/sync', async (req, res) => {
  try {
    const body = ensureRecord(req.body)
    const result = await syncSearchConsoleAnalyticsForProperty({
      propertyId: readRequiredString(body.propertyId, 'propertyId'),
      user: authenticatedUser(req),
      req,
      body,
    })
    res.json({ ok: true, rows: result.rows, startDate: result.startDate, endDate: result.endDate, searchType: result.searchType })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_ANALYTICS_SYNC_FAILED', 'Could not sync Search Console analytics.')
  }
})

router.post('/search-console/url-inspect', async (req, res) => {
  try {
    const body = ensureRecord(req.body)
    const property = await requireSearchConsoleProperty({
      propertyId: readRequiredString(body.propertyId, 'propertyId'),
      user: authenticatedUser(req),
    })
    const connection = await requireGoogleConnection({
      organizationId: property.organizationId,
      connectionId: property.connectionId,
      user: authenticatedUser(req),
    })
    const inspectionUrl = readRequiredString(body.inspectionUrl, 'inspectionUrl')
    const accessToken = await accessTokenForConnection(connection, req)
    const rawResult = await inspectUrl({ accessToken, siteUrl: property.siteUrl, inspectionUrl })
    const saved = await saveUrlInspection({ property, inspectionUrl, rawResult })
    res.json({ ok: true, inspection: serializeDates(saved) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_SEARCH_URL_INSPECT_FAILED', 'Could not inspect Search Console URL.')
  }
})

async function completeGoogleOAuth(code: string, state: OAuthState, req: Request) {
  const config = requireGoogleOAuthConfig(req)
  const token = await exchangeGoogleCode(code, config)
  const accessToken = readRequiredString(token.access_token, 'access_token')
  const userInfo = await fetchGoogleUserInfo(accessToken).catch((error) => {
    console.warn('GOOGLE_USERINFO_FAILED', error)
    return null
  })
  const scopes = readTokenScopes(token.scope, DEFAULT_SEARCH_CONSOLE_SCOPES)
  const now = new Date()
  const providerAccountEmail = userInfo?.email ?? null
  const providerAccountId = userInfo?.sub ?? providerAccountEmail ?? `google-user:${state.userId ?? 'unknown'}`

  const existing = await findExistingGoogleConnection({
    organizationId: state.organizationId,
    providerAccountId,
    providerAccountEmail,
  })
  const encryptedRefreshToken = token.refresh_token
    ? encryptSecret(token.refresh_token)
    : existing?.encryptedRefreshToken ?? null

  const values = {
    organizationId: state.organizationId,
    connectedByUserId: state.userId ?? null,
    providerAccountId,
    providerAccountEmail,
    providerAccountName: userInfo?.name ?? providerAccountEmail ?? 'Google account',
    scopes,
    credentialKind: 'oauth2',
    encryptedAccessToken: encryptSecret(accessToken),
    encryptedRefreshToken,
    tokenExpiresAt: secondsFromNow(token.expires_in, now),
    status: encryptedRefreshToken ? 'active' : 'needs_reconnect',
    statusMessage: encryptedRefreshToken ? null : 'Google did not return a refresh token. Reconnect with consent to allow scheduled syncs.',
    lastRefreshedAt: now,
    metadata: {
      ...(existing?.metadata ?? {}),
      google: {
        tokenType: token.token_type ?? 'Bearer',
        userInfo,
      },
      lastOAuthAt: now.toISOString(),
    },
    updatedAt: now,
  } satisfies Partial<typeof googleConnections.$inferInsert>

  const [connection] = existing
    ? await getDb().update(googleConnections).set(values).where(eq(googleConnections.id, existing.id)).returning()
    : await getDb().insert(googleConnections).values({ ...values, createdAt: now }).returning()

  return connection
}

async function exchangeGoogleCode(code: string, config: GoogleOAuthConfig): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('redirect_uri', config.redirectUri)
  body.set('client_id', config.clientId)
  body.set('client_secret', config.clientSecret)

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const payload = await readResponseJson(response)
  if (!response.ok) throw new ValidationError(readGoogleError(payload, `Google token exchange failed with ${response.status}.`))
  return payload as GoogleTokenResponse
}

async function refreshGoogleAccessToken(connection: typeof googleConnections.$inferSelect, req?: Request) {
  if (!connection.encryptedRefreshToken) throw new ValidationError('Google connection has no refresh token. Reconnect Google Search Console.')
  const config = requireGoogleOAuthConfig(req)
  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', decryptSecret(connection.encryptedRefreshToken))
  body.set('client_id', config.clientId)
  body.set('client_secret', config.clientSecret)

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const payload = await readResponseJson(response)
  if (!response.ok) throw new ValidationError(readGoogleError(payload, `Google token refresh failed with ${response.status}.`))
  const token = payload as GoogleTokenResponse
  const accessToken = readRequiredString(token.access_token, 'access_token')
  const now = new Date()
  const [updated] = await getDb()
    .update(googleConnections)
    .set({
      encryptedAccessToken: encryptSecret(accessToken),
      tokenExpiresAt: secondsFromNow(token.expires_in, now),
      scopes: readTokenScopes(token.scope, connection.scopes ?? []),
      status: 'active',
      statusMessage: null,
      lastRefreshedAt: now,
      updatedAt: now,
    })
    .where(eq(googleConnections.id, connection.id))
    .returning()
  return { connection: updated, accessToken }
}

async function accessTokenForConnection(connection: typeof googleConnections.$inferSelect, req?: Request) {
  const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0
  if (connection.encryptedAccessToken && expiresAt > Date.now() + 60_000) {
    await getDb().update(googleConnections).set({ lastUsedAt: new Date() }).where(eq(googleConnections.id, connection.id))
    return decryptSecret(connection.encryptedAccessToken)
  }
  const refreshed = await refreshGoogleAccessToken(connection, req)
  return refreshed.accessToken
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!response.ok) return null
  const body = ensureRecord(await response.json().catch(() => ({})))
  return {
    sub: readOptionalString(body.sub),
    email: readOptionalString(body.email),
    name: readOptionalString(body.name),
    picture: readOptionalString(body.picture),
  }
}

async function fetchSearchConsoleSites(accessToken: string): Promise<SearchConsoleSiteEntry[]> {
  const response = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const payload = await readResponseJson(response)
  if (!response.ok) throw new ValidationError(readGoogleError(payload, `Search Console sites request failed with ${response.status}.`))
  const payloadRecord = ensureRecord(payload)
  const entries = Array.isArray(payloadRecord.siteEntry) ? payloadRecord.siteEntry : []
  return entries
    .filter(isRecord)
    .map((entry: Record<string, unknown>) => ({
      siteUrl: readRequiredString(entry.siteUrl, 'siteUrl'),
      permissionLevel: readOptionalString(entry.permissionLevel),
    }))
}

async function upsertSearchConsoleProperties({
  organizationId,
  connectionId,
  sites,
}: {
  organizationId: string
  connectionId: string
  sites: SearchConsoleSiteEntry[]
}) {
  const db = getDb()
  const existing = await db.select().from(searchConsoleProperties).where(eq(searchConsoleProperties.organizationId, organizationId))
  const existingBySite = new Map(existing.map((entry) => [entry.siteUrl, entry]))
  const hasSelected = existing.some((entry) => entry.selected)
  const now = new Date()
  const saved: Array<typeof searchConsoleProperties.$inferSelect> = []

  for (const [index, site] of sites.entries()) {
    const current = existingBySite.get(site.siteUrl)
    const values = {
      organizationId,
      connectionId,
      siteUrl: site.siteUrl,
      displayName: displayNameForSiteUrl(site.siteUrl),
      permissionLevel: site.permissionLevel,
      selected: current?.selected ?? (!hasSelected && index === 0),
      status: 'active',
      lastSyncedAt: now,
      metadata: {
        ...(current?.metadata ?? {}),
        source: 'google_sites_list',
      },
      updatedAt: now,
    } satisfies Partial<typeof searchConsoleProperties.$inferInsert>
    const [property] = current
      ? await db.update(searchConsoleProperties).set(values).where(eq(searchConsoleProperties.id, current.id)).returning()
      : await db.insert(searchConsoleProperties).values({ ...values, createdAt: now }).returning()
    saved.push(property)
  }
  return saved
}

async function submitSitemap({ accessToken, siteUrl, sitemapUrl }: { accessToken: string; siteUrl: string; sitemapUrl: string }) {
  const response = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!response.ok) {
    const payload = await readResponseJson(response)
    throw new ValidationError(readGoogleError(payload, `Search Console sitemap submit failed with ${response.status}.`))
  }
}

export async function syncSearchConsoleAnalyticsForProperty({
  propertyId,
  user,
  req,
  body = {},
}: {
  propertyId: string
  user?: JWTPayload
  req?: Request
  body?: Record<string, unknown>
}) {
  const property = await readSearchConsolePropertyForSync({ propertyId, user })
  const connection = await readGoogleConnectionForSync({
    organizationId: property.organizationId,
    connectionId: property.connectionId,
    user,
  })
  const accessToken = await accessTokenForConnection(connection, req)
  const range = searchAnalyticsRange(body)
  const searchType = readOptionalString(body.searchType) ?? 'web'
  const rowLimit = readPositiveInteger(body.rowLimit, 25_000)
  const rows = await fetchSearchAnalytics({
    accessToken,
    siteUrl: property.siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    searchType,
    rowLimit,
  })
  const inserted = await saveSearchAnalyticsRows({
    organizationId: property.organizationId,
    propertyId: property.id,
    searchType,
    rows,
  })

  const now = new Date()
  await getDb()
    .update(searchConsoleProperties)
    .set({ lastSyncedAt: now, updatedAt: now })
    .where(eq(searchConsoleProperties.id, property.id))

  await recordGoogleActivity({
    organizationId: property.organizationId,
    eventType: 'search_console_search_analytics_synced',
    summary: `Synced ${inserted} Search Console row${inserted === 1 ? '' : 's'}`,
    details: {
      propertyId: property.id,
      siteUrl: property.siteUrl,
      ...range,
      searchType,
      rowLimit,
      trigger: readOptionalString(body.trigger) ?? (user ? 'manual' : 'scheduled'),
    },
  })

  return {
    property,
    rows: inserted,
    ...range,
    searchType,
    rowLimit,
  }
}

async function fetchSearchAnalytics({
  accessToken,
  siteUrl,
  startDate,
  endDate,
  searchType,
  rowLimit,
}: {
  accessToken: string
  siteUrl: string
  startDate: string
  endDate: string
  searchType: string
  rowLimit: number
}) {
  const response = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['date', 'page', 'query', 'country', 'device'],
      type: searchType,
      dataState: 'final',
      rowLimit,
    }),
  })
  const payload = await readResponseJson(response)
  if (!response.ok) throw new ValidationError(readGoogleError(payload, `Search Console analytics request failed with ${response.status}.`))
  const rows = ensureRecord(payload).rows
  return Array.isArray(rows) ? rows.filter(isRecord) as SearchAnalyticsRow[] : []
}

async function saveSearchAnalyticsRows({
  organizationId,
  propertyId,
  searchType,
  rows,
}: {
  organizationId: string
  propertyId: string
  searchType: string
  rows: SearchAnalyticsRow[]
}) {
  if (rows.length === 0) return 0
  const outputs = await getDb()
    .select()
    .from(mktContentOutputs)
    .where(eq(mktContentOutputs.organizationId, organizationId))
  const outputByUrl = new Map<string, typeof outputs[number]>()
  for (const output of outputs) {
    if (output.publicUrl) outputByUrl.set(normalizeUrl(output.publicUrl), output)
    if (output.canonicalUrl) outputByUrl.set(normalizeUrl(output.canonicalUrl), output)
  }

  const now = new Date()
  const values = rows.map((row) => {
    const keys = Array.isArray(row.keys) ? row.keys : []
    const dataDate = readKey(keys, 0)
    const page = readKey(keys, 1)
    const query = readKey(keys, 2)
    const country = readKey(keys, 3)
    const device = readKey(keys, 4)
    if (!dataDate) throw new ValidationError('Search Console returned a row without a date.')
    const output = page ? outputByUrl.get(normalizeUrl(page)) : null
    return {
      id: randomUUID(),
      organizationId,
      propertyId,
      contentItemId: output?.contentItemId ?? null,
      contentOutputId: output?.id ?? null,
      dataDate,
      searchType,
      page,
      query,
      country,
      device,
      clicks: Math.round(readNumber(row.clicks)),
      impressions: Math.round(readNumber(row.impressions)),
      ctr: String(readNumber(row.ctr)),
      position: String(readNumber(row.position)),
      metadata: {},
      fetchedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  })

  const chunkSize = 500
  let saved = 0
  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize)
    await getDb()
      .insert(searchConsoleMetricSnapshots)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          searchConsoleMetricSnapshots.propertyId,
          searchConsoleMetricSnapshots.dataDate,
          searchConsoleMetricSnapshots.searchType,
          searchConsoleMetricSnapshots.page,
          searchConsoleMetricSnapshots.query,
          searchConsoleMetricSnapshots.country,
          searchConsoleMetricSnapshots.device,
        ],
        set: {
          contentItemId: sql`excluded.content_item_id`,
          contentOutputId: sql`excluded.content_output_id`,
          clicks: sql`excluded.clicks`,
          impressions: sql`excluded.impressions`,
          ctr: sql`excluded.ctr`,
          position: sql`excluded.position`,
          fetchedAt: now,
          updatedAt: now,
        },
      })
    saved += chunk.length
  }
  return saved
}

async function inspectUrl({ accessToken, siteUrl, inspectionUrl }: { accessToken: string; siteUrl: string; inspectionUrl: string }) {
  const response = await fetch(URL_INSPECTION_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ siteUrl, inspectionUrl, languageCode: 'es-MX' }),
  })
  const payload = await readResponseJson(response)
  if (!response.ok) throw new ValidationError(readGoogleError(payload, `Search Console URL inspection failed with ${response.status}.`))
  return ensureRecord(payload)
}

async function saveUrlInspection({
  property,
  inspectionUrl,
  rawResult,
}: {
  property: typeof searchConsoleProperties.$inferSelect
  inspectionUrl: string
  rawResult: Record<string, unknown>
}) {
  const outputs = await getDb()
    .select()
    .from(mktContentOutputs)
    .where(eq(mktContentOutputs.organizationId, property.organizationId))
  const output = outputs.find((entry) => (
    normalizeUrl(entry.publicUrl) === normalizeUrl(inspectionUrl) ||
    normalizeUrl(entry.canonicalUrl) === normalizeUrl(inspectionUrl)
  ))
  const inspectionResult = ensureRecord(rawResult.inspectionResult)
  const indexStatus = ensureRecord(inspectionResult.indexStatusResult)
  const now = new Date()
  const values = {
    organizationId: property.organizationId,
    propertyId: property.id,
    contentItemId: output?.contentItemId ?? null,
    contentOutputId: output?.id ?? null,
    inspectionUrl,
    verdict: readOptionalString(indexStatus.verdict),
    coverageState: readOptionalString(indexStatus.coverageState),
    indexingState: readOptionalString(indexStatus.indexingState),
    robotsTxtState: readOptionalString(indexStatus.robotsTxtState),
    lastCrawlTime: parseOptionalDate(readOptionalString(indexStatus.lastCrawlTime)),
    inspectedAt: now,
    rawResult,
    updatedAt: now,
  } satisfies Partial<typeof searchConsoleUrlInspections.$inferInsert>

  const [existing] = await getDb()
    .select()
    .from(searchConsoleUrlInspections)
    .where(and(eq(searchConsoleUrlInspections.propertyId, property.id), eq(searchConsoleUrlInspections.inspectionUrl, inspectionUrl)))
    .limit(1)
  const [saved] = existing
    ? await getDb().update(searchConsoleUrlInspections).set(values).where(eq(searchConsoleUrlInspections.id, existing.id)).returning()
    : await getDb().insert(searchConsoleUrlInspections).values({ ...values, createdAt: now }).returning()
  return saved
}

async function requireGoogleConnection({
  organizationId,
  connectionId,
  user,
}: {
  organizationId: string
  connectionId?: string | null
  user?: JWTPayload
}) {
  if (!(await canAccessOrganization(organizationId, user))) {
    throw new NotFoundError('Organization not found.')
  }
  const db = getDb()
  const [connection] = connectionId
    ? await db
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.id, connectionId), eq(googleConnections.organizationId, organizationId)))
      .limit(1)
    : await db
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, organizationId), eq(googleConnections.status, 'active')))
      .orderBy(desc(googleConnections.updatedAt))
      .limit(1)

  if (!connection) throw new ValidationError('Connect Google Search Console first.')
  return connection
}

async function readGoogleConnectionForSync({
  organizationId,
  connectionId,
  user,
}: {
  organizationId: string
  connectionId?: string | null
  user?: JWTPayload
}) {
  if (user) return requireGoogleConnection({ organizationId, connectionId, user })
  const [connection] = connectionId
    ? await getDb()
      .select()
      .from(googleConnections)
      .where(and(
        eq(googleConnections.id, connectionId),
        eq(googleConnections.organizationId, organizationId),
        eq(googleConnections.status, 'active'),
      ))
      .limit(1)
    : await getDb()
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, organizationId), eq(googleConnections.status, 'active')))
      .orderBy(desc(googleConnections.updatedAt))
      .limit(1)

  if (!connection) throw new ValidationError('Connect Google Search Console first.')
  return connection
}

async function requireSearchConsoleProperty({ propertyId, user }: { propertyId: string; user?: JWTPayload }) {
  const [property] = await getDb().select().from(searchConsoleProperties).where(eq(searchConsoleProperties.id, propertyId)).limit(1)
  if (!property || !(await canAccessOrganization(property.organizationId, user))) {
    throw new NotFoundError('Search Console property not found.')
  }
  if (!property.connectionId) throw new ValidationError('Search Console property has no Google connection.')
  return property
}

async function readSearchConsolePropertyForSync({ propertyId, user }: { propertyId: string; user?: JWTPayload }) {
  if (user) return requireSearchConsoleProperty({ propertyId, user })
  const [property] = await getDb()
    .select()
    .from(searchConsoleProperties)
    .where(and(eq(searchConsoleProperties.id, propertyId), eq(searchConsoleProperties.status, 'active')))
    .limit(1)
  if (!property) throw new NotFoundError('Search Console property not found.')
  if (!property.connectionId) throw new ValidationError('Search Console property has no Google connection.')
  return property
}

async function findExistingGoogleConnection({
  organizationId,
  providerAccountId,
  providerAccountEmail,
}: {
  organizationId: string
  providerAccountId: string | null
  providerAccountEmail: string | null
}) {
  const connections = await getDb()
    .select()
    .from(googleConnections)
    .where(eq(googleConnections.organizationId, organizationId))
  return connections.find((connection) => (
    (providerAccountId && connection.providerAccountId === providerAccountId) ||
    (providerAccountEmail && connection.providerAccountEmail === providerAccountEmail)
  )) ?? null
}

async function canAccessOrganization(organizationId: string, user: JWTPayload | undefined) {
  const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  if (!organization) return false
  return user?.canAccessUnscoped || user?.organizationIds.includes(organization.id) || false
}

async function recordGoogleActivity({
  organizationId,
  eventType,
  summary,
  details,
}: {
  organizationId: string
  eventType: string
  summary: string
  details: Record<string, unknown>
}) {
  const now = new Date()
  await getDb().insert(activityEvents).values({
    organizationId,
    occurredAt: now,
    createdAt: now,
    eventType,
    activityKind: 'progress',
    origin: 'pach_work',
    subjectType: 'search_console',
    actorType: 'agent',
    actorName: 'google_search_console',
    source: 'google_search_console',
    severity: 'info',
    summary,
    details,
    metadata: {},
  })
}

type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

function googleOAuthConfig(req?: Request): Partial<GoogleOAuthConfig> {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: defaultGoogleRedirectUri(req),
  }
}

function requireGoogleOAuthConfig(req?: Request): GoogleOAuthConfig {
  const config = googleOAuthConfig(req)
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new ValidationError('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google Search Console.')
  }
  return config as GoogleOAuthConfig
}

function defaultGoogleRedirectUri(req?: Request) {
  const explicit = process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
  if (explicit) return explicit
  const baseUrl =
    process.env.PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    (req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3001')
  return `${baseUrl.replace(/\/+$/, '')}/google/search-console/oauth/callback`
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
      return 'http://localhost:5174'
    }
  }
  return 'http://localhost:5174'
}

function defaultGoogleReturnTo(req?: Request) {
  return `${defaultPortalBaseUrl(req)}/settings/search`
}

function safePortalReturnTo(value: string | null, req: Request) {
  const base = defaultPortalBaseUrl(req)
  if (!value) return `${base}/settings/search`
  try {
    const candidate = new URL(value, base)
    if (candidate.origin === new URL(base).origin) return candidate.toString()
  } catch {
    return `${base}/settings/search`
  }
  return `${base}/settings/search`
}

function redirectWithGoogleResult(
  res: ExpressResponse,
  returnTo: string,
  status: 'connected' | 'failed',
  message: string,
) {
  const url = new URL(returnTo)
  url.searchParams.set('google_search_console', status)
  url.searchParams.set('message', message)
  res.redirect(url.toString())
}

function encodeOAuthState(state: OAuthState) {
  const body = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
  const signature = createHmac('sha256', oauthStateSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

function decodeOAuthState(value: string): OAuthState {
  const [body, signature] = value.split('.')
  if (!body || !signature) throw new ValidationError('Invalid Google OAuth state.')
  const expected = createHmac('sha256', oauthStateSecret()).update(body).digest('base64url')
  if (!safeEqual(signature, expected)) throw new ValidationError('Invalid Google OAuth state.')
  const state = ensureRecord(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))) as Partial<OAuthState>
  if (!state.organizationId || !state.returnTo || !state.nonce || typeof state.iat !== 'number' || typeof state.exp !== 'number') {
    throw new ValidationError('Invalid Google OAuth state.')
  }
  if (Date.now() > state.exp) throw new ValidationError('Google OAuth state expired. Start the connection again.')
  return state as OAuthState
}

function oauthStateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.ZERO_AUTH_SECRET || 'pach-local-google-oauth-state'
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function searchAnalyticsRange(body: Record<string, unknown>) {
  const startDate = readOptionalString(body.startDate) ?? isoDateDaysAgo(32)
  const endDate = readOptionalString(body.endDate) ?? isoDateDaysAgo(2)
  return { startDate, endDate }
}

function isoDateDaysAgo(days: number) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

function defaultSitemapUrl(siteUrl: string) {
  if (siteUrl.startsWith('sc-domain:')) return `https://${siteUrl.replace(/^sc-domain:/, '')}/sitemap.xml`
  return `${siteUrl.replace(/\/+$/, '')}/sitemap.xml`
}

function displayNameForSiteUrl(siteUrl: string) {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.replace(/^sc-domain:/, '')
  try {
    const url = new URL(siteUrl)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return siteUrl
  }
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return value.replace(/\/+$/, '')
  }
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

function parseOptionalDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function readKey(keys: unknown[], index: number) {
  const value = keys[index]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readPositiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 25_000) : fallback
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

function readGoogleError(payload: unknown, fallback: string) {
  const body = ensureRecord(payload)
  const nested = ensureRecord(body.error)
  return (
    readOptionalString(nested.message) ||
    readOptionalString(body.error_description) ||
    readOptionalString(body.message) ||
    readOptionalString(body.error) ||
    fallback
  )
}

function serializeDates<T>(value: T): T {
  if (value instanceof Date) return value.getTime() as T
  if (Array.isArray(value)) return value.map(serializeDates) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeDates(entry)])) as T
}

function authenticatedUser(req: Request) {
  return (req as Request & { user?: JWTPayload }).user
}

function ensureRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required.`)
  return value.trim()
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function handleRouteError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown, code: string, message: string) {
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: 'NOT_FOUND', message: error.message })
    return
  }
  if (error instanceof ValidationError) {
    res.status(400).json({ error: 'VALIDATION', message: error.message })
    return
  }
  console.error(code, error)
  res.status(500).json({ error: code, message })
}

class ValidationError extends Error {}
class NotFoundError extends Error {}

export { publicRouter as publicGoogleRouter }
export default router
