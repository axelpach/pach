import {
  Globe,
  MessageCircle,
  LayoutDashboard,
  Send,
  Timer,
  MousePointerClick,
  Calendar,
  History,
  CheckCircle2,
  Building2,
  Clock,
} from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'

function ArdiaLogo({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-lg bg-[#F13D43] flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        A
      </div>
      <span className="font-bold tracking-[0.2em] text-white" style={{ fontSize: size * 0.5 }}>
        ARDIA
      </span>
    </div>
  )
}

function BuyerPortalMockup() {
  const payments = [
    { concept: 'Apartado', date: '15 ene 2026', amount: '$35,000', status: 'paid' as const },
    { concept: 'Anticipo', date: '1 feb 2026', amount: '$250,000', status: 'paid' as const },
    { concept: 'Mensualidad #1', date: '1 mar 2026', amount: '$45,000', status: 'current' as const },
    { concept: 'Mensualidad #2', date: '1 abr 2026', amount: '$45,000', status: 'upcoming' as const },
  ]

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#141417] overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#F13D43]/15 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-[#F13D43]" />
          </div>
          <div>
            <div className="text-[12px] text-white/40">Desarrollos Alamos</div>
            <div className="text-[15px] font-semibold text-white">Torre Alamos — A-101</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Pagado', value: '$285,000', sub: '12%', color: 'text-emerald-400' },
            { label: 'Pendiente', value: '$2.1M', sub: '88%', color: 'text-white/30' },
            { label: 'Proximo', value: '$45,000', sub: '1 mar', color: 'text-white/30' },
          ].map((card, i) => (
            <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-center">
              <div className="text-[10px] text-white/35 mb-0.5">{card.label}</div>
              <div className="text-[15px] font-bold text-white">{card.value}</div>
              <div className={`text-[10px] ${card.color} mt-0.5`}>{card.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 pb-4">
        {payments.map((p, i) => (
          <div key={i} className="flex items-center py-3 border-b border-white/[0.04] last:border-b-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-3">
              {p.status === 'paid' ? (
                <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-white/25" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <span className="text-[13px] font-semibold text-white">{p.concept}</span>
              <div className="text-[11px] text-white/30">{p.date}</div>
            </div>
            <span className="text-[14px] font-semibold text-white">{p.amount}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureBlock({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  children,
}: {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
          </div>
          <h3 className="text-[20px] font-bold text-white">{title}</h3>
        </div>
        <p className="text-[15px] text-white/50 leading-relaxed">{description}</p>
      </div>
      {children && <div className="px-6 pb-6">{children}</div>}
    </div>
  )
}

export function FeaturesSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="50%" />

      <div className="relative z-10 px-16 pt-14 flex items-center justify-between">
        <ArdiaLogo />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Funcionalidades</span>
      </div>

      <div className="relative z-10 px-16 pt-8">
        <h2 className="text-[40px] font-bold text-white tracking-tight leading-tight">
          Todo lo que necesitas para
          <br />
          <span style={{ color: theme.accent }}>cobrar sin perseguir.</span>
        </h2>
      </div>

      {/* Feature 1: Buyer Portal */}
      <div className="relative z-10 px-16 pt-8">
        <FeatureBlock
          icon={Globe}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
          title="Portal de Clientes 24/7"
          description="Tus compradores ven su calendario de pagos, historial y estatus en tiempo real."
        >
          <BuyerPortalMockup />
        </FeatureBlock>
      </div>

      {/* Feature 2 & 3 */}
      <div className="relative z-10 px-16 pt-6 grid grid-cols-2 gap-5">
        <FeatureBlock
          icon={MessageCircle}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-400/10"
          title="Cobranza WhatsApp"
          description="Recordatorios automaticos. Conciliacion en un clic."
        >
          <div className="flex flex-col gap-2">
            {[
              { icon: Send, text: 'Recordatorio antes del vencimiento' },
              { icon: Timer, text: 'Seguimiento automatico' },
              { icon: MousePointerClick, text: 'Conciliacion en un clic' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <item.icon className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
                <span className="text-[13px] text-white/40">{item.text}</span>
              </div>
            ))}
          </div>
        </FeatureBlock>

        <FeatureBlock
          icon={LayoutDashboard}
          iconColor="text-yellow-400"
          iconBg="bg-yellow-400/10"
          title="Gestion de Unidades"
          description="Ciclo de vida completo de cada unidad."
        >
          <div className="flex flex-col gap-2">
            {[
              { icon: Calendar, text: 'Esquemas de pago flexibles' },
              { icon: History, text: 'Historial por unidad' },
              { icon: CheckCircle2, text: 'Cotizador integrado' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <item.icon className="w-3.5 h-3.5 text-yellow-400/60 shrink-0" />
                <span className="text-[13px] text-white/40">{item.text}</span>
              </div>
            ))}
          </div>
        </FeatureBlock>
      </div>

      <SlideFooter theme={theme} pageNum={2} totalPages={3} label="ardia.mx" />
    </SlideWrapper>
  )
}
