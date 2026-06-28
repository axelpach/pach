import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { activityEvents } from '../../../db/schema.js'
import { getDb } from '../db.js'
import {
  extractApiKeyToken,
  validateOrganizationApiKeyForScope,
} from '../lib/organization-api-key.js'

const router = Router()

class ActivityInputError extends Error {
  status: number

  constructor(message: string, status = 422) {
    super(message)
    this.name = 'ActivityInputError'
    this.status = status
  }
}

router.post('/events', async (req, res) => {
  try {
    const token = extractApiKeyToken(req.headers)
    const apiKey = token
      ? await validateOrganizationApiKeyForScope({ token, scope: 'activity:write' })
      : null

    if (!apiKey) {
      res.status(401).json({ error: 'UNAUTHORIZED_ACTIVITY_WRITE', message: 'A valid activity:write API key is required.' })
      return
    }

    const body = ensureObject(req.body ?? {})
    const now = new Date()
    const occurredAt = readOptionalDate(readField(body, 'occurredAt', 'occurred_at')) ?? now
    const eventType = readRequiredString(readField(body, 'eventType', 'event_type', 'action'), 'eventType')
    const activityKind = normalizeActivityKind(readOptionalString(readField(body, 'activityKind', 'activity_kind', 'kind')))
    const origin = normalizeOrigin(readOptionalString(readField(body, 'origin', 'activityOrigin', 'activity_origin')), 'organization_work')
    const subjectType = readRequiredString(readField(body, 'subjectType', 'subject_type'), 'subjectType')
    const subject = readOptionalString(readField(body, 'subject', 'subjectLabel', 'subject_label'))
    const actorType = readOptionalString(readField(body, 'actorType', 'actor_type')) ?? 'external_app'
    const actorName = readOptionalString(readField(body, 'actorName', 'actor_name')) ?? apiKey.name
    const source = readOptionalString(body.source) ?? 'activity_api'
    const severity = normalizeSeverity(readOptionalString(body.severity))
    const summary = readRequiredString(body.summary, 'summary')
    const id = readOptionalString(body.id)
    if (id && !isUuid(id)) throw new ActivityInputError('id must be a UUID.')

    const [event] = await getDb()
      .insert(activityEvents)
      .values({
        id: id ?? randomUUID(),
        organizationId: apiKey.organizationId,
        occurredAt,
        createdAt: now,
        eventType,
        activityKind,
        origin,
        subjectType,
        subjectId: readOptionalString(readField(body, 'subjectId', 'subject_id')) ?? undefined,
        subjectLabel: subject ?? undefined,
        actorType,
        actorId: readOptionalString(readField(body, 'actorId', 'actor_id')) ?? undefined,
        actorName,
        source,
        severity,
        summary,
        details: readJsonObject(body.details, 'details'),
        metadata: {
          ...readJsonObject(body.metadata, 'metadata'),
          apiKeyId: apiKey.id,
          apiKeyPrefix: apiKey.tokenPrefix,
        },
      })
      .returning()

    res.status(201).json({ event: serializeActivityEvent(event) })
  } catch (error) {
    if (error instanceof ActivityInputError) {
      res.status(error.status).json({ error: 'INVALID_ACTIVITY_EVENT', message: error.message })
      return
    }
    console.error('Activity event write failed', error)
    res.status(500).json({ error: 'ACTIVITY_EVENT_WRITE_FAILED', message: 'Could not record activity event.' })
  }
})

function serializeActivityEvent(event: typeof activityEvents.$inferSelect) {
  return {
    id: event.id,
    organizationId: event.organizationId,
    occurredAt: event.occurredAt.getTime(),
    createdAt: event.createdAt.getTime(),
    eventType: event.eventType,
    activityKind: event.activityKind,
    origin: event.origin,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    subject: event.subjectLabel,
    subjectLabel: event.subjectLabel,
    actorType: event.actorType,
    actorId: event.actorId,
    actorName: event.actorName,
    source: event.source,
    severity: event.severity,
    summary: event.summary,
    details: event.details ?? {},
    metadata: event.metadata ?? {},
  }
}

function readField(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key]
  }
  return undefined
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ActivityInputError(`${field} is required.`)
  }
  return value.trim()
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readOptionalDate(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new ActivityInputError('occurredAt must be a valid timestamp.')
    return date
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new ActivityInputError('occurredAt must be a valid ISO date or timestamp.')
    return date
  }
  throw new ActivityInputError('occurredAt must be a valid ISO date or timestamp.')
}

function readJsonObject(value: unknown, field: string) {
  if (value == null) return {}
  if (!isObject(value)) throw new ActivityInputError(`${field} must be an object.`)
  return value
}

function normalizeSeverity(value: string | null) {
  if (!value) return 'info'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'warn') return 'warning'
  return normalized
}

function normalizeActivityKind(value: string | null) {
  if (!value) return 'operational'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'signal') return 'business_signal'
  if (['progress', 'business_signal', 'operational', 'incident'].includes(normalized)) return normalized
  throw new ActivityInputError('activityKind must be one of progress, business_signal, operational, or incident.')
}

function normalizeOrigin(value: string | null, fallback: 'pach_work' | 'organization_work' | 'organization_user_work') {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'pach_work' || normalized === 'organization_work' || normalized === 'organization_user_work') return normalized
  throw new ActivityInputError('origin must be pach_work, organization_work, or organization_user_work.')
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ActivityInputError('Body must be a JSON object.', 400)
  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default router
