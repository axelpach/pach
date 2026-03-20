import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { MessageCircle, CreditCard, FileCheck, Receipt } from 'lucide-react'

const flowIcons = [
  { icon: MessageCircle, color: '#22c55e' },
  { icon: CreditCard, color: '#3b82f6' },
  { icon: FileCheck, color: '#a855f7' },
  { icon: Receipt, color: '#eab308' },
]

const messages = [
  { sender: 'bot', text: 'Hola Maria. Tu renta de Local B-205 por $18,500 vence el 1 de abril. Banco: BBVA, CLABE: 012180...' },
  { sender: 'bot', text: 'Checa tu estado de cuenta aquí: ardia.mx/portal' },
  { sender: 'user', text: 'Ya hice la transferencia, aquí va mi comprobante' },
  { sender: 'user', text: '📎 comprobante_abril.pdf' },
  { sender: 'bot', text: 'Recibido. Tu equipo CINUK verificará el pago en las próximas horas.' },
  { sender: 'bot', text: 'Pago confirmado. Tu CFDI se enviará a tu correo en los próximos minutos.' },
]

export function CobranzaDetailSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="text-[14px] uppercase tracking-widest text-white/40 font-semibold">Flujo Completo</span>
        </div>

        {/* Heading */}
        <h1 className="text-[52px] font-bold tracking-tight leading-tight text-white m-0">
          Del recordatorio al{'\n'}
          <span style={{ color: theme.accent }}>CFDI — en automático.</span>
        </h1>

        {/* Flow icons */}
        <div className="flex items-center justify-center gap-3">
          {flowIcons.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center"
                  style={{
                    backgroundColor: `${item.color}15`,
                    border: `1px solid ${item.color}30`,
                  }}
                >
                  <Icon size={24} color={item.color} />
                </div>
                {i < flowIcons.length - 1 && (
                  <span className="text-[20px] text-white/40">→</span>
                )}
              </div>
            )
          })}
        </div>

        {/* WhatsApp mockup */}
        <div className="rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/20 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle size={18} color="#22c55e" />
            <p className="text-[16px] font-semibold text-emerald-400 m-0">WhatsApp</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                  msg.sender === 'user'
                    ? 'self-end bg-emerald-600/20'
                    : 'self-start bg-white/[0.06]'
                }`}
              >
                <p className={`text-[15px] m-0 leading-snug ${
                  msg.sender === 'user' ? 'text-emerald-200' : 'text-white/60'
                }`}>
                  {msg.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
            <p className="text-[18px] font-semibold text-white mb-1.5 m-0">
              Verificación por tu equipo
            </p>
            <p className="text-[15px] text-white/40 m-0 leading-snug">
              Tu equipo confirma la transferencia en el banco y aprueba el pago en un click.
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
            <p className="text-[18px] font-semibold text-white mb-1.5 m-0">
              Cargos moratorios automáticos
            </p>
            <p className="text-[15px] text-white/40 m-0 leading-snug">
              Después del periodo de gracia, el sistema genera cargos por mora automáticamente.
            </p>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={4} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
