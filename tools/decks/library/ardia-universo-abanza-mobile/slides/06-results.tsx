import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Zap, TrendingUp, Users, CheckCircle2 } from 'lucide-react'

const metrics = [
  { icon: Zap, color: '#eab308', value: '~80%', label: 'Reducción esperada en seguimiento' },
  { icon: TrendingUp, color: '#10b981', value: '~2×', label: 'Mejora esperada en cobro puntual' },
  { icon: Users, color: '#3b82f6', value: '24/7', label: 'Cobranza activa sin intervención' },
]

const checklist = [
  'Configuración de desarrollo y unidades',
  'Alta de arrendatarios y contratos',
  'Conexión con facturación (CFDI)',
  'Configuración del motor de cobranza',
  'Personalización de mensajes WhatsApp',
  'Capacitación de tu equipo',
]

export function ResultsSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="text-[14px] uppercase tracking-widest text-white/40 font-semibold">Resultados</span>
        </div>

        {/* Heading */}
        <h1 className="text-[52px] font-bold tracking-tight leading-tight text-white m-0">
          Lo que puedes esperar{'\n'}
          <span style={{ color: theme.accent }}>desde el primer mes.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[20px] text-white/60 leading-relaxed m-0">
          Resultados esperados al automatizar el ciclo completo de cobranza.
        </p>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((metric, i) => {
            const Icon = metric.icon
            return (
              <div
                key={i}
                className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 text-center flex flex-col items-center gap-2"
              >
                <Icon size={24} color={metric.color} />
                <p className="text-[36px] font-extrabold text-white m-0">{metric.value}</p>
                <p className="text-[14px] text-white/40 m-0 leading-tight">{metric.label}</p>
              </div>
            )
          })}
        </div>

        {/* Implementation card */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6">
          <p className="text-[20px] font-bold text-white mb-4 m-0">
            Implementación en menos de una semana
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 size={18} color="#22c55e" className="mt-0.5 shrink-0" />
                <p className="text-[15px] text-white/60 m-0 leading-snug">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[12px] text-white/30 m-0 italic">
          * 1 semana de configuración a partir de que Universo aBanza envíe sus datos (inventario, contratos, arrendatarios).
        </p>
      </div>

      <SlideFooter theme={theme} pageNum={6} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
