import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ZeroProvider } from '@rocicorp/zero/react'
import { FolderKanban, LayoutTemplate, MessageCircleMore, Rows3 } from 'lucide-react'
import { useEffect, type ComponentType } from 'react'
import { schema } from './zero-schema'
import { mutators } from './mutators'
import { config } from './config'
import { AuthProvider, useAuth } from './lib/auth'
import Decks from './pages/Decks'
import DeckViewer from './pages/DeckViewer'
import CRM from './pages/crm/CRM'
import Issues from './pages/issues/Issues'
import Login from './pages/Login'
import WhatsAppLayout from './pages/whatsapp/WhatsAppLayout'
import WhatsAppTemplates from './pages/whatsapp/Templates'
import Campaigns from './pages/whatsapp/Campaigns'
import CampaignDetail from './pages/whatsapp/CampaignDetail'
import { GlyphRain, Scanlines, LiveClock } from './components/pach'

const OUTER_NAV_ITEMS = [
  { label: 'Issues', path: '/issues' },
  { label: 'CRM', path: '/crm' },
  { label: 'WhatsApp', path: '/whatsapp/templates' },
  { label: 'Decks', path: '/decks' },
] as const

/* ---------------- Topbar ---------------- */
function Topbar() {
  const { user, logout } = useAuth()
  return (
    <div
      className="flex items-center justify-between flex-shrink-0 px-5 py-2.5 border-b border-[rgba(0,255,140,0.15)] bg-void text-[10px] uppercase tracking-label text-fg-3 relative z-20"
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
  return (
    <nav className="w-[68px] flex-shrink-0 py-3 font-mono text-xs relative z-10 flex flex-col items-center bg-void border-r border-[rgba(0,255,140,0.12)]">
      <div className="flex flex-col items-center gap-2">
        <NavItem to="/issues" icon={Rows3} label="Issues" />
        <NavItem to="/crm" icon={FolderKanban} label="CRM" />
        <NavItem to="/whatsapp/templates" icon={MessageCircleMore} label="WhatsApp" />
        <NavItem to="/decks" icon={LayoutTemplate} label="Decks" />
      </div>

      <div className="mt-auto pt-4">
        <div className="rotate-180 [writing-mode:vertical-rl] text-[9px] uppercase tracking-[0.3em] text-fg-4">
          pach
        </div>
      </div>
    </nav>
  )
}

/* ---------------- Shell ---------------- */
function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()

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

      const currentIndex = OUTER_NAV_ITEMS.findIndex((item) => {
        if (item.path === '/crm') return location.pathname === '/' || location.pathname.startsWith('/crm')
        if (item.path === '/decks') return location.pathname.startsWith('/decks')
        if (item.path === '/issues') return location.pathname.startsWith('/issues')
        if (item.path === '/whatsapp/templates') return location.pathname.startsWith('/whatsapp')
        return false
      })

      if (currentIndex === -1) return

      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (currentIndex + direction + OUTER_NAV_ITEMS.length) % OUTER_NAV_ITEMS.length
      navigate(OUTER_NAV_ITEMS[nextIndex].path)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate])

  return (
    <div className="relative flex flex-col h-screen bg-pit text-fg-1 overflow-hidden">
      <GlyphRain density={20} opacity={0.06} />
      <Scanlines opacity={0.4} />
      <div className="relative z-10 flex flex-col h-full">
        <Topbar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Routes>
              <Route path="/" element={<CRM />} />
              <Route path="/crm/*" element={<CRM />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/whatsapp" element={<WhatsAppLayout />}>
                <Route index element={<WhatsAppTemplates />} />
                <Route path="templates" element={<WhatsAppTemplates />} />
                <Route path="campaigns" element={<Campaigns />} />
                <Route path="campaigns/:id" element={<CampaignDetail />} />
              </Route>
              <Route path="/decks" element={<Decks />} />
              <Route path="/decks/:slug" element={<DeckViewer />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
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

  if (location.pathname === '/login') return <Navigate to="/" replace />

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
