import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import { searchConsoleProperties } from '../../../../db/schema.js'
import { getDb } from '../../db.js'
import { syncSearchConsoleAnalyticsForProperty } from '../../routes/google.js'

type IntegrationSyncSummary = {
  searchConsole: {
    checked: number
    synced: number
    skipped: number
    failed: number
  }
}

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS
const DEFAULT_SYNC_LIMIT = 10

export async function runDueIntegrationSyncs(params: { now?: Date; limit?: number } = {}): Promise<IntegrationSyncSummary> {
  const now = params.now ?? new Date()
  const searchConsole = await runDueSearchConsoleSyncs({ now, limit: params.limit })
  return { searchConsole }
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
      if (summary.searchConsole.checked > 0) console.log('[integration-sync] startup run', summary)
    })
    .catch((error) => {
      console.error('[integration-sync] startup run failed:', error)
    })

  const timer = setInterval(() => {
    void runDueIntegrationSyncs()
      .then((summary) => {
        if (summary.searchConsole.checked > 0) console.log('[integration-sync] interval run', summary)
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
