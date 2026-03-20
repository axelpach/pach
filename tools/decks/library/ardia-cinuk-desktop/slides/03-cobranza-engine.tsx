import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Bot, Mail } from 'lucide-react'

const escalationSteps = [
  {
    badge: '3 días antes',
    badgeColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-400/10 border border-emerald-400/20',
    title: 'Recordatorio preventivo',
    description: 'Mensaje amigable por WhatsApp con monto, fecha y liga de pago.',
    tone: 'Tono: amigable',
  },
  {
    badge: 'Día de pago',
    badgeColor: 'text-blue-400',
    badgeBg: 'bg-blue-400/10 border border-blue-400/20',
    title: 'Aviso de vencimiento',
    description: 'Notificación el día del vencimiento con instrucciones claras de pago.',
    tone: 'Tono: informativo',
  },
  {
    badge: 'Día 1-7',
    badgeColor: 'text-yellow-400',
    badgeBg: 'bg-yellow-400/10 border border-yellow-400/20',
    title: 'Seguimiento vencido',
    description: 'Recordatorios periódicos con mención de cargos moratorios próximos.',
    tone: 'Tono: firme',
  },
  {
    badge: 'Día 7-30',
    badgeColor: 'text-red-400',
    badgeBg: 'bg-red-400/10 border border-red-400/20',
    title: 'Escalamiento urgente',
    description: 'Alertas con cargo moratorio aplicado. Escalamiento a tu equipo si no hay respuesta.',
    tone: 'Tono: urgente',
  },
]

export function CobranzaEngineSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <span className="text-[15px] uppercase tracking-widest text-white/40 ml-2">MOTOR DE COBRANZA</span>
      </div>

      {/* Two columns */}
      <div className="relative z-10 flex-1 flex px-20 gap-16 pt-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className={`text-[60px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
            Cobranza automatizada{'\n'}
            <span style={{ color: theme.accent }}>con escalamiento inteligente.</span>
          </h2>
          <p className="text-[26px] text-white/50 leading-relaxed mt-6 max-w-[95%]">
            Cada mensaje se envía en el momento justo, con el tono correcto y por el canal adecuado.
          </p>

          <div className="mt-10 space-y-5">
            {/* WhatsApp channel card */}
            <div className="rounded-xl bg-emerald-400/[0.04] border border-emerald-400/20 p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
                <Bot size={22} className="text-emerald-400" />
              </div>
              <div>
                <div className={`text-[22px] font-semibold ${theme.textPrimary}`}>WhatsApp como canal principal</div>
                <div className="text-[18px] text-white/40 mt-1">
                  Recordatorios automatizados con links de pago directo. Tasa de apertura +95%.
                </div>
              </div>
            </div>

            {/* Email channel card */}
            <div className="rounded-xl bg-blue-400/[0.04] border border-blue-400/20 p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-400/10 border border-blue-400/20 flex items-center justify-center shrink-0">
                <Mail size={22} className="text-blue-400" />
              </div>
              <div>
                <div className={`text-[22px] font-semibold ${theme.textPrimary}`}>Email como respaldo</div>
                <div className="text-[18px] text-white/40 mt-1">
                  Respaldo automático por correo. Ambos canales se coordinan para máxima efectividad.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — escalation steps */}
        <div className="flex-1 flex flex-col justify-center gap-4">
          {escalationSteps.map((step, i) => (
            <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-[15px] font-semibold px-3 py-1 rounded-full ${step.badgeBg} ${step.badgeColor}`}>
                  {step.badge}
                </span>
              </div>
              <div className={`text-[22px] font-semibold ${theme.textPrimary}`}>{step.title}</div>
              <div className="text-[16px] text-white/40 mt-1">{step.description}</div>
              <div className="text-[15px] text-white/30 mt-2 italic">{step.tone}</div>
            </div>
          ))}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={3} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
