import { useQuery, useZero } from '@rocicorp/zero/react'
import { Building2, CalendarClock, Check, Clipboard, Clock, ExternalLink, Link as LinkIcon, Loader2, Plus, Trash2, UserRound, Video, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { config } from '../../config'
import { useAuth } from '../../lib/auth'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'
import { BookingDetailDrawer } from '../calendar/BookingDetailDrawer'
import { CalendarSectionNav } from '../calendar/CalendarSectionNav'

type CalEventType = Schema['tables']['cal_event_types']['row']
type CalAvailabilityRule = Schema['tables']['cal_availability_rules']['row']
type GoogleConnection = Schema['tables']['google_connections']['row']

const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const TIMEZONE_OPTIONS: PachSelectOption[] = [
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'Europe/Madrid', label: 'Madrid' },
]

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const DEFAULT_START = 9 * 60
const DEFAULT_END = 17 * 60

type AvailabilityDraft = Record<number, { enabled: boolean; startMinute: number; endMinute: number }>

type EventDraft = {
  title: string
  description: string
  durationMinutes: string
  timezone: string
  meetingLocation: string
  locationDetails: string
  minimumNoticeMinutes: string
  bookingWindowDays: string
  bufferBeforeMinutes: string
  bufferAfterMinutes: string
}

const EMPTY_EVENT_DRAFT: EventDraft = {
  title: '',
  description: '',
  durationMinutes: '30',
  timezone: 'America/Mexico_City',
  meetingLocation: 'manual',
  locationDetails: '',
  minimumNoticeMinutes: '120',
  bookingWindowDays: '30',
  bufferBeforeMinutes: '0',
  bufferAfterMinutes: '0',
}

