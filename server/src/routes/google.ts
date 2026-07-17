import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response as ExpressResponse } from 'express'
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import {
  activityEvents,
  googleAdsAccounts,
  googleConnections,
  mktAdMetricSnapshots,
  mktAdPromotions,
  mktContentOutputs,
  organizations,
  searchConsoleDailySnapshots,
  searchConsoleDimensionSummaries,
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
const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com'
const DEFAULT_GOOGLE_ADS_API_VERSION = 'v24'
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const DEFAULT_SEARCH_CONSOLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/adwords',
]
const DEFAULT_SEARCH_ANALYTICS_LOOKBACK_DAYS = 92
const SEARCH_ANALYTICS_FINAL_DATA_LAG_DAYS = 2
const SEARCH_ANALYTICS_DAILY_DIMENSIONS = ['date'] as const
const SEARCH_ANALYTICS_PAGE_DIMENSIONS = ['page'] as const
const SEARCH_ANALYTICS_QUERY_DIMENSIONS = ['query'] as const
const SEARCH_ANALYTICS_PAGE_QUERY_DIMENSIONS = ['page', 'query'] as const
const DEFAULT_SEARCH_ANALYTICS_PAGE_LIMIT = 100
const DEFAULT_SEARCH_ANALYTICS_QUERY_LIMIT = 100
const DEFAULT_SEARCH_ANALYTICS_OPPORTUNITY_LIMIT = 250
const DEFAULT_SEARCH_ANALYTICS_DAILY_LIMIT = 500

type SearchAnalyticsSummaryType = 'page' | 'query' | 'page_query'

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

type GoogleAdsAccountDiscovery = {
  customerId: string
  managerCustomerId: string | null
  descriptiveName: string
  currencyCode: string
  timeZone: string
  isManager: boolean
  isTestAccount: boolean
  providerStatus: string | null
}

class GoogleAdsApiError extends Error {
  status: number
  requestId: string | null
  payload: unknown

  constructor(message: string, status: number, requestId: string | null, payload: unknown) {
    super(message)
    this.name = 'GoogleAdsApiError'
    this.status = status
    this.requestId = requestId
    this.payload = payload
  }
}

router.get('/ads/settings', async (req, res) => {
  try {
    const organizationId = readRequiredString(req.query.organizationId, 'organizationId')
    if (!(await canAccessOrganization(organizationId, authenticatedUser(req)))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found.' })
      return
    }
    const oauth = googleOAuthConfig(req)
    const ads = googleAdsConfig()
    res.json({
      defaults: {
        oauthConfigured: Boolean(oauth.clientId && oauth.clientSecret),
        developerTokenConfigured: Boolean(ads.developerToken),
        apiVersion: ads.apiVersion,
        redirectUri: defaultGoogleRedirectUri(req),
        scopes: DEFAULT_SEARCH_CONSOLE_SCOPES,
      },
    })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_ADS_SETTINGS_FAILED', 'Could not load Google Ads settings.')
  }
})

