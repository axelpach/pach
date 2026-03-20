import { MessageCircle, CreditCard, FileCheck, Receipt } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

function WhatsAppPreview() {
  const messages = [
    { from: 'bot', text: 'Hola Maria. Tu renta de Local B-205 por $18,500 vence el 1 de abril. Banco: BBVA, CLABE: 012180...' },
    { from: 'bot', text: 'Consulta tu estado de cuenta aqui: ardia.mx/portal', isLink: true },
    { from: 'user', text: 'Ya realicé la transferencia' },
    { from: 'user', text: 'comprobante_abril.pdf', isFile: true },
    { from: 'bot', text: 'Pago verificado por $18,500. Tu factura CFDI esta lista para descargar en tu portal.' },
  ]

  return (
    <div className="space-y-2">
      {messages.map((msg, i) => (
        <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed ${
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

export function CobranzaDetailSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="45%" />

      <div className="relative z-10 px-20 pt-12 flex items-center justify-between">
        <img src={ardiaLogo} alt="Ardia" width={30} height={30} />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Flujo Completo</span>
      </div>

      <div className="relative z-10 flex-1 flex px-20 pt-4 gap-14">
        {/* Left — flow + features */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-[42px] font-bold text-white tracking-tight leading-tight">
            Del recordatorio al
            <br />
            <span style={{ color: theme.accent }}>CFDI — en automático.</span>
          </h2>

          {/* Flow steps */}
          <div className="mt-8 flex items-center gap-3">
            {[
              { icon: MessageCircle, label: 'Recordatorio\nWhatsApp', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
              { icon: CreditCard, label: 'Cliente sube\ncomprobante', color: 'text-blue-400', bg: 'bg-blue-400/10' },
              { icon: FileCheck, label: 'Tu equipo\nverifica', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
              { icon: Receipt, label: 'CFDI\nautomático', color: 'text-purple-400', bg: 'bg-purple-400/10' },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex flex-col items-center text-center">
                  <div className={`w-11 h-11 rounded-xl ${step.bg} flex items-center justify-center mb-1.5`}>
                    <step.icon className={`w-5 h-5 ${step.color}`} />
                  </div>
                  <span className="text-[11px] text-white/40 leading-snug whitespace-pre-line">{step.label}</span>
                </div>
                {i < 3 && <div className="text-white/15 text-[18px] mb-4">→</div>}
              </div>
            ))}
          </div>

          {/* Feature cards */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="text-[14px] font-semibold text-white">Verificación por tu equipo</span>
              <p className="text-[12px] text-white/35 mt-1">Tu equipo confirma que la transferencia se refleja en el banco y aprueba el pago en un clic.</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="text-[14px] font-semibold text-white">Cargos moratorios automáticos</span>
              <p className="text-[12px] text-white/35 mt-1">Después del periodo de gracia, el sistema genera los intereses moratorios sin intervención manual.</p>
            </div>
          </div>
        </div>

        {/* Right — WhatsApp mockup */}
        <div className="flex-[0.85] flex flex-col justify-center">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-white">Ejemplo: Cobro de renta</div>
                <div className="text-[11px] text-white/35">Con datos bancarios + facturación</div>
              </div>
            </div>
            <WhatsAppPreview />
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={4} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
