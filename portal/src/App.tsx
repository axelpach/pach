import { Routes, Route, NavLink } from 'react-router-dom'
import { Presentation, LayoutDashboard } from 'lucide-react'
import Decks from './pages/Decks'
import DeckViewer from './pages/DeckViewer'

function Sidebar() {
  return (
    <div className="w-56 bg-[#0A0A0D] border-r border-white/[0.06] flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white tracking-wide">Pachi</h1>
        <p className="text-[11px] text-white/30 mt-0.5">the machine that builds the machine</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
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

function Dashboard() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to Pachi</h2>
        <p className="text-white/40 text-sm">Select a tool from the sidebar to get started.</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="flex min-h-screen bg-[#050505] text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/decks/:slug" element={<DeckViewer />} />
        </Routes>
      </div>
    </div>
  )
}
