import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Clock, UserX, AlertTriangle, FileSpreadsheet } from 'lucide-react'

const processSteps = [
  { label: 'Facturación', day: '1-3', manual: true },
  { label: 'Relación de facturas', day: '4', manual: false },
  { label: 'Cobro y aplicación en sistema', day: '11', manual: true },
  { label: 'Contacto con cliente', day: '12-14', manual: true },
  { label: 'Recordatorio 1 — cordial', day: '20', manual: true },
  { label: 'Recordatorio 2 — firme', day: '25', manual: true },
  { label: 'Recordatorio 3 — urgente', day: '30', manual: true },
  { label: 'Cobranza administrativa', day: '32', manual: true },
  { label: 'Cobranza externa', day: '32+', manual: false },
]

const painPoints = [
  { icon: UserX, text: 'Una persona dedicada exclusivamente a perseguir pagos' },
  { icon: Clock, text: 'Proceso de 32+ días con seguimiento manual' },
  { icon: FileSpreadsheet, text: 'Facturación, cobro y recordatorios desconectados' },
  { icon: AlertTriangle, text: 'Sin visibilidad en tiempo real del estado de cobros' },
]

export function ProblemSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="text-[14px] uppercase tracking-widest text-white/40 font-semibold">El Problema</span>
        </div>

        {/* Heading */}
        <h1 className="text-[52px] font-bold tracking-tight leading-tight text-white m-0">
          Un proceso manual{'\n'}
          <span style={{ color: theme.accent }}>que consume a tu equipo.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[20px] text-white/60 leading-relaxed m-0">
          El ciclo de cobranza actual de CINUK depende de seguimiento humano en cada paso, con múltiples puntos de falla.
        </p>

        {/* Process flow card */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6">
          <p className="text-[18px] font-semibold text-white mb-4 m-0">
            Flujo actual de cobranza CINUK
          </p>
          <div className="grid grid-cols-2 gap-2">
            {processSteps.map((step, i) => (
              <div
                key={i}
                className={`rounded-lg py-2.5 px-3 ${
                  i === 8 ? 'col-span-2' : ''
                } ${
                  step.manual
                    ? 'bg-orange-400/[0.06] border border-orange-400/30'
                    : 'bg-white/[0.02] border border-white/[0.06]'
                }`}
              >
                <p className={`text-[14px] font-semibold m-0 ${step.manual ? 'text-orange-400' : 'text-white'}`}>
                  {step.label}
                </p>
                <p className={`text-[13px] mt-0.5 m-0 ${step.manual ? 'text-orange-400/70' : 'text-white/40'}`}>
                  Día {step.day}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[14px] text-orange-400 mt-3 m-0 italic">
            En naranja: pasos que Ardia automatiza
          </p>
        </div>

        {/* Pain points */}
        <div className="flex flex-col gap-2.5">
          {painPoints.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="flex items-center gap-3.5">
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${theme.accent}1a`,
                    border: `1px solid ${theme.accent}33`,
                  }}
                >
                  <Icon size={20} color={theme.accent} />
                </div>
                <p className="text-[18px] text-white/60 m-0">{item.text}</p>
              </div>
            )
          })}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={2} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
