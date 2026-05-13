import { NavLink, Outlet } from 'react-router-dom'

export default function WhatsAppLayout() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 border-b border-white/[0.06]">
        <h1 className="text-2xl font-bold text-white">WhatsApp</h1>
        <div className="flex gap-1 mt-4">
          <Tab to="/whatsapp/templates">Plantillas</Tab>
          <Tab to="/whatsapp/campaigns">Campañas</Tab>
        </div>
      </div>
      <Outlet />
    </div>
  )
}

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={false}
      className={({ isActive }) =>
        `px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          isActive ? 'text-white border-white' : 'text-white/50 border-transparent hover:text-white/80'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
