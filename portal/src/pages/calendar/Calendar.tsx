import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import type {
  DatesSetArg,
  DayCellContentArg,
  DayCellMountArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core'
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Newspaper, Radio, Search } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from '../issues/IssueFilters'
import './Calendar.css'

type DistributionRunRow = Schema['tables']['mkt_distribution_runs']['row']
type OrganizationRow = Schema['tables']['organizations']['row']
type ContentItemRow = Schema['tables']['mkt_content_items']['row']
type PublicationRow = Schema['tables']['mkt_publications']['row']

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'
type CalendarViewSlug = 'month' | 'week' | 'day' | 'agenda'
type CalendarEventType = 'marketing'
type EventTone = 'ok' | 'warn' | 'fail' | 'info' | 'idle'

type UnifiedCalendarEvent = {
  id: string
  type: CalendarEventType
  title: string
  startsAt: number
  endsAt: number
  status: string
  organizationId: string
  organizationName: string
  publicationId: string | null
  publicationName: string
  contentTitle: string
  timezone: string
  href: string
  tone: EventTone
}

const CALENDAR_STATE_STORAGE_KEY = 'pach.calendar.state'
const LEGACY_CALENDAR_VIEW_STORAGE_KEY = 'pach.calendar.view'
const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000
const VIEW_OPTIONS: Array<{ value: CalendarView; label: string }> = [
  { value: 'dayGridMonth', label: 'month' },
  { value: 'timeGridWeek', label: 'week' },
  { value: 'timeGridDay', label: 'day' },
  { value: 'listWeek', label: 'agenda' },
]
const VIEW_TO_URL_SLUG: Record<CalendarView, CalendarViewSlug> = {
  dayGridMonth: 'month',
  timeGridWeek: 'week',
  timeGridDay: 'day',
  listWeek: 'agenda',
}
const URL_SLUG_TO_VIEW: Record<CalendarViewSlug, CalendarView> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
  agenda: 'listWeek',
}
const STATUS_ORDER = ['scheduled', 'sending', 'sent', 'failed', 'draft', 'paused', 'canceled']
const EMPTY_FILTERS: ActiveFilters = {
  eventType: [],
  organization: [],
  status: [],
  publication: [],
}

type StoredCalendarState = {
  view: CalendarView
  currentDate: number | null
  filters: ActiveFilters
  searchQuery: string
}

