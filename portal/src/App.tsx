import { Routes, Route, NavLink, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useZero, ZeroProvider } from '@rocicorp/zero/react'
import { Activity as ActivityIcon, CalendarDays, CircleDollarSign, FileText, FolderKanban, LogOut, Megaphone, MessageCircleMore, Menu, Moon, Palette, Rows3, Settings2, Sun, X } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { schema, type Schema } from './zero-schema'
import { mutators, type Mutators } from './mutators'
import { config } from './config'
import { AuthProvider, useAuth } from './lib/auth'
import Design from './pages/design/Design'
import CRM from './pages/crm/CRM'
import Docs from './pages/docs/Docs'
import Finance from './pages/finance/Finance'
import Activity from './pages/activity/Activity'
import CalendarPage from './pages/calendar/Calendar'
import Marketing from './pages/marketing/Marketing'
import SettingsPage from './pages/settings/Settings'
import Issues from './pages/issues/Issues'
import IssueDetail from './pages/issues/IssueDetail'
import IssuesLayout from './pages/issues/IssuesLayout'
import Labels from './pages/issues/Labels'
import TaskTriggers from './pages/issues/TaskTriggers'
import Login from './pages/Login'
import WhatsAppLayout from './pages/whatsapp/WhatsAppLayout'
import WhatsAppTemplates from './pages/whatsapp/Templates'
import Campaigns from './pages/whatsapp/Campaigns'
import CampaignDetail from './pages/whatsapp/CampaignDetail'
import { Scanlines, LiveClock } from './components/pach'
import { SearchPalette } from './components/SearchPalette'
import { GlobalIssueComposer, requestGlobalIssueComposer } from './pages/issues/IssueComposer'

const HOME_PATH = '/issues'
const WHATSAPP_PROJECTS = new Set(['ardia', 'ardia-mkt'])

type OuterNavItem = {
  label: string
  path: string
  requiresWhatsApp?: boolean
}

const OUTER_NAV_ITEMS: readonly OuterNavItem[] = [
  { label: 'Issues', path: '/issues' },
  { label: 'Activity', path: '/activity' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Docs', path: '/docs' },
  { label: 'CRM', path: '/crm' },
  { label: 'Marketing', path: '/marketing/content' },
  { label: 'Finance', path: '/finance/dashboard' },
  { label: 'WhatsApp', path: '/whatsapp/templates', requiresWhatsApp: true },
  { label: 'Design', path: '/design' },
  { label: 'Settings', path: '/settings/repositories' },
]

type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'pach.theme'

const ThemeContext = createContext<{
  theme: ThemeMode
  toggleTheme: () => void
} | null>(null)

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Storage can be unavailable in private or restricted contexts.
    }
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}

function isNavPathActive(targetPath: string, pathname: string) {
  if (targetPath.startsWith('/finance')) return pathname.startsWith('/finance')
  if (targetPath.startsWith('/marketing')) return pathname.startsWith('/marketing')
  if (targetPath.startsWith('/whatsapp')) return pathname.startsWith('/whatsapp')
  if (targetPath.startsWith('/settings')) return pathname.startsWith('/settings')
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`)
}

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/* ---------------- Topbar ---------------- */
function Topbar() {
  const { user, logout } = useAuth()
  return (
    <div
      className="hidden md:flex items-center justify-between flex-shrink-0 px-5 py-2.5 border-b border-edge/15 bg-void text-[10px] uppercase tracking-label text-fg-3 relative z-20"
    >
      <span className="flex items-center gap-3.5">
        <span className="text-accent glow tracking-wide-2">P@CH</span>
        <span>// operator terminal</span>
        <span>· op: <span className="text-fg-1">{user?.name?.toLowerCase() || user?.email || 'unknown'}</span></span>
      </span>
      <span className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="text-ok">●</span> session secure
        </span>
        <span className="hidden md:inline">uplink 14.3kb/s</span>
        <span className="hidden md:inline"><LiveClock /></span>
        <button
          onClick={logout}
          className="text-fg-4 hover:text-accent uppercase tracking-label"
        >
          [logout]
        </button>
      </span>
    </div>
  )
}

/* ---------------- Sidebar ---------------- */
function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: ComponentType<{ className?: string }>
  label: string
}) {
  const location = useLocation()
  const isActive = isNavPathActive(to, location.pathname)

  return (
    <NavLink
      to={to}
      className={`group relative mx-auto flex h-11 w-11 items-center justify-center transition-colors ${
        isActive
          ? 'text-accent bg-accent-fill/8 ring-1 ring-accent-fill/20'
          : 'text-fg-3 hover:text-fg-1 hover:bg-accent-fill/4'
      }`}
      title={label}
    >
      <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-current'}`} />
      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap border border-edge/25 bg-void px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-accent shadow-terminal-popover group-hover:block">
        <span className="text-fg-4">›</span> {label}
      </span>
    </NavLink>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group relative flex h-9 w-9 items-center justify-center border border-edge/15 bg-pit-3 text-fg-3 transition hover:border-edge/35 hover:bg-accent-fill/6 hover:text-accent"
      title={`switch to ${nextTheme} mode`}
      aria-label={`switch to ${nextTheme} mode`}
    >
      <Icon className="h-4 w-4" />
      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap border border-edge/25 bg-void px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-accent shadow-terminal-popover group-hover:block">
        <span className="text-fg-4">›</span> {nextTheme}
      </span>
    </button>
  )
}

