import { PhoneOff, Search, AlertTriangle, MessageCircle } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'

function ArdiaLogo({ size = 36 }: { size?: number }) {
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

function WhatsAppMiniChat() {
  const messages = [
    { from: 'bot', text: 'Hola Ana. Tu pago de $45,000 por la unidad A-101 vence manana. Necesitas ayuda?' },
    { from: 'user', text: 'Ya lo transferi, te envio el comprobante' },
    { from: 'user', text: 'comprobante_pago.pdf', isFile: true },
    { from: 'bot', text: 'Pago recibido. Ve tu estado de cuenta en ardia.mx' },
  ]

  return (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[16px] leading-relaxed ${
              msg.from === 'user'
                ? 'bg-emerald-600/20 text-white rounded-br-sm'
                : 'bg-white/[0.06] text-white/70 rounded-bl-sm'
            }`}
          >
            {msg.text}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CoverSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="20%" />

      {/* Logo */}
      <div className="relative z-10 px-16 pt-14">
        <ArdiaLogo />
      </div>

      {/* Headline */}
      <div className="relative z-10 px-16 pt-10">
        <h1 className="text-white text-[56px] font-bold leading-[1.1] tracking-tight">
          Cientos de unidades
          <br />
          y tu equipo sigue
          <br />
          <span style={{ color: theme.accent }}>persiguiendo pagos a mano?</span>
        </h1>
        <p className="text-[22px] text-white/50 mt-6 leading-relaxed max-w-[85%]">
          Ardia automatiza la cobranza de tu desarrollo inmobiliario para que tu equipo se enfoque en vender.
        </p>
      </div>

      {/* Pain points */}
      <div className="relative z-10 px-16 pt-10 space-y-5">
        {[
          { icon: PhoneOff, text: 'Horas al telefono persiguiendo pagos atrasados' },
          { icon: Search, text: 'Comprobantes perdidos en chats de WhatsApp' },
          { icon: AlertTriangle, text: 'Sin visibilidad de quien pago y quien no' },
        ].map((pain, i) => (
          <div key={i} className="flex items-center gap-5">
            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
              <pain.icon className="w-5 h-5" style={{ color: `${theme.accent}cc` }} />
            </div>
            <span className="text-[22px] text-white/60 leading-snug">{pain.text}</span>
          </div>
        ))}
      </div>

      {/* WhatsApp preview */}
      <div className="relative z-10 mx-16 mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7">
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-[16px] font-semibold text-white">Cobranza automatizada por WhatsApp</div>
            <div className="text-[13px] text-white/40">Recordatorio + conciliacion en un clic</div>
          </div>
        </div>
        <WhatsAppMiniChat />
      </div>

      <SlideFooter theme={theme} pageNum={1} totalPages={3} label="ardia.mx" />
    </SlideWrapper>
  )
}