export default function CalendarPage() {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const calendarRef = useRef<FullCalendar | null>(null)
  const dayCellCleanupRef = useRef(new WeakMap<HTMLElement, () => void>())
  const initialCalendarStateRef = useRef<StoredCalendarState | null>(null)
  const isApplyingUrlStateRef = useRef(false)
  const hasSyncedInitialUrlRef = useRef(false)
  const pendingCalendarNavigationRef = useRef<{ view: CalendarView; date: number } | null>(null)
  const queuedCalendarUrlSyncRef = useRef<{ replace: boolean } | null>(null)

  if (!initialCalendarStateRef.current) {
    const storedState = readStoredCalendarState()
    const urlState = readCalendarStateFromUrl(searchParams)
    initialCalendarStateRef.current = {
      ...storedState,
      view: urlState.view ?? storedState.view,
      currentDate: urlState.currentDate ?? storedState.currentDate,
    }
  }
  const initialCalendarState = initialCalendarStateRef.current!

  const [calendarTitle, setCalendarTitle] = useState('')
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number } | null>(null)
  const [view, setView] = useState<CalendarView>(initialCalendarState.view)
  const [currentDate, setCurrentDate] = useState<number | null>(initialCalendarState.currentDate)
  const [searchQuery, setSearchQuery] = useState(initialCalendarState.searchQuery)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(initialCalendarState.filters)
  const [urlSyncRevision, setUrlSyncRevision] = useState(0)

  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [distributionRuns] = useQuery(z.query.mkt_distribution_runs.orderBy('scheduledAt', 'asc'))
  const [contentItems] = useQuery(z.query.mkt_content_items.orderBy('title', 'asc'))
  const [publications] = useQuery(z.query.mkt_publications.orderBy('name', 'asc'))

  const calendarEvents = useMemo(
    () => buildMarketingBroadcastEvents(distributionRuns, organizations, contentItems, publications),
    [distributionRuns, organizations, contentItems, publications],
  )
  const filterConfigs = useMemo(
    () => buildFilterConfigs(calendarEvents, organizations, publications),
    [calendarEvents, organizations, publications],
  )
  const filteredEvents = useMemo(
    () => filterCalendarEvents(calendarEvents, activeFilters, searchQuery),
    [calendarEvents, activeFilters, searchQuery],
  )
  const fullCalendarEvents = useMemo<EventInput[]>(
    () => filteredEvents.map(toFullCalendarEvent),
    [filteredEvents],
  )
  const rangeEvents = useMemo(
    () => visibleRange
      ? filteredEvents.filter((event) => event.startsAt >= visibleRange.start && event.startsAt < visibleRange.end)
      : filteredEvents,
    [filteredEvents, visibleRange],
  )
  const upcomingEvents = useMemo(
    () => filteredEvents.filter((event) => event.startsAt >= Date.now()).slice(0, 5),
    [filteredEvents],
  )

  useEffect(() => {
    writeStoredCalendarState({ view, currentDate, filters: activeFilters, searchQuery })
  }, [activeFilters, currentDate, searchQuery, view])

  useEffect(() => {
    const queuedSync = queuedCalendarUrlSyncRef.current
    if (!queuedSync || currentDate == null) return

    queuedCalendarUrlSyncRef.current = null
    syncCalendarUrl(view, currentDate, { replace: queuedSync.replace })
  }, [currentDate, searchParams, urlSyncRevision, view])

  useEffect(() => {
    const urlState = readCalendarStateFromUrl(searchParams)
    if (!urlState.hasCalendarParams) return

    const nextView = urlState.view ?? view
    const nextDate = urlState.currentDate
    const viewMatches = nextView === view
    const dateMatches = nextDate == null || isSameDateParam(nextDate, currentDate)
    if (viewMatches && dateMatches) return

    setView(nextView)
    if (nextDate != null) setCurrentDate(nextDate)

    const api = calendarRef.current?.getApi()
    if (!api) return

    isApplyingUrlStateRef.current = true
    if (nextDate != null) {
      api.changeView(nextView, new Date(nextDate))
    } else {
      api.changeView(nextView)
    }
  }, [searchParams])

  function setFilterField(field: string, values: string[]) {
    setActiveFilters((current) => ({ ...current, [field]: values }))
  }

  function clearAllFilters() {
    setActiveFilters({ ...EMPTY_FILTERS })
    setSearchQuery('')
  }

  function queueCalendarUrlSync(options: { replace: boolean }) {
    queuedCalendarUrlSyncRef.current = options
    setUrlSyncRevision((revision) => revision + 1)
  }

  function changeView(nextView: CalendarView) {
    pendingCalendarNavigationRef.current = null
    setView(nextView)
    calendarRef.current?.getApi().changeView(nextView)
  }

  function moveCalendar(direction: 'prev' | 'next' | 'today') {
    const api = calendarRef.current?.getApi()
    if (!api) return
    pendingCalendarNavigationRef.current = null
    if (direction === 'prev') api.prev()
    if (direction === 'next') api.next()
    if (direction === 'today') api.today()
  }

  function handleDatesSet(arg: DatesSetArg) {
    const nextView = readCalendarView(arg.view.type) ?? 'timeGridWeek'
    const nextDate = calendarRef.current?.getApi().getDate() ?? arg.view.currentStart
    const pendingNavigation = pendingCalendarNavigationRef.current
    if (pendingNavigation && pendingNavigation.view !== nextView) return

    setCalendarTitle(arg.view.title)
    setVisibleRange({ start: arg.start.getTime(), end: arg.end.getTime() })
    queueCalendarUrlSync({
      replace: isApplyingUrlStateRef.current || !hasSyncedInitialUrlRef.current,
    })
    setView(nextView)
    setCurrentDate(pendingNavigation?.date ?? nextDate.getTime())
    if (pendingNavigation?.view === nextView) {
      pendingCalendarNavigationRef.current = null
    }
    hasSyncedInitialUrlRef.current = true
    isApplyingUrlStateRef.current = false
  }

  function openMonthDay(date: Date) {
    const api = calendarRef.current?.getApi()
    if (!api || api.view.type !== 'dayGridMonth') return
    pendingCalendarNavigationRef.current = { view: 'timeGridDay', date: date.getTime() }
    queueCalendarUrlSync({ replace: false })
    setView('timeGridDay')
    setCurrentDate(date.getTime())
    api.changeView('timeGridDay', date)
  }

  function handleDayCellDidMount(arg: DayCellMountArg) {
    if (arg.view.type !== 'dayGridMonth') return

    dayCellCleanupRef.current.get(arg.el)?.()

    const dayButton = arg.el.querySelector<HTMLElement>('.pach-calendar-day-number[data-calendar-date]')
    if (!dayButton) return

    const handlePointerDown = (event: PointerEvent) => {
      openMonthDayFromPointer(arg.date, event)
    }

    dayButton.addEventListener('pointerdown', handlePointerDown, true)
    dayCellCleanupRef.current.set(arg.el, () => {
      dayButton.removeEventListener('pointerdown', handlePointerDown, true)
    })
  }

  function handleDayCellWillUnmount(arg: DayCellMountArg) {
    dayCellCleanupRef.current.get(arg.el)?.()
    dayCellCleanupRef.current.delete(arg.el)
  }

  function openMonthDayFromPointer(date: Date, event: PointerEvent) {
    const api = calendarRef.current?.getApi()
    if (!api || api.view.type !== 'dayGridMonth') return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    pendingCalendarNavigationRef.current = { view: 'timeGridDay', date: date.getTime() }
    queueCalendarUrlSync({ replace: false })
    window.setTimeout(() => {
      setView('timeGridDay')
      setCurrentDate(date.getTime())
      api.changeView('timeGridDay', date)
    }, 0)
  }

  function handleEventClick(arg: EventClickArg) {
    const href = String(arg.event.extendedProps.href ?? '')
    if (!href) return
    arg.jsEvent.preventDefault()
    navigate(href)
  }

  function syncCalendarUrl(nextView: CalendarView, nextDate: Date | number | null, options: { replace?: boolean } = {}) {
    const currentParams = getLiveSearchParams(searchParams)
    const nextParams = new URLSearchParams(currentParams)
    nextParams.set('view', VIEW_TO_URL_SLUG[nextView])

    if (nextDate != null) {
      nextParams.set('date', formatDateParam(nextDate))
    } else {
      nextParams.delete('date')
    }

    if (nextParams.toString() === currentParams.toString()) return
    setSearchParams(nextParams, { replace: options.replace ?? false })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-pit text-fg-1">
      <header className="relative z-[120] shrink-0 border-b border-edge/12 bg-pit/80 px-4 py-3 backdrop-blur-sm md:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">calendar</div>
              <h1 className="mt-0.5 truncate font-mono text-xl font-bold lowercase text-fg-1 md:text-2xl">
                {calendarTitle || 'schedule'}
              </h1>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveCalendar('prev')}
                className="flex h-8 w-8 items-center justify-center border border-edge/18 bg-pit-3 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Previous calendar range"
                title="previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveCalendar('today')}
                className="h-8 border border-edge/18 bg-pit-3 px-3 font-mono text-[10px] uppercase tracking-label text-fg-2 transition hover:border-accent hover:text-accent"
              >
                today
              </button>
              <button
                type="button"
                onClick={() => moveCalendar('next')}
                className="flex h-8 w-8 items-center justify-center border border-edge/18 bg-pit-3 text-fg-3 transition hover:border-accent hover:text-accent"
                aria-label="Next calendar range"
                title="next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative z-[130] flex flex-wrap items-center gap-2">
              <FilterButton
                activeFilters={activeFilters}
                filterConfigs={filterConfigs}
                onFilterChange={setFilterField}
                onClearAll={clearAllFilters}
                buttonClassName="h-8 px-4 py-0"
              />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="$ search events"
                  className="h-8 w-[min(72vw,260px)] border border-edge/15 bg-pit-3 pl-8 pr-3 font-mono text-xs text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent focus:shadow-glow-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex border border-edge/18 bg-pit-3">
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => changeView(option.value)}
                    className={`h-8 min-w-[72px] border-r border-edge/12 px-3 font-mono text-[10px] uppercase tracking-label transition last:border-r-0 ${
                      view === option.value
                        ? 'bg-accent-fill/10 text-accent'
                        : 'text-fg-3 hover:bg-accent-fill/5 hover:text-fg-1'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-label text-fg-4 sm:flex">
                <span><span className="text-accent">{rangeEvents.length}</span> in view</span>
                <span><span className="text-accent">{filteredEvents.length}</span> total</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="pach-calendar-shell relative min-h-0 overflow-hidden border-edge/12 xl:border-r">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={view}
            initialDate={currentDate ? new Date(currentDate) : undefined}
            headerToolbar={false}
            height="100%"
            events={fullCalendarEvents}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            eventDidMount={handleEventMount}
            dayCellContent={(arg) => renderDayCellContent(arg, openMonthDay)}
            dayCellDidMount={handleDayCellDidMount}
            dayCellWillUnmount={handleDayCellWillUnmount}
            eventClassNames={(arg) => [`pach-calendar-event--${String(arg.event.extendedProps.tone ?? 'idle')}`]}
            nowIndicator
            expandRows
            dayMaxEvents={3}
            eventMinHeight={64}
            eventShortHeight={48}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            scrollTime="08:00:00"
            allDaySlot={false}
            firstDay={1}
            timeZone="local"
            displayEventTime={false}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
          />
          {filteredEvents.length === 0 ? (
            <div className="pointer-events-none absolute inset-x-4 top-20 border border-edge/16 bg-pit-2/95 px-4 py-6 text-center shadow-terminal-overlay md:left-1/2 md:w-[420px] md:-translate-x-1/2">
              <div className="font-mono text-xs uppercase tracking-label text-fg-3">// no scheduled events</div>
              <div className="mt-2 text-sm text-fg-4">
                {calendarEvents.length === 0 ? 'scheduled marketing runs will appear here' : 'no events match the current filters'}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="hidden min-h-0 overflow-auto bg-pit-2/55 px-4 py-4 xl:block">
          <div className="border-b border-edge/12 pb-3">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">upcoming</div>
            <div className="mt-1 font-mono text-lg font-bold lowercase text-fg-1">{upcomingEvents.length}</div>
          </div>
          <div className="mt-4 space-y-2">
            {upcomingEvents.length === 0 ? (
              <div className="font-mono text-xs text-fg-4">// no upcoming marketing runs</div>
            ) : (
              upcomingEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => navigate(event.href)}
                  className="w-full border border-edge/12 bg-pit px-3 py-2 text-left transition hover:border-accent hover:bg-accent-fill/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs font-bold lowercase text-fg-1">{event.title}</span>
                    <span className={`shrink-0 font-mono text-[10px] uppercase tracking-label ${statusTextClass(event.tone)}`}>
                      {event.status}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                    {formatScheduledDate(event.startsAt, event.timezone)}
                  </div>
                  <div className="mt-1 truncate text-xs text-fg-3">
                    {event.publicationName} · {event.organizationName}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

function buildMarketingBroadcastEvents(
  runs: DistributionRunRow[],
  organizations: OrganizationRow[],
  contentItems: ContentItemRow[],
  publications: PublicationRow[],
): UnifiedCalendarEvent[] {
  const organizationById = new Map(organizations.map((entry) => [entry.id, entry]))
  const contentById = new Map(contentItems.map((entry) => [entry.id, entry]))
  const publicationById = new Map(publications.map((entry) => [entry.id, entry]))

  return runs
    .filter((run) => ['newsletter', 'blog'].includes(run.channel) && Boolean(run.scheduledAt))
    .map((run) => {
      const organization = organizationById.get(run.organizationId)
      const publication = run.publicationId ? publicationById.get(run.publicationId) : null
      const content = run.contentItemId ? contentById.get(run.contentItemId) : null
      const startsAt = Number(run.scheduledAt)
      return {
        id: `marketing:${run.id}`,
        type: 'marketing',
        title: run.name || run.subject || content?.title || (run.channel === 'blog' ? 'blog post' : 'newsletter broadcast'),
        startsAt,
        endsAt: startsAt + DEFAULT_EVENT_DURATION_MS,
        status: run.status,
        organizationId: run.organizationId,
        organizationName: organization?.name ?? 'unknown organization',
        publicationId: run.publicationId ?? null,
        publicationName: publication?.name ?? (run.channel === 'blog' ? 'blog' : 'newsletter'),
        contentTitle: content?.title ?? '',
        timezone: run.scheduledTimezone || 'America/Mexico_City',
        href: run.channel === 'blog' && run.contentItemId ? `/marketing/content?content=${run.contentItemId}` : `/marketing/broadcasts/${run.id}`,
        tone: statusTone(run.status),
      } satisfies UnifiedCalendarEvent
    })
    .sort((a, b) => a.startsAt - b.startsAt)
}

function buildFilterConfigs(
  events: UnifiedCalendarEvent[],
  organizations: OrganizationRow[],
  publications: PublicationRow[],
): FilterFieldConfig[] {
  const organizationIds = new Set(events.map((event) => event.organizationId))
  const publicationIds = new Set(events.map((event) => event.publicationId).filter((id): id is string => Boolean(id)))
  const statuses = new Set(events.map((event) => event.status))
  const statusOptions = [
    ...STATUS_ORDER.filter((status) => statuses.has(status)),
    ...[...statuses].filter((status) => !STATUS_ORDER.includes(status)).sort(),
  ]

  return [
    {
      field: 'eventType',
      label: 'event type',
      icon: CalendarDays,
      options: [{ value: 'marketing', label: 'marketing' }],
    },
    {
      field: 'organization',
      label: 'organization',
      icon: Building2,
      options: organizations
        .filter((organization) => organizationIds.has(organization.id))
        .map((organization) => ({ value: organization.id, label: organization.name })),
      allowSelectAll: true,
    },
    {
      field: 'status',
      label: 'status',
      icon: Radio,
      options: statusOptions.map((status) => ({ value: status, label: status })),
      allowSelectAll: true,
    },
    {
      field: 'publication',
      label: 'publication',
      icon: Newspaper,
      options: publications
        .filter((publication) => publicationIds.has(publication.id))
        .map((publication) => ({ value: publication.id, label: publication.name })),
      allowSelectAll: true,
    },
  ]
}

function filterCalendarEvents(events: UnifiedCalendarEvent[], activeFilters: ActiveFilters, searchQuery: string) {
  const q = searchQuery.trim().toLowerCase()
  return events.filter((event) => {
    if (!matchesFilter(activeFilters.eventType, event.type)) return false
    if (!matchesFilter(activeFilters.organization, event.organizationId)) return false
    if (!matchesFilter(activeFilters.status, event.status)) return false
    if (!matchesFilter(activeFilters.publication, event.publicationId ?? '')) return false
    if (!q) return true

    return [
      event.title,
      event.status,
      event.organizationName,
      event.publicationName,
      event.contentTitle,
      event.timezone,
    ].join(' ').toLowerCase().includes(q)
  })
}

function matchesFilter(values: string[] | undefined, value: string) {
  return !values || values.length === 0 || values.includes(value)
}

function toFullCalendarEvent(event: UnifiedCalendarEvent): EventInput {
  return {
    id: event.id,
    title: event.title,
    start: new Date(event.startsAt).toISOString(),
    end: new Date(event.endsAt).toISOString(),
    extendedProps: event,
  }
}

function renderDayCellContent(arg: DayCellContentArg, onOpenDay: (date: Date) => void) {
  if (arg.view.type !== 'dayGridMonth') return arg.dayNumberText

  return (
    <button
      type="button"
      className="pach-calendar-day-number"
      data-calendar-date={formatDateParam(arg.date)}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenDay(arg.date)
      }}
    >
      {arg.dayNumberText}
    </button>
  )
}

function renderEventContent(arg: EventContentArg) {
  const event = arg.event.extendedProps as UnifiedCalendarEvent
  return (
    <div className="pach-calendar-event">
      <div className="pach-calendar-event__topline">
        <span className="pach-calendar-event__time">{formatEventTime(event.startsAt)}</span>
        <span className="pach-calendar-event__status">{event.status}</span>
      </div>
      <div className="pach-calendar-event__title">{event.title}</div>
      <div className="pach-calendar-event__meta">{event.publicationName} · {timezoneShortLabel(event.timezone)}</div>
    </div>
  )
}

function handleEventMount(arg: EventMountArg) {
  const event = arg.event.extendedProps as UnifiedCalendarEvent
  arg.el.title = [
    event.title,
    event.status,
    formatScheduledDate(event.startsAt, event.timezone),
    event.publicationName,
    event.organizationName,
  ].filter(Boolean).join('\n')
}

function readStoredCalendarState(): StoredCalendarState {
  const fallback: StoredCalendarState = {
    view: 'timeGridWeek',
    currentDate: null,
    filters: { ...EMPTY_FILTERS },
    searchQuery: '',
  }
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(CALENDAR_STATE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredCalendarState>
      return {
        view: readCalendarView(parsed.view) ?? fallback.view,
        currentDate: readFiniteTimestamp(parsed.currentDate),
        filters: normalizeStoredFilters(parsed.filters),
        searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
      }
    }

    const legacyView = readCalendarView(window.localStorage.getItem(LEGACY_CALENDAR_VIEW_STORAGE_KEY))
    if (legacyView) return { ...fallback, view: legacyView }
  } catch {
    // Storage can be unavailable in restricted contexts.
  }

  return fallback
}

function writeStoredCalendarState(state: StoredCalendarState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CALENDAR_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in restricted contexts.
  }
}

function readCalendarStateFromUrl(params: URLSearchParams) {
  const view = readCalendarViewSlug(params.get('view'))
  const currentDate = readDateParam(params.get('date'))
  return {
    view,
    currentDate,
    hasCalendarParams: params.has('view') || params.has('date'),
  }
}

function getLiveSearchParams(fallback: URLSearchParams) {
  if (typeof window === 'undefined') return fallback
  return new URLSearchParams(window.location.search)
}

function readCalendarView(value: unknown): CalendarView | null {
  return typeof value === 'string' && VIEW_OPTIONS.some((option) => option.value === value)
    ? value as CalendarView
    : null
}

function readCalendarViewSlug(value: unknown): CalendarView | null {
  if (typeof value !== 'string') return null
  return value in URL_SLUG_TO_VIEW ? URL_SLUG_TO_VIEW[value as CalendarViewSlug] : null
}

function readFiniteTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date.getTime()
}

function formatDateParam(value: Date | number) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameDateParam(left: number | null, right: number | null) {
  if (left == null || right == null) return left === right
  return formatDateParam(left) === formatDateParam(right)
}

function normalizeStoredFilters(value: unknown): ActiveFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_FILTERS }
  const raw = value as Record<string, unknown>
  return {
    eventType: readStringArray(raw.eventType),
    organization: readStringArray(raw.organization),
    status: readStringArray(raw.status),
    publication: readStringArray(raw.publication),
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function statusTone(status: string): EventTone {
  if (['sent', 'published', 'ready'].includes(status)) return 'ok'
  if (['scheduled', 'sending', 'draft', 'paused'].includes(status)) return 'warn'
  if (['failed', 'canceled', 'archived'].includes(status)) return 'fail'
  return 'info'
}

function statusTextClass(tone: EventTone) {
  if (tone === 'ok') return 'text-ok'
  if (tone === 'warn') return 'text-warn'
  if (tone === 'fail') return 'text-fail'
  if (tone === 'info') return 'text-info'
  return 'text-fg-4'
}

function formatEventTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatScheduledDate(value: number, timezone: string) {
  const formatted = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
  return `${formatted} · ${timezoneShortLabel(timezone)}`
}

function timezoneShortLabel(timezone: string) {
  if (timezone === 'America/Mexico_City') return 'Mexico City'
  if (timezone === 'Europe/Madrid') return 'Madrid'
  return timezone.split('/').at(-1)?.replace(/_/g, ' ') ?? timezone
}