router.post('/ads/accounts/sync', async (req, res) => {
  try {
    const body = ensureRecord(req.body)
    const organizationId = readRequiredString(body.organizationId, 'organizationId')
    const connection = await requireGoogleConnection({
      organizationId,
      connectionId: readOptionalString(body.connectionId),
      user: authenticatedUser(req),
    })
    requireGoogleAdsScope(connection)
    const accessToken = await accessTokenForConnection(connection, req)
    const accounts = await discoverGoogleAdsAccounts({ accessToken, config: requireGoogleAdsConfig() })
    const saved = await upsertGoogleAdsAccounts({ organizationId, connectionId: connection.id, accounts })

    await recordGoogleActivity({
      organizationId,
      eventType: 'google_ads_accounts_synced',
      summary: `Synced ${saved.length} Google Ads account${saved.length === 1 ? '' : 's'}`,
      details: { count: saved.length, connectionId: connection.id },
    })
    res.json({ ok: true, accounts: saved.map(serializeDates) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_ADS_ACCOUNTS_SYNC_FAILED', 'Could not sync Google Ads accounts.')
  }
})

router.post('/ads/accounts/:accountId/select', async (req, res) => {
  try {
    const accountId = readRequiredString(req.params.accountId, 'accountId')
    const [account] = await getDb().select().from(googleAdsAccounts).where(eq(googleAdsAccounts.id, accountId)).limit(1)
    if (!account || !(await canAccessOrganization(account.organizationId, authenticatedUser(req)))) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Google Ads account not found.' })
      return
    }
    if (account.status !== 'active') throw new ValidationError('Only an active Google Ads account can be selected.')
    if (account.isManager) throw new ValidationError('Select an advertiser account, not a manager account.')

    const now = new Date()
    await getDb().update(googleAdsAccounts).set({ selected: false, updatedAt: now }).where(eq(googleAdsAccounts.organizationId, account.organizationId))
    const [selected] = await getDb()
      .update(googleAdsAccounts)
      .set({ selected: true, updatedAt: now })
      .where(eq(googleAdsAccounts.id, account.id))
      .returning()
    res.json({ ok: true, account: serializeDates(selected) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_ADS_ACCOUNT_SELECT_FAILED', 'Could not select Google Ads account.')
  }
})

router.post('/ads/promotions/:promotionId/publish', async (req, res) => {
  try {
    const promotionId = readRequiredString(req.params.promotionId, 'promotionId')
    const result = await publishGoogleAdsPromotion({ promotionId, user: authenticatedUser(req), req })
    res.json({ ok: true, idempotent: result.idempotent, promotion: serializeDates(result.promotion) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_ADS_PROMOTION_PUBLISH_FAILED', 'Could not publish the paused Google Ads campaign.')
  }
})

router.post('/ads/promotions/:promotionId/status', async (req, res) => {
  try {
    const promotionId = readRequiredString(req.params.promotionId, 'promotionId')
    const requestedStatus = readRequiredString(ensureRecord(req.body).status, 'status')
    if (requestedStatus !== 'active' && requestedStatus !== 'paused') {
      throw new ValidationError('Google Ads promotion status must be active or paused.')
    }
    const result = await setGoogleAdsPromotionServingStatus({
      promotionId,
      requestedStatus,
      user: authenticatedUser(req),
      req,
    })
    res.json({ ok: true, promotion: serializeDates(result.promotion), providerStatus: result.providerStatus })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_ADS_PROMOTION_STATUS_FAILED', 'Could not update the Google Ads campaign status.')
  }
})

router.post('/ads/promotions/:promotionId/metrics/sync', async (req, res) => {
  try {
    const promotionId = readRequiredString(req.params.promotionId, 'promotionId')
    const result = await syncGoogleAdsMetricsForPromotion({
      promotionId,
      user: authenticatedUser(req),
      req,
    })
    res.json({ ok: true, ...result, snapshots: result.snapshots.map(serializeDates) })
  } catch (error) {
    handleRouteError(res, error, 'GOOGLE_ADS_METRICS_SYNC_FAILED', 'Could not sync Google Ads campaign metrics.')
  }
})

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
    redirectWithGoogleResult(
      res,
      returnTo,
      'connected',
      `Google connected: ${connection.providerAccountEmail ?? connection.providerAccountName ?? 'Google account'}`,
      connection.id,
    )
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
    res.json({
      ok: true,
      rows: result.rows,
      dailyRows: result.dailyRows,
      summaries: result.summaries,
      summaryBreakdown: result.summaryBreakdown,
      writes: result.writes,
      startDate: result.startDate,
      endDate: result.endDate,
      searchType: result.searchType,
    })
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

async function discoverGoogleAdsAccounts({
  accessToken,
  config,
}: {
  accessToken: string
  config: GoogleAdsConfig
}) {
  const accessible = ensureRecord((await googleAdsRequest({
    accessToken,
    config,
    method: 'GET',
    path: '/customers:listAccessibleCustomers',
  })).payload)
  const customerIds = Array.isArray(accessible.resourceNames)
    ? accessible.resourceNames.map((value) => normalizeGoogleAdsCustomerId(readOptionalString(value))).filter(Boolean)
    : []
  if (!customerIds.length) throw new ValidationError('No Google Ads accounts are accessible to this Google account.')

  const discovered = new Map<string, GoogleAdsAccountDiscovery>()
  const detailResults = await Promise.allSettled(customerIds.map(async (customerId) => {
    const rows = await googleAdsSearch({
      accessToken,
      config,
      customerId,
      query: `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.status FROM customer LIMIT 1`,
    })
    const customer = ensureRecord(ensureRecord(rows[0]).customer)
    const direct = googleAdsAccountFromCustomer(customer, null, customerId)
    discovered.set(direct.customerId, direct)

    if (!direct.isManager) return
    const clientRows = await googleAdsSearch({
      accessToken,
      config,
      customerId,
      loginCustomerId: customerId,
      query: `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.test_account, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.level <= 1`,
    })
    for (const row of clientRows) {
      const client = ensureRecord(ensureRecord(row).customerClient)
      const clientId = normalizeGoogleAdsCustomerId(readOptionalString(client.id))
      if (!clientId || clientId === customerId) continue
      const current = discovered.get(clientId)
      if (!current || current.managerCustomerId) discovered.set(clientId, googleAdsAccountFromCustomer(client, customerId, clientId))
    }
  }))

  if (!discovered.size) {
    const firstError = detailResults.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    throw firstError?.reason instanceof Error ? firstError.reason : new ValidationError('Google Ads account details could not be loaded.')
  }
  return [...discovered.values()]
}

function googleAdsAccountFromCustomer(source: Record<string, unknown>, managerCustomerId: string | null, fallbackId: string): GoogleAdsAccountDiscovery {
  const customerId = normalizeGoogleAdsCustomerId(readOptionalString(source.id)) || fallbackId
  return {
    customerId,
    managerCustomerId,
    descriptiveName: readOptionalString(source.descriptiveName) ?? `Google Ads ${formatGoogleAdsCustomerId(customerId)}`,
    currencyCode: readOptionalString(source.currencyCode) ?? 'USD',
    timeZone: readOptionalString(source.timeZone) ?? 'UTC',
    isManager: source.manager === true,
    isTestAccount: source.testAccount === true,
    providerStatus: readOptionalString(source.status),
  }
}

async function upsertGoogleAdsAccounts({
  organizationId,
  connectionId,
  accounts,
}: {
  organizationId: string
  connectionId: string
  accounts: GoogleAdsAccountDiscovery[]
}) {
  const db = getDb()
  const now = new Date()
  const existing = await db.select().from(googleAdsAccounts).where(eq(googleAdsAccounts.organizationId, organizationId))
  const byCustomerId = new Map(existing.map((account) => [account.customerId, account]))
  const saved: Array<typeof googleAdsAccounts.$inferSelect> = []

  for (const account of accounts) {
    const current = byCustomerId.get(account.customerId)
    const values = {
      organizationId,
      connectionId,
      customerId: account.customerId,
      managerCustomerId: account.managerCustomerId,
      descriptiveName: account.descriptiveName,
      currencyCode: account.currencyCode,
      timeZone: account.timeZone,
      isManager: account.isManager,
      isTestAccount: account.isTestAccount,
      selected: current?.selected ?? false,
      // Google Ads test accounts intentionally report CLOSED because they cannot
      // serve ads, but they remain valid mutation targets for API development.
      status: !account.isTestAccount && (account.providerStatus === 'CANCELED' || account.providerStatus === 'CLOSED') ? 'inactive' : 'active',
      statusMessage: null,
      lastSyncedAt: now,
      metadata: { providerStatus: account.providerStatus, source: account.managerCustomerId ? 'manager_customer_client' : 'accessible_customer' },
      updatedAt: now,
    } satisfies Partial<typeof googleAdsAccounts.$inferInsert>
    const [row] = current
      ? await db.update(googleAdsAccounts).set(values).where(eq(googleAdsAccounts.id, current.id)).returning()
      : await db.insert(googleAdsAccounts).values({ ...values, createdAt: now }).returning()
    saved.push(row)
  }

  const discoveredIds = accounts.map((account) => account.customerId)
  if (discoveredIds.length) {
    await db.update(googleAdsAccounts)
      .set({ status: 'inactive', selected: false, statusMessage: 'Account was not returned by the latest Google Ads sync.', updatedAt: now })
      .where(and(
        eq(googleAdsAccounts.organizationId, organizationId),
        eq(googleAdsAccounts.connectionId, connectionId),
        notInArray(googleAdsAccounts.customerId, discoveredIds),
      ))
  }
  return saved
}

async function publishGoogleAdsPromotion({ promotionId, user, req }: { promotionId: string; user?: JWTPayload; req: Request }) {
  const db = getDb()
  const [promotion] = await db.select().from(mktAdPromotions).where(eq(mktAdPromotions.id, promotionId)).limit(1)
  if (!promotion || !(await canAccessOrganization(promotion.organizationId, user))) throw new NotFoundError('Google Ads promotion not found.')
  if (promotion.provider !== 'google') throw new ValidationError('Only Google promotion drafts can be published to Google Ads.')
  if (promotion.campaignExternalId) return { idempotent: true, promotion }

  const [account] = await db.select().from(googleAdsAccounts).where(and(
    eq(googleAdsAccounts.organizationId, promotion.organizationId),
    eq(googleAdsAccounts.selected, true),
    eq(googleAdsAccounts.status, 'active'),
  )).limit(1)
  if (!account) throw new ValidationError('Select a synchronized Google Ads advertiser account in Settings first.')
  if (account.isManager) throw new ValidationError('The selected Google Ads account is a manager. Select an advertiser account.')
  if (promotion.adAccountExternalId && normalizeGoogleAdsCustomerId(promotion.adAccountExternalId) !== account.customerId) {
    throw new ValidationError('This draft points to a different Google Ads account. Save it again with the selected account.')
  }

  const connection = await requireGoogleConnection({ organizationId: promotion.organizationId, connectionId: account.connectionId, user })
  requireGoogleAdsScope(connection)
  const config = requireGoogleAdsConfig()
  const draft = validateGoogleAdsPromotionDraft(promotion, account)
  const operationKey = promotion.publishOperationKey ?? randomUUID()
  const now = new Date()
  const [claimed] = await db.update(mktAdPromotions)
    .set({ status: 'publishing', publishOperationKey: operationKey, publishError: null, updatedAt: now })
    .where(and(eq(mktAdPromotions.id, promotion.id), inArray(mktAdPromotions.status, ['draft', 'ready', 'failed'])))
    .returning()
  if (!claimed) {
    const [current] = await db.select().from(mktAdPromotions).where(eq(mktAdPromotions.id, promotion.id)).limit(1)
    if (current?.campaignExternalId) return { idempotent: true, promotion: current }
    throw new ValidationError(current?.status === 'publishing' ? 'This draft is already being published.' : 'This draft is not publishable in its current state.')
  }

  try {
    const accessToken = await accessTokenForConnection(connection, req)
    let publish = await findExistingGoogleAdsCampaign({ accessToken, config, account, promotion: claimed, draft })
    if (!publish) {
      const targetConstants = await resolveGoogleAdsTargetConstants({
        accessToken,
        config,
        customerId: account.customerId,
        loginCustomerId: account.managerCustomerId,
        geo: draft.geo,
        language: draft.language,
      })
      publish = await createPausedGoogleSearchCampaign({
        accessToken,
        config,
        account,
        promotion: claimed,
        draft,
        targetConstants,
      })
    }
    const publishedAt = new Date()
    const [saved] = await db.update(mktAdPromotions).set({
      adAccountExternalId: account.customerId,
      campaignBudgetExternalId: publish.campaignBudgetId,
      campaignExternalId: publish.campaignId,
      adGroupExternalId: publish.adGroupId,
      creativeExternalId: publish.creativeId,
      status: 'paused',
      publishError: null,
      providerResponse: publish.providerResponse,
      publishedAt,
      metadata: {
        ...promotion.metadata,
        publishMode: 'provider_paused',
        googleAdsAccountId: account.id,
        managerCustomerId: account.managerCustomerId,
        operationKey,
      },
      updatedAt: publishedAt,
    }).where(eq(mktAdPromotions.id, promotion.id)).returning()
    await recordGoogleActivity({
      organizationId: promotion.organizationId,
      eventType: 'google_ads_campaign_published_paused',
      summary: `Published paused Google Ads campaign ${publish.campaignId}`,
      details: { promotionId: promotion.id, accountId: account.id, customerId: account.customerId, campaignId: publish.campaignId, operationKey },
    })
    return { idempotent: false, promotion: saved }
  } catch (error) {
    const failedAt = new Date()
    const failure = googleAdsFailureDetails(error)
    await db.update(mktAdPromotions).set({
      status: 'failed',
      publishError: failure.message,
      providerResponse: failure.providerResponse,
      updatedAt: failedAt,
    }).where(and(eq(mktAdPromotions.id, promotion.id), eq(mktAdPromotions.publishOperationKey, operationKey)))
    throw error
  }
}

async function setGoogleAdsPromotionServingStatus({
  promotionId,
  requestedStatus,
  user,
  req,
}: {
  promotionId: string
  requestedStatus: 'active' | 'paused'
  user?: JWTPayload
  req: Request
}) {
  const db = getDb()
  const [promotion] = await db.select().from(mktAdPromotions).where(eq(mktAdPromotions.id, promotionId)).limit(1)
  if (!promotion || !(await canAccessOrganization(promotion.organizationId, user))) throw new NotFoundError('Google Ads promotion not found.')
  if (promotion.provider !== 'google') throw new ValidationError('Only Google Ads promotions support this status action.')
  if (!promotion.adAccountExternalId || !promotion.campaignExternalId || !promotion.adGroupExternalId || !promotion.creativeExternalId) {
    throw new ValidationError('Publish this campaign to Google Ads before changing its serving status.')
  }

  const customerId = normalizeGoogleAdsCustomerId(promotion.adAccountExternalId)
  const [account] = await db.select().from(googleAdsAccounts).where(and(
    eq(googleAdsAccounts.organizationId, promotion.organizationId),
    eq(googleAdsAccounts.customerId, customerId),
    eq(googleAdsAccounts.status, 'active'),
  )).limit(1)
  if (!account) throw new ValidationError('The Google Ads advertiser used by this campaign is not currently available. Sync accounts and try again.')
  if (account.isManager) throw new ValidationError('A Google Ads manager account cannot serve campaigns.')

  const connection = await requireGoogleConnection({ organizationId: promotion.organizationId, connectionId: account.connectionId, user })
  requireGoogleAdsScope(connection)
  const config = requireGoogleAdsConfig()
  const accessToken = await accessTokenForConnection(connection, req)
  const providerStatus = requestedStatus === 'active' ? 'ENABLED' : 'PAUSED'

  try {
    const transition = await updateGoogleAdsServingEntities({
      accessToken,
      config,
      account,
      promotion,
      providerStatus,
    })
    const updatedAt = new Date()
    const [saved] = await db.update(mktAdPromotions).set({
      status: requestedStatus,
      publishError: null,
      providerResponse: {
        ...ensureRecord(promotion.providerResponse),
        lifecycle: {
          providerStatus,
          requestId: transition.requestId,
          keywordCount: transition.keywordCount,
          updatedAt: updatedAt.toISOString(),
        },
      },
      metadata: {
        ...ensureRecord(promotion.metadata),
        publishMode: requestedStatus === 'active' ? 'provider_enabled' : 'provider_paused',
        lastLifecycleAction: requestedStatus,
        lastLifecycleActionAt: updatedAt.toISOString(),
      },
      updatedAt,
    }).where(eq(mktAdPromotions.id, promotion.id)).returning()

    await recordGoogleActivity({
      organizationId: promotion.organizationId,
      eventType: requestedStatus === 'active' ? 'google_ads_campaign_enabled' : 'google_ads_campaign_paused',
      summary: `${requestedStatus === 'active' ? 'Enabled' : 'Paused'} Google Ads campaign ${promotion.campaignExternalId}`,
      details: {
        promotionId: promotion.id,
        accountId: account.id,
        customerId,
        campaignId: promotion.campaignExternalId,
        isTestAccount: account.isTestAccount,
        requestId: transition.requestId,
      },
    })
    return { promotion: saved, providerStatus }
  } catch (error) {
    const failure = googleAdsFailureDetails(error)
    await db.update(mktAdPromotions).set({
      publishError: failure.message,
      providerResponse: {
        ...ensureRecord(promotion.providerResponse),
        lifecycleError: failure.providerResponse,
      },
      updatedAt: new Date(),
    }).where(eq(mktAdPromotions.id, promotion.id))
    throw error
  }
}

export async function syncGoogleAdsMetricsForPromotion({
  promotionId,
  user,
  req,
  now = new Date(),
}: {
  promotionId: string
  user?: JWTPayload
  req?: Request
  now?: Date
}) {
  const db = getDb()
  const [promotion] = await db.select().from(mktAdPromotions).where(eq(mktAdPromotions.id, promotionId)).limit(1)
  if (!promotion || (user && !(await canAccessOrganization(promotion.organizationId, user)))) {
    throw new NotFoundError('Google Ads promotion not found.')
  }
  if (promotion.provider !== 'google' || !promotion.campaignExternalId || !promotion.adAccountExternalId) {
    throw new ValidationError('Publish this Google Ads campaign before synchronizing metrics.')
  }

  const customerId = normalizeGoogleAdsCustomerId(promotion.adAccountExternalId)
  const [account] = await db.select().from(googleAdsAccounts).where(and(
    eq(googleAdsAccounts.organizationId, promotion.organizationId),
    eq(googleAdsAccounts.customerId, customerId),
    eq(googleAdsAccounts.status, 'active'),
  )).limit(1)
  if (!account) throw new ValidationError('The Google Ads advertiser is unavailable. Sync accounts and try again.')
  if (account.isManager) throw new ValidationError('A Google Ads manager account does not have campaign metrics.')

  const connection = await readGoogleConnectionForSync({
    organizationId: promotion.organizationId,
    connectionId: account.connectionId,
    user,
  })
  requireGoogleAdsScope(connection)
  const accessToken = await accessTokenForConnection(connection, req)
  const config = requireGoogleAdsConfig()
  const endDate = formatGoogleAdsDate(now, account.timeZone)
  const startDate = formatGoogleAdsDate(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000), account.timeZone)
  const rows = await googleAdsSearch({
    accessToken,
    config,
    customerId,
    loginCustomerId: account.managerCustomerId,
    query: [
      'SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks,',
      'metrics.cost_micros, metrics.conversions, metrics.average_cpc',
      'FROM campaign',
      `WHERE campaign.id = ${promotion.campaignExternalId}`,
      `AND segments.date BETWEEN '${startDate}' AND '${endDate}'`,
      'ORDER BY segments.date ASC',
    ].join(' '),
  })

  const existing = await db.select().from(mktAdMetricSnapshots).where(and(
    eq(mktAdMetricSnapshots.promotionId, promotion.id),
    eq(mktAdMetricSnapshots.provider, 'google'),
    eq(mktAdMetricSnapshots.granularity, 'daily'),
  ))
  const existingByDate = new Map(existing.map((snapshot) => [formatGoogleAdsDate(snapshot.periodStart, 'UTC'), snapshot]))
  const snapshots: Array<typeof mktAdMetricSnapshots.$inferSelect> = []

  for (const row of rows) {
    const segments = ensureRecord(ensureRecord(row).segments)
    const metrics = ensureRecord(ensureRecord(row).metrics)
    const date = readOptionalString(segments.date)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const periodStart = new Date(`${date}T00:00:00.000Z`)
    const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000)
    const costMicros = readGoogleMetricNumber(metrics.costMicros)
    const conversions = readGoogleMetricNumber(metrics.conversions)
    const values = {
      organizationId: promotion.organizationId,
      promotionId: promotion.id,
      provider: 'google',
      entityKind: 'campaign',
      entityExternalId: promotion.campaignExternalId,
      adAccountExternalId: customerId,
      campaignExternalId: promotion.campaignExternalId,
      creativeExternalId: promotion.creativeExternalId,
      granularity: 'daily',
      periodStart,
      periodEnd,
      impressions: Math.round(readGoogleMetricNumber(metrics.impressions)),
      clicks: Math.round(readGoogleMetricNumber(metrics.clicks)),
      conversions: Math.round(conversions),
      spendMinor: Math.round(costMicros / 10_000),
      currencyCode: account.currencyCode,
      rawMetrics: {
        date,
        costMicros,
        conversions,
        averageCpcMicros: readGoogleMetricNumber(metrics.averageCpc),
      },
      fetchedAt: now,
    } satisfies Partial<typeof mktAdMetricSnapshots.$inferInsert>
    const current = existingByDate.get(date)
    const [saved] = current
      ? await db.update(mktAdMetricSnapshots).set(values).where(eq(mktAdMetricSnapshots.id, current.id)).returning()
      : await db.insert(mktAdMetricSnapshots).values(values as typeof mktAdMetricSnapshots.$inferInsert).returning()
    snapshots.push(saved)
  }

  await db.update(mktAdPromotions).set({
    metadata: {
      ...ensureRecord(promotion.metadata),
      googleAdsMetrics: {
        lastSyncedAt: now.toISOString(),
        startDate,
        endDate,
        rowCount: snapshots.length,
      },
    },
    updatedAt: now,
  }).where(eq(mktAdPromotions.id, promotion.id))

  await recordGoogleActivity({
    organizationId: promotion.organizationId,
    eventType: 'google_ads_campaign_metrics_synced',
    summary: `Synced ${snapshots.length} daily Google Ads metric row${snapshots.length === 1 ? '' : 's'}`,
    details: { promotionId: promotion.id, customerId, campaignId: promotion.campaignExternalId, startDate, endDate },
  })

  return { promotionId: promotion.id, startDate, endDate, rows: rows.length, writes: snapshots.length, snapshots }
}

async function updateGoogleAdsServingEntities({
  accessToken,
  config,
  account,
  promotion,
  providerStatus,
}: {
  accessToken: string
  config: GoogleAdsConfig
  account: typeof googleAdsAccounts.$inferSelect
  promotion: typeof mktAdPromotions.$inferSelect
  providerStatus: 'ENABLED' | 'PAUSED'
}) {
  const customerId = account.customerId
  const campaignResourceName = `customers/${customerId}/campaigns/${promotion.campaignExternalId}`
  const adGroupResourceName = `customers/${customerId}/adGroups/${promotion.adGroupExternalId}`
  const adGroupAdResourceName = `customers/${customerId}/adGroupAds/${promotion.adGroupExternalId}~${promotion.creativeExternalId}`
  const keywordRows = await googleAdsSearch({
    accessToken,
    config,
    customerId,
    loginCustomerId: account.managerCustomerId,
    query: `SELECT ad_group_criterion.resource_name FROM ad_group_criterion WHERE ad_group.id = ${promotion.adGroupExternalId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`,
  })
  const keywordResourceNames = keywordRows
    .map((row) => readOptionalString(ensureRecord(ensureRecord(row).adGroupCriterion).resourceName))
    .filter((resourceName): resourceName is string => Boolean(resourceName))
  if (!keywordResourceNames.length) throw new ValidationError('Google Ads did not return any active keyword resources for this campaign.')

  const campaignOperation = {
    campaignOperation: {
      update: { resourceName: campaignResourceName, status: providerStatus },
      updateMask: 'status',
    },
  }
  const adGroupOperation = {
    adGroupOperation: {
      update: { resourceName: adGroupResourceName, status: providerStatus },
      updateMask: 'status',
    },
  }
  const keywordOperations = keywordResourceNames.map((resourceName) => ({
    adGroupCriterionOperation: {
      update: { resourceName, status: providerStatus },
      updateMask: 'status',
    },
  }))
  const adOperation = {
    adGroupAdOperation: {
      update: { resourceName: adGroupAdResourceName, status: providerStatus },
      updateMask: 'status',
    },
  }
  const enabling = providerStatus === 'ENABLED'
  const operations = enabling
    ? [...keywordOperations, adOperation, adGroupOperation, campaignOperation]
    : [campaignOperation, adGroupOperation, ...keywordOperations, adOperation]
  const response = await googleAdsRequest({
    accessToken,
    config,
    loginCustomerId: account.managerCustomerId,
    method: 'POST',
    path: `/customers/${customerId}/googleAds:mutate`,
    body: { mutateOperations: operations, partialFailure: false, validateOnly: false },
  })
  return { requestId: response.requestId, keywordCount: keywordResourceNames.length }
}

function validateGoogleAdsPromotionDraft(
  promotion: typeof mktAdPromotions.$inferSelect,
  account: typeof googleAdsAccounts.$inferSelect,
) {
  const targeting = ensureRecord(promotion.targeting)
  const creative = ensureRecord(promotion.creative)
  const keywords = readStringArray(targeting.keywords).slice(0, 25)
  const headlines = readStringArray(creative.headlines).slice(0, 15)
  const descriptions = readStringArray(creative.descriptions).slice(0, 4)
  const finalUrl = readOptionalString(creative.finalUrl) ?? promotion.landingUrl
  const startDate = readOptionalString(targeting.startDate) ?? (promotion.startsAt ? formatGoogleAdsDate(promotion.startsAt, account.timeZone) : null)
  const endDate = readOptionalString(targeting.endDate) ?? (promotion.endsAt ? formatGoogleAdsDate(promotion.endsAt, account.timeZone) : null)
  const containsEuPoliticalAdvertising = readOptionalString(targeting.containsEuPoliticalAdvertising)
  if (!promotion.budgetMinor || promotion.budgetMinor <= 0) throw new ValidationError('A positive daily budget is required before publishing.')
  if (promotion.currencyCode !== account.currencyCode) throw new ValidationError(`Draft currency ${promotion.currencyCode} does not match the selected account currency ${account.currencyCode}.`)
  if (!finalUrl || !/^https:\/\//i.test(finalUrl)) throw new ValidationError('A public HTTPS landing URL is required before publishing.')
  if (!keywords.length) throw new ValidationError('At least one keyword is required before publishing.')
  if (keywords.some((keyword) => keyword.length > 80)) throw new ValidationError('Google Ads keywords must be 80 characters or fewer.')
  if (headlines.length < 3) throw new ValidationError('At least three headlines are required before publishing.')
  if (headlines.some((headline) => headline.length > 30)) throw new ValidationError('Google Ads headlines must be 30 characters or fewer.')
  if (descriptions.length < 2) throw new ValidationError('At least two descriptions are required before publishing.')
  if (descriptions.some((description) => description.length > 90)) throw new ValidationError('Google Ads descriptions must be 90 characters or fewer.')
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ValidationError('Google Ads start date must use YYYY-MM-DD format.')
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new ValidationError('Google Ads end date must use YYYY-MM-DD format.')
  if (startDate && endDate && endDate <= startDate) throw new ValidationError('Google Ads end date must be after the start date.')
  if (!containsEuPoliticalAdvertising || ![
    'CONTAINS_EU_POLITICAL_ADVERTISING',
    'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
  ].includes(containsEuPoliticalAdvertising)) {
    throw new ValidationError('Declare whether this campaign contains EU political advertising before publishing.')
  }
  return {
    budgetMinor: promotion.budgetMinor,
    finalUrl,
    keywords,
    headlines,
    descriptions,
    geo: (readOptionalString(targeting.geo) ?? 'MX').toUpperCase(),
    language: (readOptionalString(targeting.language) ?? 'es').toLowerCase(),
    startDate,
    endDate,
    containsEuPoliticalAdvertising,
  }
}

async function resolveGoogleAdsTargetConstants({
  accessToken,
  config,
  customerId,
  loginCustomerId,
  geo,
  language,
}: {
  accessToken: string
  config: GoogleAdsConfig
  customerId: string
  loginCustomerId: string | null
  geo: string
  language: string
}) {
  const [geoRows, languageRows] = await Promise.all([
    googleAdsSearch({
      accessToken,
      config,
      customerId,
      loginCustomerId,
      query: `SELECT geo_target_constant.resource_name FROM geo_target_constant WHERE geo_target_constant.country_code = '${escapeGaql(geo)}' AND geo_target_constant.target_type = 'Country' AND geo_target_constant.status = 'ENABLED' LIMIT 1`,
    }),
    googleAdsSearch({
      accessToken,
      config,
      customerId,
      loginCustomerId,
      query: `SELECT language_constant.resource_name FROM language_constant WHERE language_constant.code = '${escapeGaql(language)}' LIMIT 1`,
    }),
  ])
  const geoResourceName = readOptionalString(ensureRecord(ensureRecord(geoRows[0]).geoTargetConstant).resourceName)
  const languageResourceName = readOptionalString(ensureRecord(ensureRecord(languageRows[0]).languageConstant).resourceName)
  if (!geoResourceName) throw new ValidationError(`Google Ads does not have an enabled country target for ${geo}.`)
  if (!languageResourceName) throw new ValidationError(`Google Ads does not have a language target for ${language}.`)
  return { geoResourceName, languageResourceName }
}

async function createPausedGoogleSearchCampaign({
  accessToken,
  config,
  account,
  promotion,
  draft,
  targetConstants,
}: {
  accessToken: string
  config: GoogleAdsConfig
  account: typeof googleAdsAccounts.$inferSelect
  promotion: typeof mktAdPromotions.$inferSelect
  draft: ReturnType<typeof validateGoogleAdsPromotionDraft>
  targetConstants: { geoResourceName: string; languageResourceName: string }
}) {
  const customerId = account.customerId
  const budgetResourceName = `customers/${customerId}/campaignBudgets/-1`
  const campaignResourceName = `customers/${customerId}/campaigns/-2`
  const adGroupResourceName = `customers/${customerId}/adGroups/-3`
  const baseName = googleAdsCampaignName(promotion, draft)
  const operations: Array<Record<string, unknown>> = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResourceName,
          name: `${baseName} · budget`,
          amountMicros: String(draft.budgetMinor * 10_000),
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResourceName,
          name: baseName,
          status: 'PAUSED',
          advertisingChannelType: 'SEARCH',
          campaignBudget: budgetResourceName,
          manualCpc: {},
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
          containsEuPoliticalAdvertising: draft.containsEuPoliticalAdvertising,
          ...(draft.startDate ? { startDateTime: `${draft.startDate} 00:00:00` } : {}),
          ...(draft.endDate ? { endDateTime: `${draft.endDate} 23:59:59` } : {}),
        },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: adGroupResourceName,
          name: `${baseName} · ad group`,
          campaign: campaignResourceName,
          status: 'PAUSED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: '1000000',
        },
      },
    },
    {
      campaignCriterionOperation: {
        create: { campaign: campaignResourceName, location: { geoTargetConstant: targetConstants.geoResourceName } },
      },
    },
    {
      campaignCriterionOperation: {
        create: { campaign: campaignResourceName, language: { languageConstant: targetConstants.languageResourceName } },
      },
    },
    ...draft.keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResourceName,
          status: 'PAUSED',
          keyword: { text: keyword, matchType: 'PHRASE' },
        },
      },
    })),
    {
      adGroupAdOperation: {
        create: {
          adGroup: adGroupResourceName,
          status: 'PAUSED',
          ad: {
            finalUrls: [draft.finalUrl],
            responsiveSearchAd: {
              headlines: draft.headlines.map((text) => ({ text })),
              descriptions: draft.descriptions.map((text) => ({ text })),
            },
          },
        },
      },
    },
  ]
  const response = await googleAdsRequest({
    accessToken,
    config,
    loginCustomerId: account.managerCustomerId,
    method: 'POST',
    path: `/customers/${customerId}/googleAds:mutate`,
    body: { mutateOperations: operations, partialFailure: false, validateOnly: false },
  })
  const resourceNames = collectGoogleAdsResourceNames(response.payload)
  const campaignBudget = resourceNames.find((name) => name.includes('/campaignBudgets/'))
  const campaign = resourceNames.find((name) => name.includes('/campaigns/'))
  const adGroup = resourceNames.find((name) => name.includes('/adGroups/'))
  const creative = resourceNames.find((name) => name.includes('/adGroupAds/'))
  if (!campaignBudget || !campaign || !adGroup || !creative) throw new ValidationError('Google Ads created the campaign but did not return all expected external IDs.')
  return {
    campaignBudgetId: externalIdFromResourceName(campaignBudget),
    campaignId: externalIdFromResourceName(campaign),
    adGroupId: externalIdFromResourceName(adGroup),
    creativeId: externalIdFromResourceName(creative).split('~').pop() ?? externalIdFromResourceName(creative),
    providerResponse: {
      apiVersion: config.apiVersion,
      requestId: response.requestId,
      resourceNames,
      campaignStatus: 'PAUSED',
    },
  }
}

