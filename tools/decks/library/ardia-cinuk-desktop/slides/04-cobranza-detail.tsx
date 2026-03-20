import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { MessageCircle, CreditCard, FileCheck, Receipt } from 'lucide-react'

const flowSteps = [
  { icon: <MessageCircle size={26} className="text-emerald-400" />, bg: 'bg-emerald-400/10', label: 'Recordatorio' },
  { icon: <CreditCard size={26} className="text-blue-400" />, bg: 'bg-blue-400/10', label: 'Pago' },
  { icon: <FileCheck size={26} className="text-yellow-400" />, bg: 'bg-yellow-400/10', label: 'Verificación' },
  { icon: <Receipt size={26} className="text-purple-400" />, bg: 'bg-purple-400/10', label: 'CFDI' },
]

const chatMessages = [
  { sender: 'bot', text: 'Hola Ana, te recordamos que tu pago de $45,200 MXN por la Unidad 12-B vence el 15 de marzo.' },
  { sender: 'bot', text: 'Checa tu estado de cuenta aquí: ardia.mx/portal' },
  { sender: 'user', text: 'Ya hice la transferencia, aquí va mi comprobante' },
  { sender: 'user', text: '📎 comprobante_marzo.pdf' },
  { sender: 'bot', text: 'Recibido. Tu equipo CINUK verificará el pago en las próximas horas.' },
  { sender: 'bot', text: 'Pago confirmado. Tu CFDI se enviará a tu correo en los próximos minutos.' },
]

export function CobranzaDetailSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <span className="text-[15px] uppercase tracking-widest text-white/40 ml-2">FLUJO COMPLETO</span>
      </div>

      {/* Two columns */}
      <div className="relative z-10 flex-1 flex px-20 gap-16 pt-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className={`text-[60px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
            Del recordatorio al{'\n'}
            <span style={{ color: theme.accent }}>CFDI — en automático.</span>
          </h2>

          {/* Flow icons row */}
          <div className="flex items-center gap-3 mt-10">
            {flowSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-14 h-14 rounded-xl ${step.bg} border border-white/[0.08] flex items-center justify-center`}>
                    {step.icon}
                  </div>
                  <span className="text-[15px] text-white/40">{step.label}</span>
                </div>
                {i < flowSteps.length - 1 && (
                  <span className="text-[24px] text-white/20 mb-6">→</span>
                )}
              </div>
            ))}
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-4 mt-10">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
              <div className={`text-[20px] font-semibold ${theme.textPrimary}`}>Verificación por tu equipo</div>
              <div className="text-[16px] text-white/40 mt-2">
                Tu equipo confirma la transferencia en el banco antes de registrar el pago.
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
              <div className={`text-[20px] font-semibold ${theme.textPrimary}`}>Cargos moratorios automáticos</div>
              <div className="text-[16px] text-white/40 mt-2">
                Se aplican automáticamente después del periodo de gracia configurado.
              </div>
            </div>
          </div>
        </div>

        {/* Right column — WhatsApp mockup */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
            {/* Chat header */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                <MessageCircle size={20} className="text-white" />
              </div>
              <div>
                <div className={`text-[20px] font-semibold ${theme.textPrimary}`}>Ardia · Cobranza</div>
                <div className="text-[15px] text-white/40">WhatsApp Business</div>
              </div>
            </div>

            {/* Chat bubbles */}
            <div className="space-y-3">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-5 py-3 max-w-[90%] ${
                    msg.sender === 'bot'
                      ? 'bg-white/[0.06]'
                      : 'bg-emerald-600/20 ml-auto'
                  }`}
                >
                  <span className={`text-[17px] leading-relaxed ${theme.textPrimary}`}>{msg.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={4} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
