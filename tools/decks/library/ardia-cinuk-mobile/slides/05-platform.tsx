import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Globe, Receipt, Building2, KeyRound, Calendar, BarChart3 } from 'lucide-react'

const features = [
  { icon: Receipt, color: '#a855f7', title: 'Facturación Electrónica', desc: 'CFDI automático integrado al flujo de cobro.' },
  { icon: Globe, color: '#3b82f6', title: 'Portal de Clientes', desc: 'Autoservicio 24/7 para consultar y pagar.' },
  { icon: Building2, color: '#10b981', title: 'Gestión de Rentas', desc: 'Contratos, plazos y condiciones centralizados.' },
  { icon: KeyRound, color: '#eab308', title: 'Ciclo de Unidades', desc: 'Disponibilidad, apartados y entregas.' },
  { icon: Calendar, color: '#f97316', title: 'Esquemas de Pago', desc: 'Planes de pago flexibles por contrato.' },
  { icon: BarChart3, color: '#06b6d4', title: 'Dashboard en Tiempo Real', desc: 'Visibilidad total de cobranza e ingresos.' },
]

export function PlatformSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="text-[14px] uppercase tracking-widest text-white/40 font-semibold">Plataforma</span>
        </div>

        {/* Heading */}
        <h1 className="text-[48px] font-bold tracking-tight leading-tight text-white m-0">
          Más allá de la cobranza:{'\n'}
          <span style={{ color: theme.accent }}>una plataforma completa.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[20px] text-white/60 leading-relaxed m-0">
          Ardia integra todas las herramientas que necesitas para administrar tus desarrollos y rentas en una sola plataforma.
        </p>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-3">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div
                key={i}
                className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col gap-2.5"
              >
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                  style={{
                    backgroundColor: `${feature.color}15`,
                    border: `1px solid ${feature.color}30`,
                  }}
                >
                  <Icon size={20} color={feature.color} />
                </div>
                <p className="text-[18px] font-bold text-white m-0">
                  {feature.title}
                </p>
                <p className="text-[14px] text-white/40 m-0 leading-snug">
                  {feature.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={5} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