async function findExistingGoogleAdsCampaign({
  accessToken,
  config,
  account,
  promotion,
  draft,
}: {
  accessToken: string
  config: GoogleAdsConfig
  account: typeof googleAdsAccounts.$inferSelect
  promotion: typeof mktAdPromotions.$inferSelect
  draft: ReturnType<typeof validateGoogleAdsPromotionDraft>
}) {
  const campaignName = googleAdsCampaignName(promotion, draft)
  const rows = await googleAdsSearch({
    accessToken,
    config,
    customerId: account.customerId,
    loginCustomerId: account.managerCustomerId,
    query: `SELECT campaign.id, campaign.campaign_budget, ad_group.id, ad_group_ad.ad.id FROM ad_group_ad WHERE campaign.name = '${escapeGaql(campaignName)}' AND campaign.status != 'REMOVED' LIMIT 1`,
  })
  if (!rows.length) return null
  const row = ensureRecord(rows[0])
  const campaign = ensureRecord(row.campaign)
  const adGroup = ensureRecord(row.adGroup)
  const ad = ensureRecord(ensureRecord(row.adGroupAd).ad)
  const campaignId = readOptionalString(campaign.id)
  const campaignBudgetResourceName = readOptionalString(campaign.campaignBudget)
  const adGroupId = readOptionalString(adGroup.id)
  const creativeId = readOptionalString(ad.id)
  if (!campaignId || !campaignBudgetResourceName || !adGroupId || !creativeId) return null
  return {
    campaignBudgetId: externalIdFromResourceName(campaignBudgetResourceName),
    campaignId,
    adGroupId,
    creativeId,
    providerResponse: {
      apiVersion: config.apiVersion,
      recoveredByCampaignName: campaignName,
      campaignStatus: 'PAUSED',
    },
  }
}

