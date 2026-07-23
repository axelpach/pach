import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import {
  calAvailabilityOverrides,
  calAvailabilityRules,
  calBookings,
  calEventTypes,
  googleConnections,
  organizations,
  users,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import { accessTokenForConnection } from './google.js'

const router = Router()
export const publicSchedulingRouter = Router()

const DEFAULT_SLOT_STEP_MINUTES = 15
const MAX_PUBLIC_DAYS = 60
const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

type EventTypeRow = typeof calEventTypes.$inferSelect
type AvailabilityRuleRow = typeof calAvailabilityRules.$inferSelect
type AvailabilityOverrideRow = typeof calAvailabilityOverrides.$inferSelect
type BookingRow = typeof calBookings.$inferSelect

router.get('/event-types/:id/slots', async (req, res) => {
  const db = getDb()
  const [eventType] = await db.select().from(calEventTypes).where(eq(calEventTypes.id, req.params.id)).limit(1)

  if (!eventType) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Event type not found.' })
    return
  }

  if (!req.user?.organizationIds.includes(eventType.organizationId)) {
    res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
    return
  }

  const payload = await buildAvailabilityPayload(eventType, readAvailabilityQuery(req.query))
  res.json(payload)
})

router.post('/bookings/:id/cancel', async (req, res) => {
  const db = getDb()
  const [booking] = await db.select().from(calBookings).where(eq(calBookings.id, req.params.id)).limit(1)

  if (!booking) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking not found.' })
    return
  }

  if (!req.user?.organizationIds.includes(booking.organizationId)) {
    res.status(403).json({ error: 'NOT_AUTHORIZED', message: 'Not authorized for this organization.' })
    return
  }

  await cancelProviderEvent(booking)

  const [updated] = await db
    .update(calBookings)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(calBookings.id, booking.id))
    .returning()

  res.json({ booking: serializeBooking(updated) })
})

publicSchedulingRouter.get('/event-types/:slug', async (req, res) => {
  const context = await readPublicEventContext(req.params.slug)

  if (!context) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking link not found.' })
    return
  }

  res.json(serializePublicEventContext(context))
})

publicSchedulingRouter.get('/event-types/:slug/slots', async (req, res) => {
  const context = await readPublicEventContext(req.params.slug)

  if (!context) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking link not found.' })
    return
  }

  const payload = await buildAvailabilityPayload(context.eventType, readAvailabilityQuery(req.query))
  res.json(payload)
})

publicSchedulingRouter.post('/event-types/:slug/bookings', async (req, res) => {
  const body = req.body ?? {}
  const startAt = typeof body.startAt === 'string' ? new Date(body.startAt) : null
  const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : ''
  const guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : ''
  const guestNotes = typeof body.guestNotes === 'string' ? body.guestNotes.trim() : null

  if (!startAt || Number.isNaN(startAt.getTime()) || !guestName || !isEmailLike(guestEmail)) {
    res.status(400).json({ error: 'VALIDATION', message: 'Select a valid slot and enter name and email.' })
    return
  }

  const context = await readPublicEventContext(req.params.slug)
  if (!context) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking link not found.' })
    return
  }

  const availability = await buildAvailabilityPayload(context.eventType, {
    from: isoDateKey(startAt, context.eventType.timezone),
    days: 2,
  })
  const selectedSlot = availability.slots.find((slot) => slot.startAt === startAt.toISOString())
  if (!selectedSlot) {
    res.status(409).json({ error: 'SLOT_UNAVAILABLE', message: 'That slot is no longer available.' })
    return
  }

  const endAt = new Date(startAt.getTime() + context.eventType.durationMinutes * 60_000)
  const db = getDb()

  try {
    let booking = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(calBookings)
        .where(and(
          eq(calBookings.hostUserId, context.eventType.ownerUserId),
          inArray(calBookings.status, ['confirmed', 'pending']),
          gte(calBookings.endAt, new Date(startAt.getTime() - context.eventType.bufferBeforeMinutes * 60_000)),
          lte(calBookings.startAt, new Date(endAt.getTime() + context.eventType.bufferAfterMinutes * 60_000)),
        ))

      if (existing.some((entry) => bookingConflicts(entry, startAt, endAt, context.eventType))) {
        throw new SlotUnavailableError()
      }

      const [created] = await tx
        .insert(calBookings)
        .values({
          organizationId: context.eventType.organizationId,
          eventTypeId: context.eventType.id,
          hostUserId: context.eventType.ownerUserId,
          guestName,
          guestEmail,
          guestNotes,
          startAt,
          endAt,
          status: context.eventType.meetingProvider === 'google_meet' ? 'pending' : 'confirmed',
          meetingUrl: context.eventType.meetingProvider === 'google_meet' ? null : context.eventType.locationDetails,
          cancelToken: randomBytes(24).toString('hex'),
          metadata: { source: 'public_booking_page' },
        })
        .returning()

      return created
    })

    if (context.eventType.meetingProvider === 'google_meet') {
      try {
        const providerEvent = await createGoogleMeeting({
          eventType: context.eventType,
          organizationName: context.organization.name,
          booking,
        })
        const [confirmed] = await db
          .update(calBookings)
          .set({
            status: 'confirmed',
            meetingUrl: providerEvent.meetingUrl,
            providerEventId: providerEvent.eventId,
            metadata: { ...readRecord(booking.metadata), googleCalendarHtmlLink: providerEvent.htmlLink },
            updatedAt: new Date(),
          })
          .where(eq(calBookings.id, booking.id))
          .returning()
        booking = confirmed
      } catch (error) {
        await db.delete(calBookings).where(eq(calBookings.id, booking.id))
        console.error('GOOGLE_MEET_BOOKING_FAILED', error)
        res.status(502).json({
          error: 'MEETING_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Could not create the Google Meet invitation.',
        })
        return
      }
    }

    res.status(201).json({ booking: serializeBooking(booking), eventType: serializePublicEventContext(context).eventType })
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      res.status(409).json({ error: 'SLOT_UNAVAILABLE', message: 'That slot is no longer available.' })
      return
    }
    throw error
  }
})

