import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Zap, TrendingUp, Users, CheckCircle2 } from 'lucide-react'

const metrics = [
  {
    icon: <Zap size={22} className="text-yellow-400" />,
    bg: 'bg-yellow-400/10 border border-yellow-400/20',
    value: '~80%',
    label: 'reducción esperada en tiempo de seguimiento',
  },
  {
    icon: <TrendingUp size={22} className="text-emerald-400" />,
    bg: 'bg-emerald-400/10 border border-emerald-400/20',
    value: '~2×',
    label: 'mejora esperada en cobro puntual',
  },
  {
    icon: <Users size={22} className="text-blue-400" />,
    bg: 'bg-blue-400/10 border border-blue-400/20',
    value: '24/7',
    label: 'cobranza activa sin intervención',
  },
]

const checklistItems = [
  'Configuración de proyectos y unidades',
  'Carga de compradores y esquemas de pago',
  'Activación del motor de cobranza',
  'Integración de facturación CFDI',
  'Capacitación a tu equipo',
  'Soporte dedicado durante el piloto',
]

export function ResultsSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <span className="text-[15px] uppercase tracking-widest text-white/40 ml-2">RESULTADOS</span>
      </div>

      {/* Two columns */}
      <div className="relative z-10 flex-1 flex px-20 gap-16 pt-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className={`text-[60px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
            Lo que puedes esperar{'\n'}
            <span style={{ color: theme.accent }}>desde el primer mes.</span>
          </h2>
          <p className="text-[24px] text-white/50 leading-relaxed mt-6 max-w-[95%]">
            Resultados esperados al automatizar el ciclo completo de cobranza.
          </p>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-4 mt-10">
            {metrics.map((m, i) => (
              <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 text-center">
                <div className={`w-11 h-11 rounded-xl ${m.bg} flex items-center justify-center mx-auto mb-3`}>
                  {m.icon}
                </div>
                <div className={`text-[48px] font-bold ${theme.textPrimary}`}>{m.value}</div>
                <div className="text-[20px] text-white/50 mt-1">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column — implementation card */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-8">
            <h3 className={`text-[26px] font-semibold mb-6 ${theme.textPrimary}`}>
              Implementación en menos de una semana
            </h3>
            <div className="space-y-4">
              {checklistItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
                  <span className={`text-[20px] ${theme.textPrimary}`}>{item}</span>
                </div>
              ))}
            </div>
            <p className="text-[15px] text-white/30 mt-8 border-t border-white/[0.06] pt-4">
              * 1 semana de configuración a partir de que Universo aBanza envíe sus datos
            </p>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={6} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
