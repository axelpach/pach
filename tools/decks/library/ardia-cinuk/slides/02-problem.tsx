import { Clock, UserX, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

function ProcessStep({ label, days, isManual }: { label: string; days: string; isManual?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${
      isManual ? 'border-orange-400/30 bg-orange-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'
    }`}>
      <div className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
        isManual ? 'bg-orange-400/20 text-orange-300' : 'bg-white/[0.06] text-white/40'
      }`}>
        {days}
      </div>
      <span className={`text-[13px] ${isManual ? 'text-orange-200' : 'text-white/50'}`}>{label}</span>
    </div>
  )
}

export function ProblemSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="40%" />

      <div className="relative z-10 px-20 pt-12 flex items-center justify-between">
        <img src={ardiaLogo} alt="Ardia" width={30} height={30} />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">El problema</span>
      </div>

      <div className="relative z-10 flex-1 flex px-20 pt-6 gap-14">
        {/* Left — headline + pain points */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-[42px] font-bold text-white tracking-tight leading-tight">
            Un proceso manual
            <br />
            <span style={{ color: theme.accent }}>que consume a tu equipo.</span>
          </h2>
          <p className="text-[17px] text-white/40 mt-4 leading-relaxed">
            Hoy, tu equipo ejecuta este proceso cada mes — manualmente, persona por persona.
          </p>

          <div className="mt-8 space-y-4">
            {[
              { icon: UserX, text: 'Una persona dedicada exclusivamente a perseguir pagos' },
              { icon: Clock, text: 'Proceso de 32+ días con seguimiento manual' },
              { icon: FileSpreadsheet, text: 'Facturación, cobro y recordatorios desconectados' },
              { icon: AlertTriangle, text: 'Sin visibilidad en tiempo real del estado de cobros' },
            ].map((pain, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <pain.icon className="w-4 h-4" style={{ color: `${theme.accent}cc` }} />
                </div>
                <span className="text-[16px] text-white/55 leading-snug">{pain.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — their flow */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <h3 className="text-[15px] font-semibold text-white/50 mb-4 uppercase tracking-wide">
              Flujo actual de cobranza CINUK
            </h3>
            <div className="space-y-2.5">
              <ProcessStep label="Facturación" days="Día 1-3" />
              <ProcessStep label="Relación de facturas" days="Día 4" />
              <ProcessStep label="Cobro y aplicación en sistema" days="Día 11" />
              <ProcessStep label="Revisión CXC" days="Día 12" />
              <ProcessStep label="Contacto con cliente" days="Día 12-14" isManual />
              <ProcessStep label="Recordatorio 1" days="Día 20" isManual />
              <ProcessStep label="Recordatorio 2" days="Día 25" isManual />
              <ProcessStep label="Recordatorio 3" days="Día 30" isManual />
              <ProcessStep label="Cobranza administrativa" days="Día 32" isManual />
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <p className="text-[12px] text-orange-300/50">
                En naranja: pasos manuales que Ardia automatiza
              </p>
            </div>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={2} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
