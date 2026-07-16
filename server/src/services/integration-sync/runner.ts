import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { mktAdPromotions, searchConsoleProperties } from '../../../../db/schema.js'
import { getDb } from '../../db.js'
import { syncGoogleAdsMetricsForPromotion, syncSearchConsoleAnalyticsForProperty } from '../../routes/google.js'

type IntegrationSyncSummary = {
  searchConsole: {
    checked: number
    synced: number
    skipped: number
    failed: number
  }
  googleAds: {
    checked: number
    synced: number
    skipped: number
    failed: number
  }
}

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS
const DEFAULT_SYNC_LIMIT = 10
const DEFAULT_GOOGLE_ADS_STALE_MS = 3 * ONE_HOUR_MS

export async function runDueIntegrationSyncs(params: { now?: Date; limit?: number } = {}): Promise<IntegrationSyncSummary> {
  const now = params.now ?? new Date()
  const [searchConsole, googleAds] = await Promise.all([
    runDueSearchConsoleSyncs({ now, limit: params.limit }),
    runDueGoogleAdsSyncs({ now, limit: params.limit }),
  ])
  return { searchConsole, googleAds }
}

export async function runDueGoogleAdsSyncs(params: { now?: Date; limit?: number } = {}) {
  const summary = { checked: 0, synced: 0, skipped: 0, failed: 0 }
  if (process.env.GOOGLE_ADS_METRICS_SYNC_DISABLED === 'true') return summary

  const db = getDb()
  const now = params.now ?? new Date()
  const staleMs = readPositiveEnvNumber('GOOGLE_ADS_METRICS_SYNC_STALE_MS', DEFAULT_GOOGLE_ADS_STALE_MS)
  const candidates = await db
    .select()
    .from(mktAdPromotions)
    .where(and(
      eq(mktAdPromotions.provider, 'google'),
      isNotNull(mktAdPromotions.campaignExternalId),
      inArray(mktAdPromotions.status, ['active', 'scheduled', 'paused', 'completed']),
    ))
    .orderBy(asc(mktAdPromotions.updatedAt))
    .limit(Math.max((params.limit ?? DEFAULT_SYNC_LIMIT) * 4, DEFAULT_SYNC_LIMIT))

  const due = candidates.filter((promotion) => {
    const metadata = asRecord(promotion.metadata)
    const metrics = asRecord(metadata.googleAdsMetrics)
    const lastSyncedAt = typeof metrics.lastSyncedAt === 'string' ? Date.parse(metrics.lastSyncedAt) : Number.NaN
    return !Number.isFinite(lastSyncedAt) || lastSyncedAt <= now.getTime() - staleMs
  }).slice(0, params.limit ?? DEFAULT_SYNC_LIMIT)
  summary.checked = due.length

  for (const promotion of due) {
    try {
      await syncGoogleAdsMetricsForPromotion({ promotionId: promotion.id, now })
      summary.synced += 1
    } catch (error) {
      summary.failed += 1
      console.error(`[integration-sync] Failed Google Ads metrics sync for promotion ${promotion.id}:`, error)
    }
  }

  return summary
}

export async function runDueSearchConsoleSyncs(params: { now?: Date; limit?: number } = {}) {
  const disabled = process.env.GOOGLE_SEARCH_CONSOLE_SYNC_DISABLED === 'true'
  const summary = {
    checked: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
  }
  if (disabled) return summary

  const db = getDb()
  const now = params.now ?? new Date()
  const staleMs = readPositiveEnvNumber('GOOGLE_SEARCH_CONSOLE_SYNC_STALE_MS', ONE_DAY_MS)
  const staleBefore = new Date(now.getTime() - staleMs)
  const properties = await db
    .select()
    .from(searchConsoleProperties)
    .where(and(
      eq(searchConsoleProperties.status, 'active'),
      eq(searchConsoleProperties.selected, true),
      or(isNull(searchConsoleProperties.lastSyncedAt), lte(searchConsoleProperties.lastSyncedAt, staleBefore)),
    ))
    .orderBy(asc(searchConsoleProperties.lastSyncedAt), asc(searchConsoleProperties.createdAt))
    .limit(params.limit ?? DEFAULT_SYNC_LIMIT)

  summary.checked = properties.length

  for (const property of properties) {
    if (!property.connectionId) {
      summary.skipped += 1
      continue
    }

    try {
      await syncSearchConsoleAnalyticsForProperty({
        propertyId: property.id,
        body: { trigger: 'scheduled' },
      })
      summary.synced += 1
    } catch (error) {
      summary.failed += 1
      console.error(`[integration-sync] Failed Search Console sync for property ${property.id}:`, error)
    }
  }

  return summary
}

export function startIntegrationSyncRunner() {
  const disabled = process.env.INTEGRATION_SYNC_RUNNER_DISABLED === 'true'
  if (disabled) return null

  const intervalMs = readPositiveEnvNumber('INTEGRATION_SYNC_RUNNER_INTERVAL_MS', ONE_HOUR_MS)

  void runDueIntegrationSyncs()
    .then((summary) => {
      if (summary.searchConsole.checked > 0 || summary.googleAds.checked > 0) console.log('[integration-sync] startup run', summary)
    })
    .catch((error) => {
      console.error('[integration-sync] startup run failed:', error)
    })

  const timer = setInterval(() => {
    void runDueIntegrationSyncs()
      .then((summary) => {
        if (summary.searchConsole.checked > 0 || summary.googleAds.checked > 0) console.log('[integration-sync] interval run', summary)
      })
      .catch((error) => {
        console.error('[integration-sync] interval run failed:', error)
      })
  }, intervalMs)

  return timer
}

function readPositiveEnvNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