publicSchedulingRouter.post('/bookings/:id/cancel', async (req, res) => {
  const token = typeof req.body?.cancelToken === 'string' ? req.body.cancelToken : ''
  const db = getDb()
  const [booking] = await db.select().from(calBookings).where(eq(calBookings.id, req.params.id)).limit(1)

  if (!booking || booking.cancelToken !== token) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking not found.' })
    return
  }

  await cancelProviderEvent(booking)

  const [updated] = await db
    .update(calBookings)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(calBookings.id, booking.id))
    .returning()

  res.json({ booking: serializeBooking(updated) })
})

async function createGoogleMeeting({
  eventType,
  organizationName,
  booking,
}: {
  eventType: EventTypeRow
  organizationName: string
  booking: BookingRow
}) {
  const connection = await googleConnectionForEventType(eventType)
  const accessToken = await accessTokenForConnection(connection)
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`)
  url.searchParams.set('conferenceDataVersion', '1')
  url.searchParams.set('sendUpdates', 'all')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: eventType.title,
      description: [
        eventType.description,
        `Booked through ${organizationName}.`,
        booking.guestNotes ? `Guest notes: ${booking.guestNotes}` : null,
      ].filter(Boolean).join('\n\n'),
      start: { dateTime: booking.startAt.toISOString(), timeZone: eventType.timezone },
      end: { dateTime: booking.endAt.toISOString(), timeZone: eventType.timezone },
      attendees: [{ email: booking.guestEmail, displayName: booking.guestName }],
      guestsCanInviteOthers: false,
      conferenceData: {
        createRequest: {
          requestId: booking.id,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  })

  const payload = readRecord(await response.json().catch(() => ({})))
  if (!response.ok) {
    throw new Error(readGoogleCalendarError(payload, `Google Calendar returned ${response.status}.`))
  }

  const eventId = readString(payload.id)
  if (!eventId) throw new Error('Google Calendar created the event without returning an event id.')

  let eventPayload = payload
  let meetingUrl = readString(eventPayload.hangoutLink) ?? readGoogleMeetEntryPoint(eventPayload.conferenceData)
  for (let attempt = 0; !meetingUrl && attempt < 6; attempt += 1) {
    await wait(250 * (attempt + 1))
    eventPayload = await readGoogleCalendarEvent({ accessToken, eventId })
    meetingUrl = readString(eventPayload.hangoutLink) ?? readGoogleMeetEntryPoint(eventPayload.conferenceData)
  }
  if (!meetingUrl) throw new Error('Google Calendar created the event without a Google Meet link.')
  return { eventId, meetingUrl, htmlLink: readString(eventPayload.htmlLink) }
}

async function readGoogleCalendarEvent({ accessToken, eventId }: { accessToken: string; eventId: string }) {
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const payload = readRecord(await response.json().catch(() => ({})))
  if (!response.ok) throw new Error(readGoogleCalendarError(payload, `Google Calendar returned ${response.status}.`))
  return payload
}

async function cancelProviderEvent(booking: BookingRow) {
  if (!booking.providerEventId) return
  const [eventType] = await getDb().select().from(calEventTypes).where(eq(calEventTypes.id, booking.eventTypeId)).limit(1)
  if (!eventType || eventType.meetingProvider !== 'google_meet') return

  const connection = await googleConnectionForEventType(eventType)
  const accessToken = await accessTokenForConnection(connection)
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(booking.providerEventId)}`)
  url.searchParams.set('sendUpdates', 'all')
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (response.ok || response.status === 404 || response.status === 410) return
  const payload = readRecord(await response.json().catch(() => ({})))
  throw new Error(readGoogleCalendarError(payload, `Google Calendar cancellation returned ${response.status}.`))
}

