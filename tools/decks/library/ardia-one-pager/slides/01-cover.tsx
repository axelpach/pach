import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso-light.png'

const QM = {
  bg: '#14110f',
  fg: '#ede6db',
  fg2: 'rgba(237, 230, 219, 0.78)',
  fgDim: 'rgba(237, 230, 219, 0.42)',
  fgFaint: 'rgba(237, 230, 219, 0.22)',
  accent: '#E43F3F',
  hair: 'rgba(237, 230, 219, 0.10)',
  hair2: 'rgba(237, 230, 219, 0.06)',
}

const sans = "'Inter Tight', 'Inter', system-ui, sans-serif"
const serif = "'Instrument Serif', Georgia, serif"

function Brand({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src={ardiaLogo} alt="Ardia" style={{ width: size, height: size, objectFit: 'contain' }} />
      <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: size, letterSpacing: '-0.01em', color: QM.fg, lineHeight: 1 }}>
        Ardia
      </span>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 6, height: 6, background: QM.accent, display: 'inline-block' }} />
      <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
        {children}
      </span>
    </div>
  )
}

function Pain({ text }: { text: string }) {
  return (
    <div style={{ borderTop: `1px solid ${QM.hair}`, paddingTop: 22, paddingBottom: 22, display: 'flex', alignItems: 'baseline', gap: 24 }}>
      <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 400, color: QM.fgFaint, letterSpacing: '0.06em', minWidth: 28 }}>—</span>
      <span style={{ fontFamily: sans, fontSize: 22, fontWeight: 300, color: QM.fg2, lineHeight: 1.4, letterSpacing: '-0.01em' }}>
        {text}
      </span>
    </div>
  )
}

function ChatBubble({ from, children }: { from: 'in' | 'out'; children: React.ReactNode }) {
  const isOut = from === 'out'
  return (
    <div style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          fontFamily: sans,
          fontSize: 14,
          fontWeight: 300,
          lineHeight: 1.5,
          letterSpacing: '-0.005em',
          color: isOut ? QM.fg : QM.fg2,
          border: `1px solid ${QM.hair}`,
          background: 'transparent',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function CoverSlide({ width, height, theme: _theme }: { width: number; height: number; theme: Theme }) {
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: QM.bg,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: sans,
      }}
    >
      {/* Subtle radial glow, top right */}
      <div
        style={{
          position: 'absolute',
          top: -200,
          right: -200,
          width: 800,
          height: 800,
          background: `radial-gradient(circle, rgba(228, 63, 63, 0.10) 0%, rgba(228, 63, 63, 0) 60%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Top bar */}
      <div style={{ padding: '56px 64px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
        <Brand />
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
          One-Pager · 2026
        </span>
      </div>

      {/* Hero */}
      <div style={{ padding: '72px 64px 0', position: 'relative', zIndex: 10 }}>
        <div style={{ marginBottom: 28 }}>
          <Eyebrow>El problema</Eyebrow>
        </div>
        <h1
          style={{
            fontFamily: sans,
            fontSize: 64,
            fontWeight: 200,
            lineHeight: 1.0,
            letterSpacing: '-0.045em',
            color: QM.fg,
            margin: 0,
          }}
        >
          Cientos de unidades.
          <br />
          Tu equipo aún{' '}
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: QM.accent, letterSpacing: '-0.02em' }}>
            persiguiendo pagos
          </span>
          <br />
          a mano.
        </h1>
        <p
          style={{
            fontFamily: sans,
            fontSize: 19,
            fontWeight: 300,
            color: QM.fg2,
            lineHeight: 1.55,
            maxWidth: 780,
            marginTop: 32,
            letterSpacing: '-0.005em',
          }}
        >
          Ardia automatiza la cobranza de tu desarrollo inmobiliario para que tu equipo se enfoque en vender.
        </p>
      </div>

      {/* Pain points — hairline rows */}
      <div style={{ padding: '64px 64px 0', position: 'relative', zIndex: 10 }}>
        <Pain text="Horas al teléfono persiguiendo pagos atrasados." />
        <Pain text="Comprobantes perdidos en chats de WhatsApp." />
        <Pain text="Sin visibilidad de quién pagó y quién no." />
        <div style={{ borderTop: `1px solid ${QM.hair}` }} />
      </div>

      {/* WhatsApp preview — hairline frame, no bg */}
      <div style={{ padding: '48px 64px 0', position: 'relative', zIndex: 10 }}>
        <div style={{ border: `1px solid ${QM.hair}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${QM.hair2}` }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 400, color: QM.fg, letterSpacing: '-0.005em' }}>
                Cobranza por WhatsApp
              </div>
              <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 300, color: QM.fgDim, marginTop: 2 }}>
                Recordatorio + conciliación · automático
              </div>
            </div>
            <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 18, color: QM.accent, letterSpacing: '-0.02em' }}>
              en tiempo real
            </span>
          </div>
          <ChatBubble from="in">Hola Ana. Tu pago de $45,000 por A-101 vence mañana. ¿Necesitas ayuda?</ChatBubble>
          <ChatBubble from="out">Ya lo transferí, te envío el comprobante</ChatBubble>
          <ChatBubble from="out">comprobante_pago.pdf</ChatBubble>
          <ChatBubble from="in">Pago recibido. Ve tu estado de cuenta en ardia.mx</ChatBubble>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ borderTop: `1px solid ${QM.hair}`, padding: '20px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
            ardia.mx
          </span>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 400, letterSpacing: '0.18em', color: QM.fgDim }}>
            01 / 03
          </span>
        </div>
      </div>
    </div>
  )
}
