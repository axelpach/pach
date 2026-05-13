import { Routes, Route, NavLink } from 'react-router-dom'
import { Presentation, Users, MessageSquare } from 'lucide-react'
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

function Sidebar() {
  return (
    <div className="w-56 bg-[#0A0A0D] border-r border-white/[0.06] flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white tracking-wide">Pachi</h1>
        <p className="text-[11px] text-white/30 mt-0.5">the machine that builds the machine</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavLink
          to="/crm"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
            }`
          }
        >
          <Users className="w-4 h-4" />
          CRM
        </NavLink>
        <NavLink
          to="/whatsapp/templates"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
            }`
          }
        >
          <MessageSquare className="w-4 h-4" />
          WhatsApp
        </NavLink>
        <NavLink
          to="/decks"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
            }`
          }
        >
          <Presentation className="w-4 h-4" />
          Decks
        </NavLink>
      </nav>
    </div>
  )
}

function AppShell() {
  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden">
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
  )
}

export default function App() {
  return (
    <ZeroProvider
      userID="pachi-user"
      server={config.zeroServerUrl}
      schema={schema}
      mutators={mutators}
      mutateURL={`${config.apiUrl}/zero/push`}
    >
      <AppShell />
    </ZeroProvider>
  )
}