function googleAdsCampaignName(
  promotion: typeof mktAdPromotions.$inferSelect,
  draft: ReturnType<typeof validateGoogleAdsPromotionDraft>,
) {
  const headline = draft.headlines[0] ?? 'Pach campaign'
  return `${headline.slice(0, 60)} · Pach ${promotion.id}`.slice(0, 120)
}

async function googleAdsSearch({
  accessToken,
  config,
  customerId,
  loginCustomerId,
  query,
}: {
  accessToken: string
  config: GoogleAdsConfig
  customerId: string
  loginCustomerId?: string | null
  query: string
}) {
  const response = await googleAdsRequest({
    accessToken,
    config,
    loginCustomerId,
    method: 'POST',
    path: `/customers/${customerId}/googleAds:searchStream`,
    body: { query },
  })
  const chunks = Array.isArray(response.payload) ? response.payload : [response.payload]
  return chunks.flatMap((chunk) => {
    const results = ensureRecord(chunk).results
    return Array.isArray(results) ? results.map(ensureRecord) : []
  })
}

async function googleAdsRequest({
  accessToken,
  config,
  loginCustomerId,
  method,
  path,
  body,
}: {
  accessToken: string
  config: GoogleAdsConfig
  loginCustomerId?: string | null
  method: 'GET' | 'POST'
  path: string
  body?: Record<string, unknown>
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': config.developerToken,
  }
  if (body) headers['Content-Type'] = 'application/json'
  if (loginCustomerId) headers['login-customer-id'] = normalizeGoogleAdsCustomerId(loginCustomerId)
  const response = await fetch(`${GOOGLE_ADS_API_BASE}/${config.apiVersion}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  const requestId = response.headers.get('request-id') ?? response.headers.get('google-ads-request-id')
  if (!response.ok) throw new GoogleAdsApiError(readGoogleError(payload, `Google Ads request failed with ${response.status}.`), response.status, requestId, payload)
  return { payload, requestId }
}

function googleAdsFailureDetails(error: unknown) {
  if (error instanceof GoogleAdsApiError) {
    return {
      message: error.message,
      providerResponse: { status: error.status, requestId: error.requestId, error: sanitizeGoogleAdsError(error.payload) },
    }
  }
  return { message: error instanceof Error ? error.message : 'Unknown Google Ads publishing error.', providerResponse: { error: String(error) } }
}

function sanitizeGoogleAdsError(payload: unknown) {
  const record = ensureRecord(payload)
  const error = ensureRecord(record.error)
  return {
    code: error.code ?? null,
    status: error.status ?? null,
    message: readOptionalString(error.message) ?? readGoogleError(payload, 'Google Ads request failed.'),
    details: Array.isArray(error.details) ? error.details : [],
  }
}

function collectGoogleAdsResourceNames(value: unknown, found = new Set<string>()) {
  if (typeof value === 'string' && /^customers\/[^/]+\//.test(value)) found.add(value)
  else if (Array.isArray(value)) value.forEach((entry) => collectGoogleAdsResourceNames(entry, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => collectGoogleAdsResourceNames(entry, found))
  return [...found]
}

function externalIdFromResourceName(resourceName: string) {
  return resourceName.slice(resourceName.lastIndexOf('/') + 1)
}

function normalizeGoogleAdsCustomerId(value?: string | null) {
  return (value ?? '').replace(/\D/g, '')
}

function formatGoogleAdsCustomerId(value: string) {
  return value.length === 10 ? `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}` : value
}

function formatGoogleAdsDate(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function escapeGaql(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readOptionalString).filter((entry): entry is string => Boolean(entry)) : []
}

function requireGoogleAdsScope(connection: typeof googleConnections.$inferSelect) {
  if (!connection.scopes.includes('https://www.googleapis.com/auth/adwords')) {
    throw new ValidationError('Reconnect Google to grant Google Ads access.')
  }
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
  if (!connection.encryptedRefreshToken) throw new ValidationError('Google connection has no refresh token. Reconnect Google.')
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
  const pageLimit = boundedSearchRowLimit(body.pageLimit ?? body.rowLimit, DEFAULT_SEARCH_ANALYTICS_PAGE_LIMIT, 500)
  const queryLimit = boundedSearchRowLimit(body.queryLimit ?? body.rowLimit, DEFAULT_SEARCH_ANALYTICS_QUERY_LIMIT, 500)
  const opportunityLimit = boundedSearchRowLimit(body.opportunityLimit, DEFAULT_SEARCH_ANALYTICS_OPPORTUNITY_LIMIT, 1_000)
  const dailyRowLimit = boundedSearchRowLimit(body.dailyRowLimit, DEFAULT_SEARCH_ANALYTICS_DAILY_LIMIT, 500)
  const [pageRows, queryRows, opportunityRows, dailyRows] = await Promise.all([
    fetchSearchAnalytics({
      accessToken,
      siteUrl: property.siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      searchType,
      dimensions: SEARCH_ANALYTICS_PAGE_DIMENSIONS,
      rowLimit: pageLimit,
    }),
    fetchSearchAnalytics({
      accessToken,
      siteUrl: property.siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      searchType,
      dimensions: SEARCH_ANALYTICS_QUERY_DIMENSIONS,
      rowLimit: queryLimit,
    }),
    fetchSearchAnalytics({
      accessToken,
      siteUrl: property.siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      searchType,
      dimensions: SEARCH_ANALYTICS_PAGE_QUERY_DIMENSIONS,
      rowLimit: opportunityLimit,
    }),
    fetchSearchAnalytics({
      accessToken,
      siteUrl: property.siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      searchType,
      dimensions: SEARCH_ANALYTICS_DAILY_DIMENSIONS,
      rowLimit: dailyRowLimit,
    }),
  ])
  const outputByUrl = await searchAnalyticsOutputByUrl(property.organizationId)
  const pageSummaries = await saveSearchAnalyticsSummaries({
    organizationId: property.organizationId,
    propertyId: property.id,
    searchType,
    summaryType: 'page',
    rows: pageRows,
    outputByUrl,
  })
  const querySummaries = await saveSearchAnalyticsSummaries({
    organizationId: property.organizationId,
    propertyId: property.id,
    searchType,
    summaryType: 'query',
    rows: queryRows,
    outputByUrl,
  })
  const opportunitySummaries = await saveSearchAnalyticsSummaries({
    organizationId: property.organizationId,
    propertyId: property.id,
    searchType,
    summaryType: 'page_query',
    rows: opportunityRows,
    outputByUrl,
  })
  const dailySummary = await saveSearchAnalyticsDailyRows({
    organizationId: property.organizationId,
    propertyId: property.id,
    searchType,
    rows: dailyRows,
  })
  const summaryRows = pageSummaries.rows + querySummaries.rows + opportunitySummaries.rows
  const writes = pageSummaries.writes + querySummaries.writes + opportunitySummaries.writes + dailySummary.writes

  const now = new Date()
  await getDb()
    .update(searchConsoleProperties)
    .set({ lastSyncedAt: now, updatedAt: now })
    .where(eq(searchConsoleProperties.id, property.id))

  await recordGoogleActivity({
    organizationId: property.organizationId,
    eventType: 'search_console_search_analytics_synced',
    summary: `Synced ${summaryRows} Search Console summaries and ${dailySummary.rows} daily totals`,
    details: {
      propertyId: property.id,
      siteUrl: property.siteUrl,
      ...range,
      searchType,
      pageRows: pageSummaries.rows,
      queryRows: querySummaries.rows,
      opportunityRows: opportunitySummaries.rows,
      writes,
      pageLimit,
      queryLimit,
      opportunityLimit,
      dailyRowLimit,
      trigger: readOptionalString(body.trigger) ?? (user ? 'manual' : 'scheduled'),
    },
  })

  return {
    property,
    rows: summaryRows,
    dailyRows: dailySummary.rows,
    summaries: summaryRows,
    summaryBreakdown: {
      pages: pageSummaries.rows,
      queries: querySummaries.rows,
      opportunities: opportunitySummaries.rows,
    },
    writes,
    ...range,
    searchType,
    pageLimit,
    queryLimit,
    opportunityLimit,
    dailyRowLimit,
  }
}

async function fetchSearchAnalytics({
  accessToken,
  siteUrl,
  startDate,
  endDate,
  searchType,
  dimensions,
  rowLimit,
}: {
  accessToken: string
  siteUrl: string
  startDate: string
  endDate: string
  searchType: string
  dimensions: readonly string[]
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
      dimensions,
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

async function searchAnalyticsOutputByUrl(organizationId: string) {
  const outputs = await getDb()
    .select()
    .from(mktContentOutputs)
    .where(eq(mktContentOutputs.organizationId, organizationId))
  const outputByUrl = new Map<string, typeof outputs[number]>()
  for (const output of outputs) {
    if (output.publicUrl) outputByUrl.set(normalizeUrl(output.publicUrl), output)
    if (output.canonicalUrl) outputByUrl.set(normalizeUrl(output.canonicalUrl), output)
  }
  return outputByUrl
}

async function saveSearchAnalyticsSummaries({
  organizationId,
  propertyId,
  searchType,
  summaryType,
  rows,
  outputByUrl,
}: {
  organizationId: string
  propertyId: string
  searchType: string
  summaryType: SearchAnalyticsSummaryType
  rows: SearchAnalyticsRow[]
  outputByUrl: Map<string, typeof mktContentOutputs.$inferSelect>
}) {
  const db = getDb()
  const existing = await db
    .select()
    .from(searchConsoleDimensionSummaries)
    .where(and(
      eq(searchConsoleDimensionSummaries.propertyId, propertyId),
      eq(searchConsoleDimensionSummaries.searchType, searchType),
      eq(searchConsoleDimensionSummaries.summaryType, summaryType),
    ))
  const existingByKey = new Map(existing.map((row) => [row.summaryKey, row]))

  const now = new Date()
  const valuesByKey = new Map<string, typeof searchConsoleDimensionSummaries.$inferInsert>()
  for (const row of rows) {
    const keys = Array.isArray(row.keys) ? row.keys : []
    const page = summaryType === 'query' ? null : readKey(keys, 0)
    const query = summaryType === 'page' ? null : readKey(keys, summaryType === 'query' ? 0 : 1)
    if (summaryType !== 'query' && !page) throw new ValidationError('Search Console returned a page summary without a page.')
    if (summaryType !== 'page' && !query) throw new ValidationError('Search Console returned a query summary without a query.')
    const summaryKey = summaryType === 'page'
      ? page!
      : summaryType === 'query'
        ? query!
        : JSON.stringify([page, query])
    const output = page ? outputByUrl.get(normalizeUrl(page)) : null
    const current = existingByKey.get(summaryKey)
    valuesByKey.set(summaryKey, {
      id: current?.id ?? randomUUID(),
      organizationId,
      propertyId,
      contentItemId: output?.contentItemId ?? null,
      contentOutputId: output?.id ?? null,
      summaryType,
      summaryKey,
      searchType,
      page,
      query,
      clicks: Math.round(readNumber(row.clicks)),
      impressions: Math.round(readNumber(row.impressions)),
      ctr: String(readNumber(row.ctr)),
      position: String(readNumber(row.position)),
      metadata: {},
      fetchedAt: now,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    })
  }
  const values = Array.from(valuesByKey.values())
  const changed = values.filter((value) => {
    const current = existingByKey.get(value.summaryKey)
    return !current || searchAnalyticsSummaryChanged(current, value)
  })

  const chunkSize = 500
  for (let index = 0; index < changed.length; index += chunkSize) {
    const chunk = changed.slice(index, index + chunkSize)
    await db
      .insert(searchConsoleDimensionSummaries)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          searchConsoleDimensionSummaries.propertyId,
          searchConsoleDimensionSummaries.summaryType,
          searchConsoleDimensionSummaries.searchType,
          searchConsoleDimensionSummaries.summaryKey,
        ],
        set: {
          contentItemId: sql`excluded.content_item_id`,
          contentOutputId: sql`excluded.content_output_id`,
          page: sql`excluded.page`,
          query: sql`excluded.query`,
          clicks: sql`excluded.clicks`,
          impressions: sql`excluded.impressions`,
          ctr: sql`excluded.ctr`,
          position: sql`excluded.position`,
          metadata: sql`excluded.metadata`,
          fetchedAt: now,
          updatedAt: now,
        },
      })
  }

  const summaryKeys = values.map((value) => value.summaryKey)
  const scope = and(
    eq(searchConsoleDimensionSummaries.propertyId, propertyId),
    eq(searchConsoleDimensionSummaries.searchType, searchType),
    eq(searchConsoleDimensionSummaries.summaryType, summaryType),
  )
  const deleted = await db
    .delete(searchConsoleDimensionSummaries)
    .where(summaryKeys.length > 0
      ? and(scope, notInArray(searchConsoleDimensionSummaries.summaryKey, summaryKeys))
      : scope)
    .returning({ id: searchConsoleDimensionSummaries.id })

  return { rows: values.length, writes: changed.length + deleted.length }
}

async function saveSearchAnalyticsDailyRows({
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
  const db = getDb()
  const existing = await db
    .select()
    .from(searchConsoleDailySnapshots)
    .where(and(
      eq(searchConsoleDailySnapshots.propertyId, propertyId),
      eq(searchConsoleDailySnapshots.searchType, searchType),
    ))
  const existingByDate = new Map(existing.map((row) => [row.dataDate, row]))
  const now = new Date()
  const values = rows.map((row) => {
    const keys = Array.isArray(row.keys) ? row.keys : []
    const dataDate = readKey(keys, 0)
    if (!dataDate) throw new ValidationError('Search Console returned a daily row without a date.')
    const current = existingByDate.get(dataDate)
    return {
      id: current?.id ?? randomUUID(),
      organizationId,
      propertyId,
      dataDate,
      searchType,
      clicks: Math.round(readNumber(row.clicks)),
      impressions: Math.round(readNumber(row.impressions)),
      ctr: String(readNumber(row.ctr)),
      position: String(readNumber(row.position)),
      metadata: {},
      fetchedAt: now,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    }
  })
  const changed = values.filter((value) => {
    const current = existingByDate.get(value.dataDate)
    return !current || searchAnalyticsDailyRowChanged(current, value)
  })

  const chunkSize = 500
  for (let index = 0; index < changed.length; index += chunkSize) {
    const chunk = changed.slice(index, index + chunkSize)
    await db
      .insert(searchConsoleDailySnapshots)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          searchConsoleDailySnapshots.propertyId,
          searchConsoleDailySnapshots.dataDate,
          searchConsoleDailySnapshots.searchType,
        ],
        set: {
          clicks: sql`excluded.clicks`,
          impressions: sql`excluded.impressions`,
          ctr: sql`excluded.ctr`,
          position: sql`excluded.position`,
          fetchedAt: now,
          updatedAt: now,
        },
      })
  }
  return { rows: values.length, writes: changed.length }
}

function searchAnalyticsSummaryChanged(
  current: typeof searchConsoleDimensionSummaries.$inferSelect,
  next: typeof searchConsoleDimensionSummaries.$inferInsert,
) {
  return current.contentItemId !== next.contentItemId ||
    current.contentOutputId !== next.contentOutputId ||
    current.page !== next.page ||
    current.query !== next.query ||
    current.clicks !== next.clicks ||
    current.impressions !== next.impressions ||
    current.ctr !== next.ctr ||
    current.position !== next.position
}

function searchAnalyticsDailyRowChanged(
  current: typeof searchConsoleDailySnapshots.$inferSelect,
  next: typeof searchConsoleDailySnapshots.$inferInsert,
) {
  return current.clicks !== next.clicks ||
    current.impressions !== next.impressions ||
    current.ctr !== next.ctr ||
    current.position !== next.position
}

function boundedSearchRowLimit(value: unknown, fallback: number, maximum: number) {
  return Math.min(readPositiveInteger(value, fallback), maximum)
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
      .where(and(
        eq(googleConnections.id, connectionId),
        eq(googleConnections.organizationId, organizationId),
        eq(googleConnections.status, 'active'),
      ))
      .limit(1)
    : await db
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, organizationId), eq(googleConnections.status, 'active')))
      .orderBy(desc(googleConnections.updatedAt))
      .limit(1)

  if (!connection) throw new ValidationError('Connect Google first.')
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

  if (!connection) throw new ValidationError('Connect Google first.')
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
  const isGoogleAds = eventType.startsWith('google_ads_')
  await getDb().insert(activityEvents).values({
    organizationId,
    occurredAt: now,
    createdAt: now,
    eventType,
    activityKind: 'progress',
    origin: 'pach_work',
    subjectType: isGoogleAds ? 'ad_campaign' : 'search_console',
    actorType: 'agent',
    actorName: isGoogleAds ? 'google_ads' : 'google_search_console',
    source: isGoogleAds ? 'google_ads' : 'google_search_console',
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

type GoogleAdsConfig = {
  developerToken: string
  apiVersion: string
}

function googleAdsConfig(): Partial<GoogleAdsConfig> & { apiVersion: string } {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || DEFAULT_GOOGLE_ADS_API_VERSION,
  }
}

function requireGoogleAdsConfig(): GoogleAdsConfig {
  const config = googleAdsConfig()
  if (!config.developerToken) throw new ValidationError('Set GOOGLE_ADS_DEVELOPER_TOKEN before syncing or publishing Google Ads campaigns.')
  if (!/^v\d+$/.test(config.apiVersion)) throw new ValidationError('GOOGLE_ADS_API_VERSION must look like v24.')
  return config as GoogleAdsConfig
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
    throw new ValidationError('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google.')
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
  connectionId?: string,
) {
  const url = new URL(returnTo)
  url.searchParams.set('google_search_console', status)
  url.searchParams.set('message', message)
  if (connectionId) url.searchParams.set('google_connection_id', connectionId)
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
  const startDate = readOptionalString(body.startDate) ?? isoDateDaysAgo(DEFAULT_SEARCH_ANALYTICS_LOOKBACK_DAYS)
  const endDate = readOptionalString(body.endDate) ?? isoDateDaysAgo(SEARCH_ANALYTICS_FINAL_DATA_LAG_DAYS)
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
  const detailedErrors = (Array.isArray(nested.details) ? nested.details : [])
    .flatMap((detail) => {
      const errors = ensureRecord(detail).errors
      return Array.isArray(errors) ? errors : []
    })
    .map((entry) => ensureRecord(entry))
  const primaryError = detailedErrors.find((entry) => readOptionalString(entry.message) !== 'Resource was not found.')
    ?? detailedErrors[0]
  if (primaryError) {
    const message = readOptionalString(primaryError.message)
    const location = ensureRecord(primaryError.location)
    const path = (Array.isArray(location.fieldPathElements) ? location.fieldPathElements : [])
      .map((element) => readOptionalString(ensureRecord(element).fieldName))
      .filter((field): field is string => Boolean(field))
    const field = path.at(-1)?.replace(/_/g, ' ')
    if (message) return field ? `Google Ads rejected ${field}: ${message}` : message
  }
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

function readGoogleMetricNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(parsed) ? parsed : 0
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
  if (error instanceof GoogleAdsApiError) {
    console.error(code, { status: error.status, requestId: error.requestId, message: error.message })
    res.status(502).json({ error: code, message: error.message, requestId: error.requestId })
    return
  }
  console.error(code, error)
  res.status(500).json({ error: code, message })
}

class ValidationError extends Error {}
class NotFoundError extends Error {}

export { publicRouter as publicGoogleRouter }
export default router
