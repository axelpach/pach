import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useZero, ZeroProvider } from '@rocicorp/zero/react'
import { FolderKanban, LayoutTemplate, LogOut, MessageCircleMore, Menu, Rows3, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { schema } from './zero-schema'
import { mutators, type Mutators } from './mutators'
import { config } from './config'
import { AuthProvider, useAuth } from './lib/auth'
import Decks from './pages/Decks'
import DeckViewer from './pages/DeckViewer'
import CRM from './pages/crm/CRM'
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

const HOME_PATH = '/issues'
const WHATSAPP_PROJECTS = new Set(['ardia', 'ardia-mkt'])

const OUTER_NAV_ITEMS = [
  { label: 'Issues', path: '/issues' },
  { label: 'CRM', path: '/crm' },
  { label: 'WhatsApp', path: '/whatsapp/templates', requiresWhatsApp: true },
  { label: 'Decks', path: '/decks' },
] as const

/* ---------------- Topbar ---------------- */
function Topbar() {
  const { user, logout } = useAuth()
  return (
    <div
      className="hidden md:flex items-center justify-between flex-shrink-0 px-5 py-2.5 border-b border-[rgba(0,255,140,0.15)] bg-void text-[10px] uppercase tracking-label text-fg-3 relative z-20"
    >
      <span className="flex items-center gap-3.5">
        <span className="text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide-2">P@CH</span>
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
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative mx-auto flex h-11 w-11 items-center justify-center transition-colors ${
          isActive
            ? 'text-accent bg-[rgba(0,255,136,0.08)] ring-1 ring-[rgba(0,255,136,0.2)]'
            : 'text-fg-3 hover:text-fg-1 hover:bg-[rgba(0,255,136,0.04)]'
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-current'}`} />
          <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap border border-[rgba(0,255,140,0.25)] bg-void px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-accent shadow-[0_0_12px_rgba(0,255,136,0.15),0_10px_30px_rgba(0,0,0,0.5)] group-hover:block">
            <span className="text-fg-4">›</span> {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const items = useVisibleOuterNavItems()
  return (
    <nav className="hidden md:flex w-[68px] flex-shrink-0 py-3 font-mono text-xs relative z-10 flex-col items-center bg-void border-r border-[rgba(0,255,140,0.12)]">
      <div className="flex flex-col items-center gap-2">
        {items.map((item) => (
          <NavItem key={item.path} to={item.path} icon={item.icon} label={item.label} />
        ))}
      </div>

      <div className="mt-auto pt-4">
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
  { to: '/crm', label: 'crm', icon: FolderKanban },
  { to: '/whatsapp/templates', label: 'whatsapp', icon: MessageCircleMore, requiresWhatsApp: true },
  { to: '/decks', label: 'decks', icon: LayoutTemplate },
]

function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <div className="md:hidden flex items-center justify-between flex-shrink-0 px-4 py-3 border-b border-[rgba(0,255,140,0.15)] bg-void relative z-20">
      <div className="font-bold text-base text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide">
        p@ch_
      </div>
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center border border-[rgba(0,255,140,0.2)] bg-pit-3 text-fg-2 transition hover:text-accent hover:border-[rgba(0,255,140,0.4)]"
        aria-label="open menu"
      >
        <Menu className="h-4 w-4" />
      </button>
    </div>
  )
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const items = useVisibleMobileNavItems()

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
        className="absolute inset-0 bg-[rgba(0,0,0,0.7)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-[80%] max-w-[320px] flex-col bg-void border-r border-[rgba(0,255,140,0.2)] shadow-[0_0_24px_rgba(0,255,136,0.18)]">
        <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.15)] px-4 py-3">
          <div className="font-bold text-base text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide">
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
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 font-mono text-sm lowercase transition ${
                    isActive
                      ? 'bg-[rgba(0,255,136,0.08)] text-accent ring-1 ring-[rgba(0,255,136,0.2)]'
                      : 'text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-[rgba(0,255,140,0.12)] p-2">
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
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      const currentIndex = visibleOuterNavItems.findIndex((item) => {
        if (item.path === '/crm') return location.pathname.startsWith('/crm')
        if (item.path === '/decks') return location.pathname.startsWith('/decks')
        if (item.path === '/issues') return location.pathname.startsWith('/issues')
        if (item.path === '/whatsapp/templates') return location.pathname.startsWith('/whatsapp')
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
              <Route path="/decks" element={<Decks />} />
              <Route path="/decks/:slug" element={<DeckViewer />} />
            </Routes>
          </div>
        </div>
      </div>
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
            item.path === '/crm' ? FolderKanban :
            item.path === '/whatsapp/templates' ? MessageCircleMore :
            LayoutTemplate,
        })),
    [canAccessWhatsApp],
  )
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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<GatedApp />} />
      </Routes>
    </AuthProvider>
  )
}
