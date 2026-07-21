import { CalendarClock, CalendarDays } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const SECTIONS = [
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, end: true },
  { to: '/calendar/booking-links', label: 'Booking links', icon: CalendarClock, end: false },
] as const

export function CalendarSectionNav() {
  return (
    <nav aria-label="Calendar sections" className="flex w-fit border border-edge/18 bg-pit-3">
      {SECTIONS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `inline-flex h-8 items-center gap-2 border-r border-edge/12 px-3 font-mono text-[10px] uppercase tracking-label transition last:border-r-0 ${
            isActive
              ? 'bg-accent-fill/10 text-accent'
              : 'text-fg-3 hover:bg-accent-fill/5 hover:text-fg-1'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
