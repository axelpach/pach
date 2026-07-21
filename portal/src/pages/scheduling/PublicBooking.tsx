import { CalendarClock, Check, Clock, Loader2, MapPin, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { config } from '../../config'

type PublicEventPayload = {
  eventType: {
    id: string
    title: string
    slug: string
    description?: string | null
    durationMinutes: number
    timezone: string
    locationMode: string
    locationDetails?: string | null
    meetingProvider: string
    bookingWindowDays: number
    minimumNoticeMinutes: number
  }
  organization: {
    id: string
    name: string
  }
  owner: {
    id: string
    name?: string | null
    email: string
  }
}

type SlotPayload = {
  slots: Array<{
    startAt: string
    endAt: string
    date: string
    label: string
  }>
}

type BookingPayload = {
  booking: {
    id: string
    startAt: string
    endAt: string
    guestName: string
    guestEmail: string
    meetingUrl?: string | null
    cancelToken: string
  }
}

export default function PublicBooking() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [eventPayload, setEventPayload] = useState<PublicEventPayload | null>(null)
  const [slots, setSlots] = useState<SlotPayload['slots']>([])
  const [selectedStartAt, setSelectedStartAt] = useState<string>('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestNotes, setGuestNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<BookingPayload['booking'] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const eventRes = await fetch(`${config.apiUrl}/scheduling/public/event-types/${encodeURIComponent(slug)}`)
        if (!eventRes.ok) throw new Error('Booking link not found.')
        const eventJson = await eventRes.json() as PublicEventPayload
        const slotsRes = await fetch(`${config.apiUrl}/scheduling/public/event-types/${encodeURIComponent(slug)}/slots?days=14`)
        if (!slotsRes.ok) throw new Error('Could not load available times.')
        const slotsJson = await slotsRes.json() as SlotPayload
        if (!canceled) {
          setEventPayload(eventJson)
          setSlots(slotsJson.slots ?? [])
          setSelectedStartAt(slotsJson.slots?.[0]?.startAt ?? '')
        }
      } catch (loadError) {
        if (!canceled) setError(loadError instanceof Error ? loadError.message : 'Could not load booking link.')
      } finally {
        if (!canceled) setLoading(false)
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [slug])

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, SlotPayload['slots']>()
    for (const slot of slots) {
      const entries = groups.get(slot.date) ?? []
      entries.push(slot)
      groups.set(slot.date, entries)
    }
    return Array.from(groups.entries()).slice(0, 8)
  }, [slots])

  async function submitBooking() {
    if (!selectedStartAt || !guestName.trim() || !guestEmail.trim()) {
      setError('Choose a time and enter your name and email.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${config.apiUrl}/scheduling/public/event-types/${encodeURIComponent(slug)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: selectedStartAt,
          guestName,
          guestEmail,
          guestNotes,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.message ?? 'Could not create booking.')
      setBooking((payload as BookingPayload).booking)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create booking.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PublicShell>
        <div className="flex min-h-[360px] items-center justify-center text-fg-3">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-accent" />
          Loading booking link
        </div>
      </PublicShell>
    )
  }

  if (error && !eventPayload) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-xl border border-fail/30 bg-fail/8 p-6 text-fail">{error}</div>
      </PublicShell>
    )
  }

  if (!eventPayload) return null

  if (booking) {
    return (
      <PublicShell>
        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_1.1fr]">
          <EventSummary payload={eventPayload} />
          <section className="border border-ok/25 bg-ok/8 p-6">
            <div className="flex h-11 w-11 items-center justify-center border border-ok/30 bg-ok/10 text-ok">
              <Check className="h-5 w-5" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-fg-1">Meeting booked</h1>
            <p className="mt-2 text-sm leading-6 text-fg-3">
              You are scheduled for {formatFullDate(booking.startAt, eventPayload.eventType.timezone)}.
            </p>
            {booking.meetingUrl && (
              <a
                href={booking.meetingUrl}
                className="mt-5 inline-flex border border-accent-fill/40 bg-accent-fill/12 px-4 py-2 font-mono text-xs uppercase tracking-label text-accent"
              >
                Open meeting link
              </a>
            )}
          </section>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <EventSummary payload={eventPayload} />

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">Available times</div>
            <div className="max-h-[640px] space-y-4 overflow-auto pr-1">
              {groupedSlots.map(([date, dateSlots]) => (
                <div key={date} className="border border-edge/12 bg-pit-2 p-3">
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">{formatDateHeading(date, eventPayload.eventType.timezone)}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {dateSlots.map((slot) => (
                      <button
                        key={slot.startAt}
                        type="button"
                        onClick={() => setSelectedStartAt(slot.startAt)}
                        className={`h-11 border px-3 text-left font-mono text-xs transition ${
                          selectedStartAt === slot.startAt
                            ? 'border-accent-fill/45 bg-accent-fill/12 text-accent'
                            : 'border-edge/15 bg-pit text-fg-2 hover:border-edge/35'
                        }`}
                      >
                        {formatTime(slot.startAt, eventPayload.eventType.timezone)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {slots.length === 0 && (
                <div className="border border-dashed border-edge/25 p-6 text-sm text-fg-3">No available times in the next two weeks.</div>
              )}
            </div>
          </div>

          <div className="border border-edge/15 bg-pit-2 p-4">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">Your details</div>
            <div className="mt-4 space-y-3">
              <Input label="Name" value={guestName} onChange={setGuestName} />
              <Input label="Email" value={guestEmail} onChange={setGuestEmail} type="email" />
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">Notes</span>
                <textarea
                  value={guestNotes}
                  onChange={(event) => setGuestNotes(event.target.value)}
                  rows={4}
                  className="mt-1 w-full resize-none border border-edge/15 bg-pit px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent/50"
                />
              </label>
              {selectedStartAt && (
                <div className="border border-edge/12 bg-pit px-3 py-2 text-sm text-fg-2">
                  {formatFullDate(selectedStartAt, eventPayload.eventType.timezone)}
                </div>
              )}
              {error && <div className="border border-fail/30 bg-fail/8 px-3 py-2 text-sm text-fail">{error}</div>}
              <button
                type="button"
                disabled={submitting || !selectedStartAt || slots.length === 0}
                onClick={submitBooking}
                className="inline-flex h-11 w-full items-center justify-center gap-2 border border-accent-fill/40 bg-accent-fill/12 px-4 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/18 disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                Book meeting
              </button>
            </div>
          </div>
        </section>
      </div>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-pit px-4 py-6 text-fg-1 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between border-b border-edge/15 pb-4">
        <div className="font-mono text-sm font-semibold uppercase tracking-label text-accent">p@ch</div>
        <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">booking</div>
      </div>
      {children}
    </div>
  )
}

function EventSummary({ payload }: { payload: PublicEventPayload }) {
  return (
    <section className="border border-edge/15 bg-pit-2 p-6">
      <div className="font-mono text-[10px] uppercase tracking-label text-accent">{payload.organization.name}</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-normal text-fg-1">{payload.eventType.title}</h1>
      {payload.eventType.description && <p className="mt-3 text-sm leading-6 text-fg-3">{payload.eventType.description}</p>}
      <div className="mt-6 space-y-3 text-sm text-fg-2">
        <Meta icon={Clock}>{payload.eventType.durationMinutes} minutes</Meta>
        <Meta icon={UserRound}>{payload.owner.name || payload.owner.email}</Meta>
        {payload.eventType.locationDetails && <Meta icon={MapPin}>{payload.eventType.locationDetails}</Meta>}
      </div>
    </section>
  )
}

function Meta({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-accent" />
      <span>{children}</span>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full border border-edge/15 bg-pit px-3 text-sm text-fg-1 outline-none focus:border-accent/50"
      />
    </label>
  )
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDateHeading(dateKey: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00.000Z`))
}

function formatFullDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