function Sidebar() {
  const items = useVisibleOuterNavItems()
  return (
    <nav className="hidden md:flex w-[68px] flex-shrink-0 py-3 font-mono text-xs relative z-10 flex-col items-center bg-void border-r border-edge/12">
      <div className="flex flex-col items-center gap-2">
        {items.map((item) => (
          <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} />
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pt-4">
        <ThemeToggle />
        <div className="rotate-180 [writing-mode:vertical-rl] text-[9px] uppercase tracking-[0.3em] text-fg-4">
          pach
        </div>
      </div>
    </nav>
  )
}

/* ---------------- Mobile header + drawer ---------------- */
const MOBILE_NAV_ITEMS: Array<{
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  requiresWhatsApp?: boolean
}> = [
  { to: '/issues', label: 'issues', icon: Rows3 },
  { to: '/activity', label: 'activity', icon: ActivityIcon },
  { to: '/calendar', label: 'calendar', icon: CalendarDays },
  { to: '/docs', label: 'docs', icon: FileText },
  { to: '/crm', label: 'crm', icon: FolderKanban },
  { to: '/marketing/content', label: 'marketing', icon: Megaphone },
  { to: '/finance/dashboard', label: 'finance', icon: CircleDollarSign },
  { to: '/whatsapp/templates', label: 'whatsapp', icon: MessageCircleMore, requiresWhatsApp: true },
  { to: '/design', label: 'design', icon: Palette },
  { to: '/settings/repositories', label: 'settings', icon: Settings2 },
]

function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <div className="md:hidden flex items-center justify-between flex-shrink-0 px-4 py-3 border-b border-edge/15 bg-void relative z-20">
      <div className="font-bold text-base text-accent glow tracking-wide">
        p@ch_
      </div>
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center border border-edge/20 bg-pit-3 text-fg-2 transition hover:text-accent hover:border-edge/40"
        aria-label="open menu"
      >
        <Menu className="h-4 w-4" />
      </button>
    </div>
  )
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const items = useVisibleMobileNavItems()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const ThemeIcon = theme === 'dark' ? Sun : Moon

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  // close drawer when route changes
  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!open) return null

  return (
    <div className="md:hidden fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-overlay/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-[80%] max-w-[320px] flex-col bg-void border-r border-edge/20 shadow-terminal-popover">
        <div className="flex items-center justify-between border-b border-edge/15 px-4 py-3">
          <div className="font-bold text-base text-accent glow tracking-wide">
            p@ch_
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-fg-3 transition hover:text-accent"
            aria-label="close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 text-[9px] uppercase tracking-label text-fg-4">
          // op: <span className="text-fg-2">{user?.name?.toLowerCase() || user?.email || 'unknown'}</span>
        </div>

        <nav className="flex-1 overflow-auto px-2 py-2 space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = isNavPathActive(item.to, location.pathname)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 font-mono text-sm lowercase transition ${
                  isActive
                    ? 'bg-accent-fill/8 text-accent ring-1 ring-accent-fill/20'
                    : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-edge/12 p-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-3 py-2.5 font-mono text-sm uppercase tracking-label text-fg-4 transition hover:text-accent"
          >
            <ThemeIcon className="h-4 w-4" />
            [{nextTheme}]
          </button>
          <button
            onClick={() => {
              onClose()
              logout()
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 font-mono text-sm uppercase tracking-label text-fg-4 transition hover:text-fail"
          >
            <LogOut className="h-4 w-4" />
            [logout]
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Shell ---------------- */
function AppShell() {
  const canAccessWhatsApp = useCanAccessWhatsApp()
  const visibleOuterNavItems = useVisibleOuterNavItems()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.toLowerCase() !== 'c') return
      if (isTextEntryTarget(event.target)) return

      event.preventDefault()
      requestGlobalIssueComposer()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

      if (isTextEntryTarget(event.target)) return

      const currentIndex = visibleOuterNavItems.findIndex((item) => {
        if (item.path === '/crm') return location.pathname.startsWith('/crm')
        if (item.path === '/docs') return location.pathname.startsWith('/docs')
        if (item.path.startsWith('/marketing')) return location.pathname.startsWith('/marketing')
        if (item.path.startsWith('/finance')) return location.pathname.startsWith('/finance')
        if (item.path === '/design') return location.pathname.startsWith('/design') || location.pathname.startsWith('/decks')
        if (item.path === '/issues') return location.pathname.startsWith('/issues')
        if (item.path === '/activity') return location.pathname.startsWith('/activity')
        if (item.path === '/calendar') return location.pathname.startsWith('/calendar')
        if (item.path === '/whatsapp/templates') return location.pathname.startsWith('/whatsapp')
        if (item.path.startsWith('/settings')) return location.pathname.startsWith('/settings')
        return false
      })

      if (currentIndex === -1) return

      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (currentIndex + direction + visibleOuterNavItems.length) % visibleOuterNavItems.length
      navigate(visibleOuterNavItems[nextIndex].path)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate, visibleOuterNavItems])

  if (!canAccessWhatsApp && location.pathname.startsWith('/whatsapp')) {
    return <Navigate to={HOME_PATH} replace />
  }

  return (
    <div className="relative flex flex-col h-screen bg-pit text-fg-1 overflow-hidden">
      <Scanlines opacity={0.4} />
      <div className="relative z-10 flex flex-col h-full">
        <Topbar />
        <MobileHeader onMenuClick={() => setMobileMenuOpen(true)} />
        <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <SearchPalette tabs={visibleOuterNavItems.map((item) => ({ label: item.label, path: item.path, icon: item.icon }))} />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
              <Route path="/crm/*" element={<CRM />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/activity/:activityEventId" element={<Activity />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/marketing/*" element={<Marketing />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:documentId" element={<Docs />} />
              <Route path="/finance/*" element={<Finance />} />
              <Route path="/issues" element={<IssuesLayout />}>
                <Route index element={<Issues />} />
                <Route path="labels" element={<Labels />} />
                <Route path="triggers" element={<TaskTriggers />} />
                <Route path=":issueId" element={<IssueDetail />} />
              </Route>
              {canAccessWhatsApp && (
                <Route path="/whatsapp" element={<WhatsAppLayout />}>
                  <Route index element={<WhatsAppTemplates />} />
                  <Route path="templates" element={<WhatsAppTemplates />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="campaigns/:id" element={<CampaignDetail />} />
                </Route>
              )}
              <Route path="/design" element={<Design />} />
              <Route path="/design/:templateSlug" element={<Design />} />
              <Route path="/settings/*" element={<SettingsPage />} />
              <Route path="/decks" element={<Navigate to="/design" replace />} />
              <Route path="/decks/:slug" element={<LegacyDeckRedirect />} />
            </Routes>
          </div>
        </div>
      </div>
      <GlobalIssueComposer />
    </div>
  )
}

function useCanAccessWhatsApp() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const accessibleIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])

  return organizations.some((organization) => {
    if (!WHATSAPP_PROJECTS.has(organization.project ?? '')) return false
    return accessibleIds.has(organization.id)
  })
}

