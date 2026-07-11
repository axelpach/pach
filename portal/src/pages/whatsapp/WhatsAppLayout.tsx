import { NavLink, Outlet } from 'react-router-dom'

export default function WhatsAppLayout({ basePath = '/marketing/whatsapp' }: { basePath?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-edge/15 px-5 pt-5 pb-0 md:px-8 md:pt-6">
        <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1.5">◊ whatsapp · outbound</div>
        <h1 className="font-mono text-2xl font-bold text-fg-1 lowercase">whatsapp</h1>
        <p className="text-sm text-fg-3 mt-0.5 mb-4">
          <span className="text-fg-4">›</span> plantillas · campañas · entregas
        </p>
        <div className="flex max-w-full gap-0 overflow-x-auto">
          <Tab to={`${basePath}/templates`}>plantillas</Tab>
          <Tab to={`${basePath}/campaigns`}>campañas</Tab>
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
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
            ? 'text-accent border-accent glow'
            : 'text-fg-3 border-transparent hover:text-fg-1'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