export default function Scheduling() {
  const z = useZero<Schema, Mutators>()
  const { user, token } = useAuth()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [eventTypes] = useQuery(z.query.cal_event_types.orderBy('createdAt', 'desc'))
  const [availabilityRules] = useQuery(z.query.cal_availability_rules)
  const [bookings] = useQuery(z.query.cal_bookings.orderBy('startAt', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [googleConnections] = useQuery(z.query.google_connections.orderBy('updatedAt', 'desc'))
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>('')
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT_DRAFT)
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityDraft>(() => defaultAvailabilityDraft())
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [previewSlots, setPreviewSlots] = useState<Array<{ startAt: string; label: string }>>([])
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const availableOrganizations = organizations.filter((organization) => accessibleOrganizationIds.has(organization.id))
  const organizationOptions = availableOrganizations.map((organization) => ({ value: organization.id, label: organization.name }))
  const selectedOrganization = availableOrganizations.find((organization) => organization.id === selectedOrganizationId) ?? null
  const availableGoogleConnections = googleConnections.filter((connection) => (
    connection.connectedByUserId === user?.id &&
    connection.status === 'active' &&
    connection.scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE)
  ))
  const meetingLocationOptions: PachSelectOption[] = [
    ...availableGoogleConnections.map((connection) => ({
      value: googleMeetingLocationValue(connection.id),
      label: `Google Meet · ${googleConnectionLabel(connection)}`,
      icon: <Video className="h-3.5 w-3.5" />,
    })),
    { value: 'manual', label: 'Custom link or location', icon: <LinkIcon className="h-3.5 w-3.5" /> },
  ]
  useEffect(() => {
    if (!selectedOrganizationId && availableOrganizations[0]) {
      setSelectedOrganizationId(availableOrganizations[0].id)
    }
  }, [availableOrganizations, selectedOrganizationId])

  const scopedEventTypes = eventTypes.filter((eventType) => eventType.organizationId === selectedOrganizationId)
  const selectedEventType = creatingNew
    ? null
    : scopedEventTypes.find((eventType) => eventType.id === selectedEventTypeId) ?? scopedEventTypes[0] ?? null
  const selectedRules = selectedEventType
    ? availabilityRules.filter((rule) => rule.eventTypeId === selectedEventType.id)
    : []
  const selectedBookings = selectedEventType
    ? bookings.filter((booking) => booking.eventTypeId === selectedEventType.id && booking.status === 'confirmed')
    : []
  const selectedBooking = selectedBookingId ? bookings.find((booking) => booking.id === selectedBookingId) ?? null : null
  const selectedBookingEventType = selectedBooking ? eventTypes.find((eventType) => eventType.id === selectedBooking.eventTypeId) ?? null : null
  const selectedBookingOrganization = selectedBooking ? organizations.find((organization) => organization.id === selectedBooking.organizationId) ?? null : null
  const selectedBookingHost = selectedBooking ? users.find((entry) => entry.id === selectedBooking.hostUserId) ?? null : null

  useEffect(() => {
    if (!creatingNew && selectedEventType && selectedEventType.id !== selectedEventTypeId) {
      setSelectedEventTypeId(selectedEventType.id)
    }
  }, [creatingNew, selectedEventType, selectedEventTypeId])

  useEffect(() => {
    if (!selectedEventType) {
      setDraft(EMPTY_EVENT_DRAFT)
      setAvailabilityDraft(defaultAvailabilityDraft())
      return
    }

    setDraft({
      title: selectedEventType.title,
      description: selectedEventType.description ?? '',
      durationMinutes: String(selectedEventType.durationMinutes),
      timezone: normalizeSchedulingTimezone(selectedEventType.timezone),
      meetingLocation: meetingLocationFromEventType(selectedEventType),
      locationDetails: selectedEventType.locationDetails ?? '',
      minimumNoticeMinutes: String(selectedEventType.minimumNoticeMinutes),
      bookingWindowDays: String(selectedEventType.bookingWindowDays),
      bufferBeforeMinutes: String(selectedEventType.bufferBeforeMinutes),
      bufferAfterMinutes: String(selectedEventType.bufferAfterMinutes),
    })
    setAvailabilityDraft(draftFromRules(selectedRules, selectedEventType.timezone))
  }, [selectedEventType?.id, selectedRules.length])

  async function createEventType() {
    if (!selectedOrganizationId || !user) return
    const title = draft.title.trim() || 'Intro call'
    const id = crypto.randomUUID()
    const slug = uniqueSlug(title, eventTypes)
    const timezone = draft.timezone.trim() || EMPTY_EVENT_DRAFT.timezone
    const googleConnectionId = googleConnectionIdFromLocation(draft.meetingLocation)

    await z.mutate.cal_event_types.create({
      id,
      organizationId: selectedOrganizationId,
      ownerUserId: user.id,
      title,
      slug,
      description: draft.description.trim() || undefined,
      durationMinutes: parsePositiveInt(draft.durationMinutes, 30),
      timezone,
      locationMode: 'video',
      locationDetails: googleConnectionId ? undefined : draft.locationDetails.trim() || undefined,
      meetingProvider: googleConnectionId ? 'google_meet' : 'manual',
      metadata: googleConnectionId ? { googleConnectionId } : undefined,
      minimumNoticeMinutes: parsePositiveInt(draft.minimumNoticeMinutes, 120),
      bookingWindowDays: parsePositiveInt(draft.bookingWindowDays, 30),
      bufferBeforeMinutes: parseNonNegativeInt(draft.bufferBeforeMinutes, 0),
      bufferAfterMinutes: parseNonNegativeInt(draft.bufferAfterMinutes, 0),
    })

    for (const weekday of WEEKDAYS) {
      const entry = availabilityDraft[weekday.value]
      if (!entry.enabled) continue
      await z.mutate.cal_availability_rules.create({
        id: crypto.randomUUID(),
        organizationId: selectedOrganizationId,
        eventTypeId: id,
        weekday: weekday.value,
        startMinute: entry.startMinute,
        endMinute: Math.max(entry.endMinute, entry.startMinute + parsePositiveInt(draft.durationMinutes, 30)),
        timezone,
      })
    }

    setCreatingNew(false)
    setSelectedEventTypeId(id)
    setStatusMessage('Booking link created.')
  }

  async function saveSelectedEventType() {
    if (!selectedEventType) {
      await createEventType()
      return
    }
    const timezone = draft.timezone.trim() || selectedEventType.timezone
    const googleConnectionId = googleConnectionIdFromLocation(draft.meetingLocation)
    await z.mutate.cal_event_types.update({
      id: selectedEventType.id,
      title: draft.title.trim() || selectedEventType.title,
      description: draft.description.trim() || null,
      durationMinutes: parsePositiveInt(draft.durationMinutes, selectedEventType.durationMinutes),
      timezone,
      locationDetails: googleConnectionId ? null : draft.locationDetails.trim() || null,
      meetingProvider: googleConnectionId ? 'google_meet' : 'manual',
      metadata: eventTypeMetadata(selectedEventType.metadata, googleConnectionId),
      minimumNoticeMinutes: parsePositiveInt(draft.minimumNoticeMinutes, selectedEventType.minimumNoticeMinutes),
      bookingWindowDays: parsePositiveInt(draft.bookingWindowDays, selectedEventType.bookingWindowDays),
      bufferBeforeMinutes: parseNonNegativeInt(draft.bufferBeforeMinutes, selectedEventType.bufferBeforeMinutes),
      bufferAfterMinutes: parseNonNegativeInt(draft.bufferAfterMinutes, selectedEventType.bufferAfterMinutes),
    })

    for (const rule of selectedRules) {
      await z.mutate.cal_availability_rules.delete({ id: rule.id })
    }

    for (const weekday of WEEKDAYS) {
      const entry = availabilityDraft[weekday.value]
      if (!entry.enabled) continue
      await z.mutate.cal_availability_rules.create({
        id: crypto.randomUUID(),
        organizationId: selectedEventType.organizationId,
        eventTypeId: selectedEventType.id,
        weekday: weekday.value,
        startMinute: entry.startMinute,
        endMinute: Math.max(entry.endMinute, entry.startMinute + parsePositiveInt(draft.durationMinutes, 30)),
        timezone,
      })
    }

    setStatusMessage('Booking link saved.')
  }

  function startNewEventType() {
    setCreatingNew(true)
    setSelectedEventTypeId('')
    setDraft(EMPTY_EVENT_DRAFT)
    setAvailabilityDraft(defaultAvailabilityDraft())
    setPreviewSlots([])
    setStatusMessage(null)
  }

  async function deleteSelectedEventType() {
    if (!selectedEventType) return
    for (const rule of selectedRules) {
      await z.mutate.cal_availability_rules.delete({ id: rule.id })
    }
    await z.mutate.cal_event_types.delete({ id: selectedEventType.id })
    setSelectedEventTypeId('')
    setStatusMessage('Booking link deleted.')
  }

  async function loadPreviewSlots(eventType: CalEventType) {
    if (!token) return
    setLoadingSlots(true)
    try {
      const res = await fetch(`${config.apiUrl}/scheduling/event-types/${eventType.id}/slots?days=7`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await res.json()
      setPreviewSlots(Array.isArray(payload.slots) ? payload.slots.slice(0, 10) : [])
    } finally {
      setLoadingSlots(false)
    }
  }

  const bookingUrl = selectedEventType ? `${window.location.origin}/book/${selectedEventType.slug}` : ''

  return (
    <div className="flex h-full min-h-0 flex-col bg-pit text-fg-1">
      <header className="border-b border-edge/15 px-5 py-4">
        <div className="flex flex-col gap-3">
          <CalendarSectionNav />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-label text-accent">calendar</div>
              <h1 className="mt-1 text-xl font-semibold tracking-normal text-fg-1">Booking links</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-[220px] max-w-[55vw]">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                <PachSelect
                  value={selectedOrganizationId}
                  onChange={(organizationId) => {
                    setSelectedOrganizationId(organizationId)
                    setSelectedEventTypeId('')
                    setCreatingNew(false)
                  }}
                  options={organizationOptions}
                  display={selectedOrganization?.name ?? 'organization'}
                  popupWidth="220"
                  triggerClassName="flex h-9 w-full items-center justify-between border border-edge/18 bg-rim pl-9 pr-2 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
                />
              </div>
              <button
                type="button"
                onClick={startNewEventType}
                className="inline-flex h-9 items-center gap-2 border border-accent-fill/40 bg-accent-fill/12 px-3 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/18"
              >
                <Plus className="h-4 w-4" />
                New link
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="min-h-0 overflow-auto border-b border-edge/15 p-3 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            {scopedEventTypes.map((eventType) => (
              <button
                key={eventType.id}
                type="button"
                onClick={() => {
                  setCreatingNew(false)
                  setSelectedEventTypeId(eventType.id)
                }}
                className={`w-full border p-3 text-left transition ${
                  selectedEventType?.id === eventType.id
                    ? 'border-accent-fill/45 bg-accent-fill/10'
                    : 'border-edge/12 bg-pit-2 hover:border-edge/35'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg-1">{eventType.title}</div>
                    <div className="mt-1 truncate font-mono text-[10px] text-fg-4">/book/{eventType.slug}</div>
                  </div>
                  <span className="font-mono text-[10px] text-accent">{eventType.durationMinutes}m</span>
                </div>
              </button>
            ))}
            {scopedEventTypes.length === 0 && (
              <div className="border border-dashed border-edge/25 p-4 text-sm text-fg-3">
                Create your first booking link to publish available meeting times.
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-5">
          <div className="mx-auto max-w-4xl space-y-5">
            {statusMessage && (
              <div className="flex items-center justify-between border border-ok/25 bg-ok/8 px-3 py-2 font-mono text-xs text-ok">
                <span>{statusMessage}</span>
                <button type="button" onClick={() => setStatusMessage(null)} aria-label="dismiss"><X className="h-4 w-4" /></button>
              </div>
            )}

            <section className="space-y-4">
              <SectionTitle icon={CalendarClock} label="Booking link" />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} placeholder="Intro call" />
                <Field label="Duration" value={draft.durationMinutes} onChange={(value) => setDraft({ ...draft, durationMinutes: value })} suffix="min" />
                <Field label="Minimum notice" value={draft.minimumNoticeMinutes} onChange={(value) => setDraft({ ...draft, minimumNoticeMinutes: value })} suffix="min" />
                <Field label="Booking window" value={draft.bookingWindowDays} onChange={(value) => setDraft({ ...draft, bookingWindowDays: value })} suffix="days" />
                <SelectField
                  label="Meeting location"
                  value={draft.meetingLocation}
                  onChange={(value) => setDraft({ ...draft, meetingLocation: value })}
                  options={meetingLocationOptions}
                />
                {availableGoogleConnections.length === 0 && (
                  <div className="flex items-end pb-1 font-mono text-[10px] leading-relaxed text-fg-4">
                    Reconnect Google in <a href="/settings/search" className="ml-1 text-accent hover:underline">Settings → Search</a> to enable Google Meet.
                  </div>
                )}
                {draft.meetingLocation === 'manual' && (
                  <Field label="Custom link/location" value={draft.locationDetails} onChange={(value) => setDraft({ ...draft, locationDetails: value })} placeholder="Zoom, office, phone..." />
                )}
              </div>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={3}
                  className="mt-1 w-full resize-none border border-edge/15 bg-pit-2 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent/50"
                />
              </label>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionTitle icon={Clock} label="Availability" />
                <div className="w-full sm:w-[260px]">
                  <SelectField
                    label="Availability timezone"
                    value={draft.timezone}
                    onChange={(value) => setDraft({ ...draft, timezone: value })}
                    options={TIMEZONE_OPTIONS}
                  />
                </div>
              </div>
              <div className="space-y-2">
                {WEEKDAYS.map((weekday) => {
                  const entry = availabilityDraft[weekday.value]
                  return (
                    <div key={weekday.value} className="grid grid-cols-[72px_1fr_1fr] items-center gap-2 border border-edge/12 bg-pit-2 px-3 py-2 sm:grid-cols-[88px_1fr_1fr]">
                      <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-2">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(event) => setAvailabilityDraft({
                            ...availabilityDraft,
                            [weekday.value]: { ...entry, enabled: event.target.checked },
                          })}
                        />
                        {weekday.label}
                      </label>
                      <input
                        type="time"
                        disabled={!entry.enabled}
                        value={minutesToTimeInput(entry.startMinute)}
                        onChange={(event) => setAvailabilityDraft({
                          ...availabilityDraft,
                          [weekday.value]: { ...entry, startMinute: timeInputToMinutes(event.target.value, entry.startMinute) },
                        })}
                        className="h-9 min-w-0 border border-edge/15 bg-pit px-2 font-mono text-xs text-fg-1 outline-none disabled:opacity-40"
                      />
                      <input
                        type="time"
                        disabled={!entry.enabled}
                        value={minutesToTimeInput(entry.endMinute)}
                        onChange={(event) => setAvailabilityDraft({
                          ...availabilityDraft,
                          [weekday.value]: { ...entry, endMinute: endTimeInputToMinutes(event.target.value, entry.startMinute, entry.endMinute) },
                        })}
                        className="h-9 min-w-0 border border-edge/15 bg-pit px-2 font-mono text-xs text-fg-1 outline-none disabled:opacity-40"
                      />
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!selectedOrganizationId}
                onClick={saveSelectedEventType}
                className="inline-flex h-10 items-center gap-2 border border-accent-fill/40 bg-accent-fill/12 px-4 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/18 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
                {selectedEventType ? 'Save' : 'Create link'}
              </button>
              <button
                type="button"
                disabled={!selectedEventType}
                onClick={deleteSelectedEventType}
                className="inline-flex h-10 items-center gap-2 border border-fail/30 bg-fail/8 px-4 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-fail/12 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </main>

        <aside className="min-h-0 overflow-auto border-t border-edge/15 p-4 lg:border-l lg:border-t-0">
          <div className="space-y-5">
            <section className="space-y-3">
              <SectionTitle icon={LinkIcon} label="Public link" />
              {selectedEventType ? (
                <>
                  <div className="break-all border border-edge/15 bg-pit-2 p-3 font-mono text-xs text-fg-2">{bookingUrl}</div>
                  <div className="flex gap-2">
                    <IconButton title="Copy link" onClick={() => navigator.clipboard?.writeText(bookingUrl)}>
                      <Clipboard className="h-4 w-4" />
                    </IconButton>
                    <a
                      href={bookingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center border border-edge/20 bg-pit-2 text-fg-2 transition hover:border-accent/40 hover:text-accent"
                      title="Open link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm text-fg-3">Create or select a booking link.</p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle icon={Clock} label="Next slots" />
                {selectedEventType && (
                  <button
                    type="button"
                    onClick={() => loadPreviewSlots(selectedEventType)}
                    className="font-mono text-[10px] uppercase tracking-label text-accent"
                  >
                    refresh
                  </button>
                )}
              </div>
              {loadingSlots ? (
                <div className="flex items-center gap-2 text-sm text-fg-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading slots</div>
              ) : previewSlots.length > 0 ? (
                <div className="space-y-2">
                  {previewSlots.map((slot) => (
                    <div key={slot.startAt} className="border border-edge/12 bg-pit-2 px-3 py-2 text-sm text-fg-2">{slot.label}</div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-3">Refresh to preview available times.</p>
              )}
            </section>

            <section className="space-y-3">
              <SectionTitle icon={UserRound} label="Bookings" />
              {selectedBookings.length > 0 ? (
                <div className="space-y-2">
                  {selectedBookings.slice(0, 8).map((booking) => (
                    <button key={booking.id} type="button" onClick={() => setSelectedBookingId(booking.id)} className="w-full border border-edge/12 bg-pit-2 p-3 text-left transition hover:border-accent/35 hover:bg-accent-fill/4">
                      <div className="text-sm font-medium text-fg-1">{booking.guestName}</div>
                      <div className="mt-1 font-mono text-[10px] text-fg-4">{formatDateTime(booking.startAt)} · {booking.guestEmail}</div>
                      <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-accent">view details →</div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-3">No confirmed bookings yet.</p>
              )}
            </section>
          </div>
        </aside>
      </div>
      {selectedBooking ? (
        <BookingDetailDrawer
          booking={selectedBooking}
          eventType={selectedBookingEventType}
          organization={selectedBookingOrganization}
          host={selectedBookingHost}
          onClose={() => setSelectedBookingId(null)}
          onCanceled={() => setStatusMessage('Meeting canceled.')}
        />
      ) : null}
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
      <Icon className="h-4 w-4 text-accent" />
      {label}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, suffix }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</span>
      <div className="mt-1 flex border border-edge/15 bg-pit-2 focus-within:border-accent/50">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-fg-1 outline-none placeholder:text-fg-4"
        />
        {suffix && <span className="flex items-center px-3 font-mono text-[10px] uppercase tracking-label text-fg-4">{suffix}</span>}
      </div>
    </label>
  )
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: PachSelectOption[] }) {
  const selected = options.find((option) => option.value === value)
  return (
    <div className="block">
      <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</span>
      <div className="mt-1">
        <PachSelect
          variant="field"
          value={value}
          onChange={onChange}
          options={options}
          display={selected?.label ?? options[0]?.label ?? label}
          triggerClassName="flex h-10 w-full items-center justify-between border border-edge/15 bg-pit-2 px-3 text-left font-mono text-sm text-fg-1 outline-none transition hover:border-edge/35 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
        />
      </div>
    </div>
  )
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center border border-edge/20 bg-pit-2 text-fg-2 transition hover:border-accent/40 hover:text-accent"
    >
      {children}
    </button>
  )
}

function defaultAvailabilityDraft(): AvailabilityDraft {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday.value,
    { enabled: weekday.value >= 1 && weekday.value <= 5, startMinute: DEFAULT_START, endMinute: DEFAULT_END },
  ]))
}

function draftFromRules(rules: CalAvailabilityRule[], timezone: string): AvailabilityDraft {
  const draft = defaultAvailabilityDraft()
  for (const weekday of WEEKDAYS) {
    const rule = rules.find((candidate) => candidate.weekday === weekday.value && candidate.timezone === timezone) ??
      rules.find((candidate) => candidate.weekday === weekday.value)
    draft[weekday.value] = rule
      ? { enabled: true, startMinute: rule.startMinute, endMinute: rule.endMinute }
      : { ...draft[weekday.value], enabled: false }
  }
  return draft
}

function uniqueSlug(title: string, eventTypes: CalEventType[]) {
  const base = slugify(title) || 'meeting'
  const existing = new Set(eventTypes.map((eventType) => eventType.slug))
  if (!existing.has(base)) return base
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`
    if (!existing.has(candidate)) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function googleMeetingLocationValue(connectionId: string) {
  return `google_meet:${connectionId}`
}

function googleConnectionIdFromLocation(value: string) {
  return value.startsWith('google_meet:') ? value.slice('google_meet:'.length) || null : null
}

function googleConnectionLabel(connection: GoogleConnection) {
  return connection.providerAccountEmail ?? connection.providerAccountName ?? 'Google account'
}

function meetingLocationFromEventType(eventType: CalEventType) {
  if (eventType.meetingProvider !== 'google_meet') return 'manual'
  const connectionId = readStringMetadata(eventType.metadata, 'googleConnectionId')
  return connectionId ? googleMeetingLocationValue(connectionId) : 'manual'
}

function eventTypeMetadata(metadata: unknown, googleConnectionId: string | null) {
  const next = isRecord(metadata) ? { ...metadata } : {}
  if (googleConnectionId) next.googleConnectionId = googleConnectionId
  else delete next.googleConnectionId
  return next
}

function readStringMetadata(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return null
  return typeof metadata[key] === 'string' ? metadata[key] : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSchedulingTimezone(value: string) {
  return TIMEZONE_OPTIONS.some((option) => option.value === value) ? value : EMPTY_EVENT_DRAFT.timezone
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function minutesToTimeInput(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function timeInputToMinutes(value: string, fallback: number) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback
  return hour * 60 + minute
}

function endTimeInputToMinutes(value: string, startMinute: number, fallback: number) {
  const minute = timeInputToMinutes(value, fallback)
  return minute === 0 && startMinute > 0 ? 24 * 60 : minute
}

function formatDateTime(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
}
