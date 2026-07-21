import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Globe2, Loader2, MapPin, UserRound, Video } from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { config } from '../../config'
import './PublicBooking.css'

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
  const [selectedDate, setSelectedDate] = useState('')
  const [visibleMonth, setVisibleMonth] = useState('')
  const [selectedStartAt, setSelectedStartAt] = useState<string>('')
  const [showDetails, setShowDetails] = useState(false)
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
          setSelectedDate(slotsJson.slots?.[0]?.date ?? '')
          setVisibleMonth(slotsJson.slots?.[0]?.date.slice(0, 7) ?? '')
          setSelectedStartAt('')
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
    return Array.from(groups.entries())
  }, [slots])

  const availableDates = useMemo(() => new Set(groupedSlots.map(([date]) => date)), [groupedSlots])
  const monthKeys = useMemo(() => Array.from(new Set(groupedSlots.map(([date]) => date.slice(0, 7)))), [groupedSlots])
  const selectedDateSlots = groupedSlots.find(([date]) => date === selectedDate)?.[1] ?? []

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
        <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
          Loading booking link
        </div>
      </PublicShell>
    )
  }

  if (error && !eventPayload) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      </PublicShell>
    )
  }

  if (!eventPayload) return null

  if (booking) {
    return (
      <PublicShell>
        <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <EventSummary payload={eventPayload} />
          <section className="flex min-h-[520px] flex-col items-center justify-center border-t border-slate-200 p-8 text-center lg:border-l lg:border-t-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">You’re scheduled</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              You are scheduled for {formatFullDate(booking.startAt, eventPayload.eventType.timezone)}.
            </p>
            {booking.meetingUrl && (
              <a
                href={booking.meetingUrl}
                className="mt-6 inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
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
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        <EventSummary payload={eventPayload} />
        {showDetails ? (
          <AttendeeDetails
            selectedStartAt={selectedStartAt}
            timezone={eventPayload.eventType.timezone}
            guestName={guestName}
            guestEmail={guestEmail}
            guestNotes={guestNotes}
            error={error}
            submitting={submitting}
            onBack={() => setShowDetails(false)}
            onNameChange={setGuestName}
            onEmailChange={setGuestEmail}
            onNotesChange={setGuestNotes}
            onSubmit={submitBooking}
          />
        ) : (
          <section className="min-h-[600px] p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Select a Date &amp; Time</h2>
            {slots.length > 0 ? (
              <div className="mt-7 grid gap-7 md:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <MonthCalendar
                    monthKey={visibleMonth || monthKeys[0]}
                    monthKeys={monthKeys}
                    availableDates={availableDates}
                    selectedDate={selectedDate}
                    onMonthChange={setVisibleMonth}
                    onDateChange={(date) => {
                      setSelectedDate(date)
                      setSelectedStartAt('')
                    }}
                  />
                  <div className="mt-8">
                    <div className="text-xs font-medium text-slate-500">Time zone</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                      <Globe2 className="h-4 w-4 text-slate-500" />
                      {formatTimezone(eventPayload.eventType.timezone)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-3 text-sm font-medium text-slate-700">
                    {selectedDate ? formatShortDate(selectedDate, eventPayload.eventType.timezone) : 'Choose a date'}
                  </div>
                  <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
                    {selectedDateSlots.map((slot) => {
                      const selected = selectedStartAt === slot.startAt
                      return (
                        <div key={slot.startAt} className={selected ? 'grid grid-cols-2 gap-2' : ''}>
                          <button
                            type="button"
                            onClick={() => setSelectedStartAt(slot.startAt)}
                            className={`h-12 w-full rounded-md border text-sm font-semibold transition ${selected ? 'border-slate-700 bg-slate-700 text-white' : 'border-blue-600 bg-white text-blue-600 hover:border-blue-700 hover:bg-blue-50'}`}
                          >
                            {formatTime(slot.startAt, eventPayload.eventType.timezone)}
                          </button>
                          {selected && (
                            <button type="button" onClick={() => setShowDetails(true)} className="h-12 rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">
                              Next
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No available times in the next two weeks.</div>
            )}
          </section>
        )}
      </div>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-booking min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12 lg:px-8">
      {children}
      <div className="mt-6 text-center text-xs text-slate-400">Simple scheduling, powered by Pach</div>
    </div>
  )
}

function EventSummary({ payload }: { payload: PublicEventPayload }) {
  const ownerName = payload.owner.name || payload.owner.email
  return (
    <section className="border-b border-slate-200 bg-white p-6 sm:p-8 lg:border-b-0 lg:border-r">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white shadow-sm">{ownerName.charAt(0).toUpperCase()}</div>
      <div className="mt-6 text-sm font-medium text-slate-500">{ownerName}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{payload.eventType.title}</h1>
      <div className="mt-5 space-y-3 text-sm font-medium text-slate-500">
        <Meta icon={Clock}>{payload.eventType.durationMinutes} minutes</Meta>
        <Meta icon={payload.eventType.meetingProvider === 'google_meet' ? Video : MapPin}>{meetingLocationLabel(payload.eventType)}</Meta>
        <Meta icon={UserRound}>{payload.organization.name}</Meta>
      </div>
      {payload.eventType.description && <p className="mt-7 text-sm leading-6 text-slate-600">{payload.eventType.description}</p>}
    </section>
  )
}

function Meta({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <span>{children}</span>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </label>
  )
}

function AttendeeDetails({ selectedStartAt, timezone, guestName, guestEmail, guestNotes, error, submitting, onBack, onNameChange, onEmailChange, onNotesChange, onSubmit }: {
  selectedStartAt: string
  timezone: string
  guestName: string
  guestEmail: string
  guestNotes: string
  error: string | null
  submitting: boolean
  onBack: () => void
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onNotesChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <section className="min-h-[600px] p-6 sm:p-8">
      <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-blue-600 transition hover:bg-slate-50" aria-label="Back to available times">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h2 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">Enter Details</h2>
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <div className="font-medium text-slate-800">{formatFullDate(selectedStartAt, timezone)}</div>
          <div className="mt-1 text-xs">{formatTimezone(timezone)}</div>
        </div>
      </div>
      <div className="mt-6 max-w-lg space-y-5">
        <Input label="Name" value={guestName} onChange={onNameChange} />
        <Input label="Email" value={guestEmail} onChange={onEmailChange} type="email" />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Please share anything that will help prepare for our meeting.</span>
          <textarea value={guestNotes} onChange={(event) => onNotesChange(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </label>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button type="button" disabled={submitting || !guestName.trim() || !guestEmail.trim()} onClick={onSubmit} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Schedule event
        </button>
      </div>
    </section>
  )
}

function MonthCalendar({ monthKey, monthKeys, availableDates, selectedDate, onMonthChange, onDateChange }: {
  monthKey: string
  monthKeys: string[]
  availableDates: Set<string>
  selectedDate: string
  onMonthChange: (month: string) => void
  onDateChange: (date: string) => void
}) {
  const monthIndex = Math.max(0, monthKeys.indexOf(monthKey))
  const days = calendarDays(monthKey)
  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" disabled={monthIndex <= 0} onClick={() => onMonthChange(monthKeys[monthIndex - 1])} className="flex h-9 w-9 items-center justify-center rounded-full text-blue-600 transition hover:bg-blue-50 disabled:invisible" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-sm font-semibold text-slate-800">{formatMonth(monthKey)}</div>
        <button type="button" disabled={monthIndex >= monthKeys.length - 1} onClick={() => onMonthChange(monthKeys[monthIndex + 1])} className="flex h-9 w-9 items-center justify-center rounded-full text-blue-600 transition hover:bg-blue-50 disabled:invisible" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-slate-400">
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => <div key={day} className="py-2">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {days.map((day, index) => day ? (
          <button key={day} type="button" disabled={!availableDates.has(day)} onClick={() => onDateChange(day)} className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm transition ${selectedDate === day ? 'bg-blue-600 font-semibold text-white' : availableDates.has(day) ? 'bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100' : 'cursor-default text-slate-300'}`}>{Number(day.slice(-2))}</button>
        ) : <div key={`blank-${index}`} />)}
      </div>
    </div>
  )
}

function calendarDays(monthKey: string) {
  if (!monthKey) return []
  const [year, month] = monthKey.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return [...Array(firstWeekday).fill(''), ...Array.from({ length: daysInMonth }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`)]
}

function formatMonth(monthKey: string) {
  if (!monthKey) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthKey}-01T12:00:00.000Z`))
}

function formatShortDate(dateKey: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00.000Z`))
}

function formatTimezone(timezone: string) {
  return timezone === 'Europe/Madrid' ? 'Central European Time – Madrid' : timezone === 'America/Mexico_City' ? 'Central Time – Mexico City' : timezone.replaceAll('_', ' ')
}

function meetingLocationLabel(eventType: PublicEventPayload['eventType']) {
  if (eventType.meetingProvider === 'google_meet') return 'Google Meet'
  return eventType.locationDetails || 'Details provided after booking'
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
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
