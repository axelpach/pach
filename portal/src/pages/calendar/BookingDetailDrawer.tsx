import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Building2, CalendarClock, Clock, ExternalLink, FileText, Loader2, Mail, Trash2, UserRound, Users, Video, X } from 'lucide-react'
import { config } from '../../config'
import { useAuth } from '../../lib/auth'
import type { Schema } from '../../zero-schema'

type BookingRow = Schema['tables']['cal_bookings']['row']
type EventTypeRow = Schema['tables']['cal_event_types']['row']
type OrganizationRow = Schema['tables']['organizations']['row']
type UserRow = Schema['tables']['users']['row']

export function BookingDetailDrawer({ booking, eventType, organization, host, onClose, onCanceled }: {
  booking: BookingRow
  eventType?: EventTypeRow | null
  organization?: OrganizationRow | null
  host?: UserRow | null
  onClose: () => void
  onCanceled?: () => void
}) {
  const { token } = useAuth()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const callLink = booking.meetingUrl || (isExternalUrl(eventType?.locationDetails) ? eventType?.locationDetails : null)
  const calendarLink = readMetadataString(booking.metadata, 'googleCalendarHtmlLink')
  const timezone = eventType?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || canceling) return
      if (confirmingCancel) setConfirmingCancel(false)
      else onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [canceling, confirmingCancel, onClose])

  async function cancelMeeting() {
    if (!token || canceling) return
    setCanceling(true)
    setError(null)
    try {
      const response = await fetch(`${config.apiUrl}/scheduling/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(typeof payload.message === 'string' ? payload.message : 'Could not cancel the meeting.')
      }
      setConfirmingCancel(false)
      onCanceled?.()
      onClose()
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel the meeting.')
    } finally {
      setCanceling(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[900] flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <aside className="relative h-screen min-h-screen w-[480px] max-w-full overflow-y-auto border-l border-edge/35 bg-bg-2 font-mono" onClick={(event) => event.stopPropagation()}>
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-edge/15 bg-bg-2 px-6 py-4">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-label text-accent">calendar — meeting</div>
              <h2 className="mt-1 truncate font-mono text-lg font-bold lowercase text-fg-1">{eventType?.title || 'scheduled meeting'}</h2>
            </div>
            <button type="button" onClick={onClose} className="p-1 text-fg-4 transition hover:text-accent" aria-label="Close meeting details">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-6 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} />
              <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">booked {formatCompactDate(booking.createdAt)}</span>
            </div>

            <section className="border border-edge/15 bg-pit px-4 py-4">
              <DetailHeading icon={CalendarClock}>when</DetailHeading>
              <div className="mt-3 text-base font-semibold text-fg-1">{formatMeetingDate(booking.startAt)}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-fg-3">
                <Clock className="h-3.5 w-3.5" />
                {formatMeetingTimeRange(booking.startAt, booking.endAt)} · {timezoneLabel(timezone)}
              </div>
            </section>

            <section>
              <DetailHeading icon={Users}>attendees</DetailHeading>
              <div className="mt-3 space-y-2">
                <AttendeeCard role="host" name={host?.name || host?.email || 'Meeting host'} email={host?.email} />
                <AttendeeCard role="guest" name={booking.guestName} email={booking.guestEmail} />
              </div>
            </section>

            <section>
              <DetailHeading icon={Video}>meeting location</DetailHeading>
              <div className="mt-3 border border-edge/15 bg-pit p-4">
                <div className="text-sm text-fg-2">{locationLabel(booking, eventType)}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {callLink ? <ActionLink href={callLink} label="join call" /> : null}
                  {calendarLink ? <ActionLink href={calendarLink} label="open in google calendar" /> : null}
                </div>
              </div>
            </section>

            <section>
              <DetailHeading icon={Building2}>booking details</DetailHeading>
              <div className="mt-3 divide-y divide-edge/12 border border-edge/15 bg-pit px-4">
                <DetailRow label="organization" value={organization?.name || '—'} />
                <DetailRow label="booking link" value={eventType?.title || '—'} />
                <DetailRow label="guest email" value={booking.guestEmail} />
              </div>
            </section>

            {booking.guestNotes ? (
              <section>
                <DetailHeading icon={FileText}>guest notes</DetailHeading>
                <p className="mt-3 whitespace-pre-wrap border border-edge/15 bg-pit p-4 text-sm leading-6 text-fg-2">{booking.guestNotes}</p>
              </section>
            ) : null}

            {error ? <div className="border border-fail/30 bg-fail/8 px-3 py-2 text-sm text-fail">{error}</div> : null}

            {booking.status !== 'canceled' ? (
              <div className="border-t border-edge/15 pt-5">
                <button type="button" onClick={() => setConfirmingCancel(true)} className="inline-flex items-center gap-2 border border-fail/30 bg-fail/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-fail/14">
                  <Trash2 className="h-3.5 w-3.5" />
                  cancel meeting
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {confirmingCancel ? (
        <div className="fixed inset-0 z-[920] flex items-center justify-center bg-overlay/80 px-4 backdrop-blur-sm" onClick={() => !canceling && setConfirmingCancel(false)}>
          <div className="w-full max-w-lg border border-edge/20 bg-pit-2 shadow-terminal-overlay" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-edge/12 px-6 py-5">
              <div className="font-mono text-[10px] uppercase tracking-label text-fail">calendar — cancel meeting</div>
              <h2 className="mt-1.5 font-mono text-xl lowercase text-fg-1">cancel meeting with {booking.guestName}?</h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              <div className="flex items-start gap-3 border border-warn/25 bg-warn/8 p-3 text-sm text-fg-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <span>This cancels the connected Google Calendar event and emails its attendees, if applicable.</span>
              </div>
              <div className="font-mono text-xs text-fg-3">{formatMeetingDate(booking.startAt)} · {booking.guestEmail}</div>
            </div>
            <div className="flex items-center justify-between border-t border-edge/12 px-6 py-4">
              <button type="button" disabled={canceling} onClick={() => setConfirmingCancel(false)} className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1 disabled:opacity-40">[keep meeting]</button>
              <button type="button" disabled={canceling} onClick={() => void cancelMeeting()} className="inline-flex items-center gap-2 border border-fail/34 bg-fail/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-fail/14 disabled:opacity-40">
                {canceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {canceling ? 'canceling...' : 'cancel meeting'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}

function DetailHeading({ icon: Icon, children }: { icon: typeof Clock; children: string }) {
  return <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4"><Icon className="h-4 w-4 text-accent" />{children}</div>
}

function AttendeeCard({ role, name, email }: { role: string; name: string; email?: string | null }) {
  return (
    <div className="flex items-center gap-3 border border-edge/15 bg-pit p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-edge/20 bg-pit-2 text-accent"><UserRound className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg-1">{name}</div>
        {email ? <div className="mt-1 flex items-center gap-1.5 truncate text-[10px] text-fg-4"><Mail className="h-3 w-3" />{email}</div> : null}
      </div>
      <span className="font-mono text-[9px] uppercase tracking-label text-fg-4">{role}</span>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[110px_1fr] gap-3 py-3 text-xs"><span className="uppercase tracking-label text-fg-4">{label}</span><span className="min-w-0 break-words text-fg-2">{value}</span></div>
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-accent-fill/35 bg-accent-fill/10 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16"><ExternalLink className="h-3.5 w-3.5" />{label}</a>
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'confirmed' ? 'border-ok/30 bg-ok/8 text-ok' : status === 'canceled' ? 'border-fail/30 bg-fail/8 text-fail' : 'border-warn/30 bg-warn/8 text-warn'
  return <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-label ${tone}`}>{status}</span>
}

function locationLabel(booking: BookingRow, eventType?: EventTypeRow | null) {
  if (booking.meetingUrl || eventType?.meetingProvider === 'google_meet') return 'Google Meet'
  return eventType?.locationDetails || 'No meeting location provided'
}

function isExternalUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : null
}

function formatMeetingDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatMeetingTimeRange(startAt: number, endAt: number) {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${formatter.format(new Date(startAt))}–${formatter.format(new Date(endAt))}`
}

function formatCompactDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function timezoneLabel(timezone: string) {
  return timezone.split('/').at(-1)?.replaceAll('_', ' ') || timezone
}
