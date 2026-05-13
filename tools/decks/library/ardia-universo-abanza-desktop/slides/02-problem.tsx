import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Clock, UserX, AlertTriangle, FileSpreadsheet } from 'lucide-react'

const painPoints = [
  { icon: <Clock size={22} color="#F13D43" />, text: 'Horas perdidas en seguimiento manual de pagos' },
  { icon: <UserX size={22} color="#F13D43" />, text: 'Compradores que se atrasan sin recibir aviso' },
  { icon: <AlertTriangle size={22} color="#F13D43" />, text: 'Riesgo de errores en cálculos moratorios' },
  { icon: <FileSpreadsheet size={22} color="#F13D43" />, text: 'Excel y WhatsApp personal como herramientas principales' },
]

const processSteps = [
  { day: 'Día 1-3', label: 'Facturación', manual: true },
  { day: 'Día 4', label: 'Relación de facturas', manual: false },
  { day: 'Día 11', label: 'Cobro y aplicación en sistema', manual: true },
  { day: 'Día 12-14', label: 'Contacto con cliente', manual: true },
  { day: 'Día 20', label: 'Recordatorio 1 — cordial', manual: true },
  { day: 'Día 25', label: 'Recordatorio 2 — firme', manual: true },
  { day: 'Día 30', label: 'Recordatorio 3 — urgente', manual: true },
  { day: 'Día 32', label: 'Cobranza administrativa', manual: true },
  { day: 'Día 32+', label: 'Cobranza externa', manual: false },
]

export function ProblemSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <span className="text-[15px] uppercase tracking-widest text-white/40 ml-2">EL PROBLEMA</span>
      </div>

      {/* Two columns */}
      <div className="relative z-10 flex-1 flex px-20 gap-16 pt-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className={`text-[60px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
            Un proceso manual{'\n'}
            <span style={{ color: theme.accent }}>que consume a tu equipo.</span>
          </h2>
          <p className="text-[26px] text-white/50 leading-relaxed mt-6 max-w-[95%]">
            Los equipos de cobranza pierden horas enviando recordatorios, calculando intereses y persiguiendo pagos vencidos.
          </p>

          <div className="mt-10 space-y-4">
            {painPoints.map((pp, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#F13D43]/10 border border-[#F13D43]/20 flex items-center justify-center shrink-0">
                  {pp.icon}
                </div>
                <span className={`text-[22px] ${theme.textPrimary}`}>{pp.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column — process steps */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-8">
            <h3 className={`text-[24px] font-semibold mb-6 ${theme.textPrimary}`}>
              Flujo actual de cobranza
            </h3>
            <div className="space-y-3">
              {processSteps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-4 rounded-lg px-4 py-3 ${
                    step.manual
                      ? 'border border-orange-400/30 bg-orange-400/[0.06]'
                      : 'border border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  <span className={`text-[15px] font-mono font-semibold shrink-0 w-[72px] ${
                    step.manual ? 'text-orange-400' : 'text-white/50'
                  }`}>
                    {step.day}
                  </span>
                  <span className={`text-[18px] ${theme.textPrimary}`}>{step.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[15px] text-orange-400/60 mt-5">
              En naranja: pasos que Ardia automatiza
            </p>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={2} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