async function googleConnectionForEventType(eventType: EventTypeRow) {
  const connectionId = readString(readRecord(eventType.metadata).googleConnectionId)
  if (!connectionId) throw new Error('Reconnect Google and select a Google Meet account for this booking link.')

  const [connection] = await getDb()
    .select()
    .from(googleConnections)
    .where(and(
      eq(googleConnections.id, connectionId),
      eq(googleConnections.connectedByUserId, eventType.ownerUserId),
      eq(googleConnections.status, 'active'),
    ))
    .limit(1)
  if (!connection) throw new Error('The selected Google account is no longer connected.')
  if (!connection.scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE)) {
    throw new Error('Reconnect the selected Google account to grant Calendar event access.')
  }
  return connection
}

function readGoogleMeetEntryPoint(value: unknown) {
  const entryPoints = readRecord(value).entryPoints
  if (!Array.isArray(entryPoints)) return null
  for (const entry of entryPoints) {
    const record = readRecord(entry)
    if (record.entryPointType === 'video') return readString(record.uri)
  }
  return null
}

function readGoogleCalendarError(payload: Record<string, unknown>, fallback: string) {
  const error = readRecord(payload.error)
  return readString(error.message) ?? fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function readPublicEventContext(slug: string) {
  const db = getDb()
  const [row] = await db
    .select({
      eventType: calEventTypes,
      organization: organizations,
      owner: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(calEventTypes)
    .innerJoin(organizations, eq(organizations.id, calEventTypes.organizationId))
    .innerJoin(users, eq(users.id, calEventTypes.ownerUserId))
    .where(and(eq(calEventTypes.slug, slug), eq(calEventTypes.status, 'active')))
    .limit(1)

  return row ?? null
}

export async function buildAvailabilityPayload(eventType: EventTypeRow, query: { from: string; days: number }) {
  const db = getDb()
  const now = new Date()
  const fromDate = parseDateKey(query.from) ?? startOfDateKey(isoDateKey(now, eventType.timezone))
  const days = Math.min(Math.max(query.days, 1), Math.min(eventType.bookingWindowDays, MAX_PUBLIC_DAYS))
  const untilDate = addDays(fromDate, days)
  const bookingRangeStart = zonedDateTimeToUtc(formatDateKey(fromDate), 0, eventType.timezone)
  const bookingRangeEnd = zonedDateTimeToUtc(formatDateKey(addDays(untilDate, 1)), 0, eventType.timezone)
  const minimumStartAt = new Date(now.getTime() + eventType.minimumNoticeMinutes * 60_000)

  const [rules, overrides, bookings] = await Promise.all([
    db.select().from(calAvailabilityRules).where(eq(calAvailabilityRules.eventTypeId, eventType.id)),
    db
      .select()
      .from(calAvailabilityOverrides)
      .where(and(
        eq(calAvailabilityOverrides.eventTypeId, eventType.id),
        gte(calAvailabilityOverrides.date, formatDateKey(fromDate)),
        lte(calAvailabilityOverrides.date, formatDateKey(untilDate)),
      )),
    db
      .select()
      .from(calBookings)
      .where(and(
        eq(calBookings.hostUserId, eventType.ownerUserId),
        inArray(calBookings.status, ['confirmed', 'pending']),
        gte(calBookings.startAt, bookingRangeStart),
        lte(calBookings.startAt, bookingRangeEnd),
      )),
  ])

  const slots = []
  for (let cursor = fromDate; cursor < untilDate; cursor = addDays(cursor, 1)) {
    const dateKey = formatDateKey(cursor)
    const windows = windowsForDate(dateKey, eventType, rules, overrides)
    for (const window of windows) {
      for (
        let minute = window.startMinute;
        minute + eventType.durationMinutes <= window.endMinute;
        minute += DEFAULT_SLOT_STEP_MINUTES
      ) {
        const startAt = zonedDateTimeToUtc(dateKey, minute, eventType.timezone)
        const endAt = new Date(startAt.getTime() + eventType.durationMinutes * 60_000)
        if (startAt < minimumStartAt) continue
        if (bookings.some((booking) => bookingConflicts(booking, startAt, endAt, eventType))) continue
        slots.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          date: dateKey,
          label: formatSlotLabel(startAt, eventType.timezone),
        })
      }
    }
  }

  return {
    eventTypeId: eventType.id,
    timezone: eventType.timezone,
    durationMinutes: eventType.durationMinutes,
    from: formatDateKey(fromDate),
    days,
    slots,
  }
}

function windowsForDate(dateKey: string, eventType: EventTypeRow, rules: AvailabilityRuleRow[], overrides: AvailabilityOverrideRow[]) {
  const date = parseDateKey(dateKey) ?? new Date()
  const weekday = date.getUTCDay()
  const dateOverrides = overrides.filter((override) => override.date === dateKey)
  const blocksWholeDay = dateOverrides.some((override) => !override.isAvailable && override.startMinute == null && override.endMinute == null)
  if (blocksWholeDay) return []

  const availableOverrides = dateOverrides.filter((override) => override.isAvailable && override.startMinute != null && override.endMinute != null)
  const baseWindows = availableOverrides.length > 0
    ? availableOverrides.map((override) => ({ startMinute: override.startMinute ?? 0, endMinute: override.endMinute ?? 0 }))
    : rules
      .filter((rule) => rule.weekday === weekday)
      .map((rule) => ({ startMinute: rule.startMinute, endMinute: rule.endMinute }))

  const blockRanges = dateOverrides.filter((override) => !override.isAvailable && override.startMinute != null && override.endMinute != null)
  return baseWindows.flatMap((window) => subtractBlockedRanges(window, blockRanges, eventType.durationMinutes))
}

function subtractBlockedRanges(
  window: { startMinute: number; endMinute: number },
  blocks: Array<{ startMinute: number | null; endMinute: number | null }>,
  durationMinutes: number,
) {
  let windows = [window]
  for (const block of blocks) {
    if (block.startMinute == null || block.endMinute == null) continue
    windows = windows.flatMap((candidate) => {
      if (block.endMinute! <= candidate.startMinute || block.startMinute! >= candidate.endMinute) return [candidate]
      const next = []
      if (block.startMinute! - candidate.startMinute >= durationMinutes) {
        next.push({ startMinute: candidate.startMinute, endMinute: block.startMinute! })
      }
      if (candidate.endMinute - block.endMinute! >= durationMinutes) {
        next.push({ startMinute: block.endMinute!, endMinute: candidate.endMinute })
      }
      return next
    })
  }
  return windows
}

function bookingConflicts(booking: BookingRow, startAt: Date, endAt: Date, eventType: EventTypeRow) {
  const bufferedStart = new Date(startAt.getTime() - eventType.bufferBeforeMinutes * 60_000)
  const bufferedEnd = new Date(endAt.getTime() + eventType.bufferAfterMinutes * 60_000)
  return rangesOverlap(booking.startAt, booking.endAt, bufferedStart, bufferedEnd)
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

function readAvailabilityQuery(query: Record<string, unknown>) {
  const from = typeof query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.from)
    ? query.from
    : ''
  const parsedDays = typeof query.days === 'string' ? Number.parseInt(query.days, 10) : 14
  const days = Number.isFinite(parsedDays) ? parsedDays : 14
  return { from, days }
}

function serializePublicEventContext(context: NonNullable<Awaited<ReturnType<typeof readPublicEventContext>>>) {
  return {
    eventType: {
      id: context.eventType.id,
      title: context.eventType.title,
      slug: context.eventType.slug,
      description: context.eventType.description,
      durationMinutes: context.eventType.durationMinutes,
      timezone: context.eventType.timezone,
      locationMode: context.eventType.locationMode,
      locationDetails: context.eventType.locationDetails,
      meetingProvider: context.eventType.meetingProvider,
      bookingWindowDays: context.eventType.bookingWindowDays,
      minimumNoticeMinutes: context.eventType.minimumNoticeMinutes,
    },
    organization: {
      id: context.organization.id,
      name: context.organization.name,
    },
    owner: {
      id: context.owner.id,
      name: context.owner.name,
      email: context.owner.email,
    },
  }
}

function serializeBooking(booking: BookingRow) {
  return {
    id: booking.id,
    eventTypeId: booking.eventTypeId,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestNotes: booking.guestNotes,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    status: booking.status,
    meetingUrl: booking.meetingUrl,
    cancelToken: booking.cancelToken,
    canceledAt: booking.canceledAt?.toISOString() ?? null,
    createdAt: booking.createdAt.toISOString(),
  }
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function parseDateKey(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDateKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function isoDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`
}

export function zonedDateTimeToUtc(dateKey: string, minuteOfDay: number, timeZone: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const hour = Math.floor(minuteOfDay / 60)
  const minute = minuteOfDay % 60
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let instant = desiredWallTime

  // Resolve the wall-clock time iteratively. Rechecking after the first offset
  // correction keeps this correct across daylight-saving transitions as well.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = new Date(instant)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(current)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const actualWallTime = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    )
    const correction = desiredWallTime - actualWallTime
    if (correction === 0) return current
    instant += correction
  }

  return new Date(instant)
}

function formatSlotLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

class SlotUnavailableError extends Error {}

export default router
