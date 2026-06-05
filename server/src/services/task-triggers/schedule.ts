export type TaskTriggerSchedule = {
  kind?: string
  frequency?: string
  timezone?: string
  date?: string
  dayOfWeek?: number
  dayOfMonth?: number
  time?: string
}

const DEFAULT_TIME = '09:00'
const DEFAULT_TIMEZONE = 'America/Mexico_City'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function computeNextRunAt(schedule: TaskTriggerSchedule, from = new Date()) {
  const kind = schedule.kind === 'once' ? 'once' : 'recurring'
  const timezone = schedule.timezone || DEFAULT_TIMEZONE
  const [hour, minute] = parseTime(schedule.time)

  if (kind === 'once') {
    const date = parseDateParts(schedule.date, getZonedParts(from, timezone))
    return zonedTimeToUtc(date.year, date.month - 1, date.day, hour, minute, timezone)
  }

  if (schedule.frequency === 'weekly') {
    return nextWeeklyRun(schedule.dayOfWeek ?? 1, hour, minute, from, timezone)
  }

  if (schedule.frequency === 'quarterly') {
    return nextMonthlyRun(schedule.dayOfMonth ?? 1, hour, minute, from, 3, timezone)
  }

  return nextMonthlyRun(schedule.dayOfMonth ?? 1, hour, minute, from, 1, timezone)
}

export function getPeriodKey(schedule: TaskTriggerSchedule, runAt: Date) {
  const timezone = schedule.timezone || DEFAULT_TIMEZONE
  const parts = getZonedParts(runAt, timezone)
  if (schedule.kind === 'once') return `once:${formatDateKey(parts)}`
  if (schedule.frequency === 'weekly') return `week:${formatIsoWeekKey(parts)}`
  if (schedule.frequency === 'quarterly') {
    const quarter = Math.floor((parts.month - 1) / 3) + 1
    return `quarter:${parts.year}-Q${quarter}`
  }
  return `month:${parts.year}-${String(parts.month).padStart(2, '0')}`
}

function parseTime(value: string | undefined): [number, number] {
  const [hourRaw, minuteRaw] = (value || DEFAULT_TIME).split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  return [
    Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
    Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  ]
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseDateParts(value: string | undefined, fallback: ZonedParts) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return { year, month, day }
  }
  return { year: fallback.year, month: fallback.month, day: fallback.day }
}

function nextWeeklyRun(dayOfWeek: number, hour: number, minute: number, from: Date, timezone: string) {
  const normalizedDay = clamp(dayOfWeek, 0, 6)
  const parts = getZonedParts(from, timezone)
  const currentWeekday = getWeekday(parts.year, parts.month - 1, parts.day)
  const daysUntil = (normalizedDay - currentWeekday + 7) % 7
  let wallDate = addDays(parts.year, parts.month - 1, parts.day, daysUntil)
  let candidate = zonedTimeToUtc(wallDate.year, wallDate.month, wallDate.day, hour, minute, timezone)
  if (candidate <= from) {
    wallDate = addDays(wallDate.year, wallDate.month, wallDate.day, 7)
    candidate = zonedTimeToUtc(wallDate.year, wallDate.month, wallDate.day, hour, minute, timezone)
  }
  return candidate
}

function nextMonthlyRun(dayOfMonth: number, hour: number, minute: number, from: Date, intervalMonths: number, timezone: string) {
  const normalizedDay = clamp(dayOfMonth, 1, 31)
  const parts = getZonedParts(from, timezone)
  let year = parts.year
  let month = parts.month - 1

  while (true) {
    const candidate = makeMonthlyCandidate(year, month, normalizedDay, hour, minute, timezone)
    if (candidate > from) return candidate
    month += intervalMonths
    while (month > 11) {
      year += 1
      month -= 12
    }
  }
}

function makeMonthlyCandidate(year: number, month: number, dayOfMonth: number, hour: number, minute: number, timezone: string) {
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return zonedTimeToUtc(year, month, Math.min(dayOfMonth, maxDay), hour, minute, timezone)
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function getZonedParts(value: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value)

  const lookup = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
    minute: Number(lookup.get('minute')),
    second: Number(lookup.get('second')),
  }
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  let utc = new Date(Date.UTC(year, month, day, hour, minute, 0, 0))

  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(utc, timezone)
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0)
    const desired = Date.UTC(year, month, day, hour, minute, 0, 0)
    utc = new Date(utc.getTime() - (actual - desired))
  }

  return utc
}

function getWeekday(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).getUTCDay()
}

function addDays(year: number, month: number, day: number, amount: number) {
  const date = new Date(Date.UTC(year, month, day))
  date.setUTCDate(date.getUTCDate() + amount)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
}

function formatDateKey(value: Pick<ZonedParts, 'year' | 'month' | 'day'>) {
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

function formatIsoWeekKey(value: Pick<ZonedParts, 'year' | 'month' | 'day'>) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / ONE_DAY_MS + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
