import { NavLink, Outlet } from 'react-router-dom'

export default function WhatsAppLayout() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-0 border-b border-[rgba(0,255,140,0.15)]">
        <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1.5">◊ whatsapp · outbound</div>
        <h1 className="font-mono text-2xl font-bold text-fg-1 lowercase">whatsapp</h1>
        <p className="text-sm text-fg-3 mt-0.5 mb-4">
          <span className="text-fg-4">›</span> plantillas · campañas · entregas
        </p>
        <div className="flex gap-0">
          <Tab to="/whatsapp/templates">plantillas</Tab>
          <Tab to="/whatsapp/campaigns">campañas</Tab>
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
        `px-4 py-2 text-xs font-mono uppercase tracking-label border-b-2 -mb-px transition-colors ${
          isActive
            ? 'text-accent border-accent [text-shadow:0_0_6px_rgba(0,255,136,0.4)]'
            : 'text-fg-3 border-transparent hover:text-fg-1'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
