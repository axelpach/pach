import { Routes, Route, NavLink } from 'react-router-dom'
import { ZeroProvider } from '@rocicorp/zero/react'
import { schema } from './zero-schema'
import { mutators } from './mutators'
import { config } from './config'
import Decks from './pages/Decks'
import DeckViewer from './pages/DeckViewer'
import CRM from './pages/crm/CRM'
import WhatsAppLayout from './pages/whatsapp/WhatsAppLayout'
import WhatsAppTemplates from './pages/whatsapp/Templates'
import Campaigns from './pages/whatsapp/Campaigns'
import CampaignDetail from './pages/whatsapp/CampaignDetail'
import { GlyphRain, Scanlines, LiveClock } from './components/pach'

/* ---------------- Topbar ---------------- */
function Topbar() {
  return (
    <div
      className="flex items-center justify-between flex-shrink-0 px-5 py-2.5 border-b border-[rgba(0,255,140,0.15)] bg-void text-[10px] uppercase tracking-label text-fg-3 relative z-20"
    >
      <span className="flex items-center gap-3.5">
        <span className="text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide-2">P@CH</span>
        <span>// operator terminal</span>
        <span>· op: <span className="text-fg-1">a.pach</span></span>
      </span>
      <span className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="text-ok">●</span> session secure
        </span>
        <span className="hidden md:inline">uplink 14.3kb/s</span>
        <span className="hidden md:inline"><LiveClock /></span>
      </span>
    </div>
  )
}

/* ---------------- Sidebar ---------------- */
function NavItem({ to, glyph, label }: { to: string; glyph: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-2 px-4 py-1.5 text-sm font-mono transition-colors border-l-2 ${
          isActive
            ? 'border-accent text-accent bg-[rgba(0,255,136,0.03)]'
            : 'border-transparent text-fg-2 hover:text-fg-1 hover:bg-[rgba(0,255,136,0.03)]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-accent' : 'text-fg-4'}>{glyph}</span>
          <span className="flex-1 truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

function Section({ label }: { label: string }) {
  return (
    <div className="px-4 pt-3.5 pb-1.5 text-[9px] uppercase tracking-wide-2 text-fg-4">
      {label}
    </div>
  )
}

function Sidebar() {
  return (
    <nav className="w-[220px] flex-shrink-0 bg-void border-r border-[rgba(0,255,140,0.15)] py-4 font-mono text-xs relative z-10 overflow-y-auto flex flex-col">
      <div className="px-4 pb-3 mb-2">
        <div className="font-bold text-base text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide">
          p@ch_
        </div>
        <div className="text-[9px] uppercase tracking-label text-fg-4 mt-1">
          // machine that builds the machine
        </div>
      </div>

      <Section label="data" />
      <NavItem to="/crm" glyph="◊" label="crm · leads" />
      <NavItem to="/whatsapp/templates" glyph="◊" label="whatsapp" />
      <NavItem to="/decks" glyph="◊" label="decks" />

      <div className="mt-auto px-4 pt-3 text-[9px] uppercase tracking-label text-fg-4 leading-relaxed">
        // build #14a3f7<br />
        // v0.1.alpha
      </div>
    </nav>
  )
}

/* ---------------- Shell ---------------- */
function AppShell() {
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

export default function App() {
  return (
    <ZeroProvider
      userID="pach-user"
      server={config.zeroServerUrl}
      schema={schema}
      mutators={mutators}
      mutateURL={`${config.apiUrl}/zero/push`}
    >
      <AppShell />
    </ZeroProvider>
  )
}
