import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Bot, Mail } from 'lucide-react'

const automationSteps = [
  { timing: '3 días antes', color: '#22c55e', title: 'Recordatorio preventivo', desc: 'Mensaje amable antes del vencimiento con datos de pago.', tone: 'Cordial y colaborativo' },
  { timing: 'Día de pago', color: '#3b82f6', title: 'Aviso de vencimiento', desc: 'Notificación el día exacto del vencimiento.', tone: 'Firme y amable' },
  { timing: 'Día 1-7', color: '#eab308', title: 'Seguimiento vencido', desc: 'Recordatorios diarios con datos de pago.', tone: 'Formal claro' },
  { timing: 'Día 7-30', color: '#ef4444', title: 'Escalamiento urgente', desc: 'Escalamiento con copia a tu equipo.', tone: 'Institucional' },
]

export function CobranzaEngineSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="text-[14px] uppercase tracking-widest text-white/40 font-semibold">Motor de Cobranza</span>
        </div>

        {/* Heading */}
        <h1 className="text-[52px] font-bold tracking-tight leading-tight text-white m-0">
          Cobranza automatizada{'\n'}
          <span style={{ color: theme.accent }}>con escalamiento inteligente.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[20px] text-white/60 leading-relaxed m-0">
          Ardia ejecuta todo el flujo de cobranza de forma autónoma, escalando el tono según los días de vencimiento.
        </p>

        {/* Automation steps */}
        <div className="flex flex-col gap-3">
          {automationSteps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex items-center gap-4"
            >
              <div
                className="rounded-lg px-3 py-1.5 shrink-0"
                style={{
                  backgroundColor: `${step.color}20`,
                  border: `1px solid ${step.color}40`,
                }}
              >
                <p className="text-[14px] font-bold m-0 whitespace-nowrap" style={{ color: step.color }}>
                  {step.timing}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-[20px] font-semibold text-white m-0">{step.title}</p>
                <p className="text-[14px] text-white/40 mt-1 m-0">{step.desc}</p>
                <p className="text-[14px] text-white/40 mt-0.5 m-0">Tono: {step.tone}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Channel cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-400/[0.04] border border-emerald-400/20 p-4">
            <Bot size={24} color="#22c55e" />
            <p className="text-[18px] font-semibold text-white mt-2.5 mb-1 m-0">
              WhatsApp como canal principal
            </p>
            <p className="text-[14px] text-white/40 m-0">
              Recordatorios directos por WhatsApp con datos de pago incluidos.
            </p>
          </div>
          <div className="rounded-xl bg-blue-400/[0.04] border border-blue-400/20 p-4">
            <Mail size={24} color="#3b82f6" />
            <p className="text-[18px] font-semibold text-white mt-2.5 mb-1 m-0">
              Email como respaldo
            </p>
            <p className="text-[14px] text-white/40 m-0">
              Canal de respaldo automático. En algunos casos se usan ambos canales.
            </p>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={3} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
