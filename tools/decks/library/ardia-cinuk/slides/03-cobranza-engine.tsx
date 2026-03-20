import { Bot, Mail } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

function AutomationStep({
  day,
  title,
  description,
  tone,
  accent,
}: {
  day: string
  title: string
  description: string
  tone: string
  accent: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-3 mb-1.5">
        <div
          className="text-[11px] font-bold px-2 py-0.5 rounded-lg text-white"
          style={{ backgroundColor: `${accent}30`, color: accent }}
        >
          {day}
        </div>
        <span className="text-[16px] font-semibold text-white">{title}</span>
      </div>
      <p className="text-[13px] text-white/40 leading-relaxed">{description}</p>
      <div className="mt-1.5">
        <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.04] text-white/30">Tono: {tone}</span>
      </div>
    </div>
  )
}

export function CobranzaEngineSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 px-20 pt-12 flex items-center justify-between">
        <img src={ardiaLogo} alt="Ardia" width={30} height={30} />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Motor de Cobranza</span>
      </div>

      <div className="relative z-10 flex-1 flex px-20 pt-4 gap-14">
        {/* Left — headline + channel info */}
        <div className="flex-[0.9] flex flex-col justify-center">
          <h2 className="text-[42px] font-bold text-white tracking-tight leading-tight">
            Cobranza automatizada
            <br />
            <span style={{ color: theme.accent }}>con escalamiento inteligente.</span>
          </h2>
          <p className="text-[17px] text-white/40 mt-4 leading-relaxed">
            Ardia ejecuta todo el flujo de cobranza por ti — desde el primer recordatorio hasta el
            escalamiento — sin intervención humana.
          </p>

          {/* Channels */}
          <div className="mt-8 space-y-3">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 flex items-start gap-3">
              <Bot className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[15px] font-semibold text-white">WhatsApp como canal principal</span>
                <p className="text-[13px] text-white/40 mt-0.5">
                  Cada recordatorio se envía por WhatsApp con los datos del pago y liga al portal del cliente.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.04] p-4 flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[15px] font-semibold text-white">Email como respaldo</span>
                <p className="text-[13px] text-white/40 mt-0.5">
                  Si WhatsApp no está disponible, se envía por email. En algunos casos se usan ambos canales para mayor cobertura.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — escalation timeline */}
        <div className="flex-1 flex flex-col justify-center space-y-3">
          <AutomationStep
            day="3 días antes"
            title="Recordatorio preventivo"
            description="Contacto y prevención. Se comunica la fecha y el concepto de pago."
            tone="Cordial y colaborativo"
            accent="#22c55e"
          />
          <AutomationStep
            day="Día de pago"
            title="Aviso de vencimiento"
            description="Se confirma que el pago vence hoy con monto y datos bancarios."
            tone="Firme y amable"
            accent="#3b82f6"
          />
          <AutomationStep
            day="Día 1-7"
            title="Seguimiento vencido"
            description="Se comunica antigüedad del adeudo y se solicita fecha concreta de pago."
            tone="Formal claro"
            accent="#f59e0b"
          />
          <AutomationStep
            day="Día 7-30"
            title="Escalamiento urgente"
            description="Último aviso antes de escalamiento administrativo. Impacto contractual."
            tone="Institucional"
            accent={theme.accent}
          />
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={3} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