function useVisibleOuterNavItems() {
  const canAccessWhatsApp = useCanAccessWhatsApp()
  return useMemo(
    () =>
      OUTER_NAV_ITEMS
        .filter((item) => !item.requiresWhatsApp || canAccessWhatsApp)
        .map((item) => ({
          ...item,
          icon:
            item.path === '/issues' ? Rows3 :
            item.path === '/activity' ? ActivityIcon :
            item.path === '/calendar' ? CalendarDays :
            item.path === '/docs' ? FileText :
            item.path === '/crm' ? FolderKanban :
            item.path.startsWith('/marketing') ? Megaphone :
            item.path.startsWith('/finance') ? CircleDollarSign :
            item.path === '/whatsapp/templates' ? MessageCircleMore :
            item.path.startsWith('/settings') ? Settings2 :
            Palette,
        })),
    [canAccessWhatsApp],
  )
}

function LegacyDeckRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={slug ? `/design/${slug}` : '/design'} replace />
}

function useVisibleMobileNavItems() {
  const canAccessWhatsApp = useCanAccessWhatsApp()
  return useMemo(
    () => MOBILE_NAV_ITEMS.filter((item) => !item.requiresWhatsApp || canAccessWhatsApp),
    [canAccessWhatsApp],
  )
}

/* ---------------- Gated app ---------------- */
function GatedApp() {
  const { user, token } = useAuth()
  const location = useLocation()

  if (!token || !user) {
    if (location.pathname === '/login') return <Login />
    return <Navigate to="/login" replace />
  }

  if (location.pathname === '/login') return <Navigate to={HOME_PATH} replace />

  return (
    <ZeroProvider
      userID={user.id}
      auth={token}
      server={config.zeroServerUrl}
      schema={schema}
      mutators={mutators}
      mutateURL={`${config.apiUrl}/zero/push`}
    >
      <AppShell />
    </ZeroProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<GatedApp />} />
        </Routes>
      </ThemeProvider>
    </AuthProvider>
  )
}
