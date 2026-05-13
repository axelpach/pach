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
    <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
      {children}
    </span>
  )
}

function PaymentRow({ concept, date, amount, status }: { concept: string; date: string; amount: string; status: 'paid' | 'current' | 'upcoming' }) {
  const isPaid = status === 'paid'
  const isCurrent = status === 'current'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '14px 0', borderTop: `1px solid ${QM.hair2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            width: 6,
            height: 6,
            display: 'inline-block',
            background: isPaid ? QM.fgDim : isCurrent ? QM.accent : 'transparent',
            border: isCurrent || isPaid ? 'none' : `1px solid ${QM.hair}`,
          }}
        />
        <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 400, color: isPaid ? QM.fgDim : QM.fg, letterSpacing: '-0.005em' }}>
          {concept}
        </span>
        <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 300, color: QM.fgFaint }}>
          {date}
        </span>
      </div>
      <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 400, color: isPaid ? QM.fgDim : QM.fg, letterSpacing: '-0.01em' }}>
        {amount}
      </span>
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '20px 24px', borderLeft: `1px solid ${QM.hair2}` }}>
      <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 300, color: QM.fg, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: accent ? QM.accent : QM.fgDim, marginTop: 6, letterSpacing: '-0.015em' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function FeatureRow({ label, title, description, accentWord }: { label: string; title: string; description: string; accentWord?: string }) {
  return (
    <div style={{ borderTop: `1px solid ${QM.hair}`, padding: '28px 0', display: 'grid', gridTemplateColumns: '160px 1fr', gap: 32 }}>
      <Eyebrow>{label}</Eyebrow>
      <div>
        <h3 style={{ fontFamily: sans, fontSize: 26, fontWeight: 300, color: QM.fg, letterSpacing: '-0.025em', lineHeight: 1.15, margin: 0 }}>
          {title}
          {accentWord && (
            <>
              {' '}
              <span style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: QM.accent, letterSpacing: '-0.02em' }}>
                {accentWord}
              </span>
            </>
          )}
        </h3>
        <p style={{ fontFamily: sans, fontSize: 15, fontWeight: 300, color: QM.fg2, lineHeight: 1.55, margin: '10px 0 0', letterSpacing: '-0.005em', maxWidth: 620 }}>
          {description}
        </p>
      </div>
    </div>
  )
}

export function FeaturesSlide({ width, height, theme: _theme }: { width: number; height: number; theme: Theme }) {
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
      {/* Top bar */}
      <div style={{ padding: '56px 64px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Brand />
        <Eyebrow>Funcionalidades</Eyebrow>
      </div>

      {/* Headline */}
      <div style={{ padding: '64px 64px 0' }}>
        <h2 style={{ fontFamily: sans, fontSize: 52, fontWeight: 200, color: QM.fg, letterSpacing: '-0.045em', lineHeight: 1.0, margin: 0 }}>
          Todo para cobrar
          <br />
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: QM.accent, letterSpacing: '-0.02em' }}>
            sin perseguir
          </span>
          .
        </h2>
      </div>

      {/* Buyer portal mockup — hairline only, no card bg */}
      <div style={{ padding: '56px 64px 0' }}>
        <div style={{ border: `1px solid ${QM.hair}`, padding: '24px 28px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 16, borderBottom: `1px solid ${QM.hair2}` }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
                Portal del comprador
              </div>
              <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 400, color: QM.fg, marginTop: 6, letterSpacing: '-0.015em' }}>
                Torre Álamos · A-101
              </div>
            </div>
            <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 18, color: QM.accent, letterSpacing: '-0.02em' }}>
              en vivo
            </span>
          </div>

          <div style={{ display: 'flex', margin: '0 -24px' }}>
            <Stat label="Pagado" value="$285k" sub="12%" />
            <Stat label="Pendiente" value="$2.1M" sub="88%" />
            <Stat label="Próximo" value="$45k" sub="1 mar" accent />
          </div>

          <div style={{ marginTop: 8 }}>
            <PaymentRow concept="Apartado" date="15 ene 2026" amount="$35,000" status="paid" />
            <PaymentRow concept="Anticipo" date="1 feb 2026" amount="$250,000" status="paid" />
            <PaymentRow concept="Mensualidad #1" date="1 mar 2026" amount="$45,000" status="current" />
            <PaymentRow concept="Mensualidad #2" date="1 abr 2026" amount="$45,000" status="upcoming" />
          </div>
        </div>
      </div>

      {/* Features as hairline rows */}
      <div style={{ padding: '48px 64px 0' }}>
        <FeatureRow
          label="01 · Portal"
          title="Calendario de pagos visible 24/7."
          description="Tus compradores ven su historial, próximo vencimiento y suben comprobantes sin llamar a tu equipo."
          accentWord="para todos"
        />
        <FeatureRow
          label="02 · WhatsApp"
          title="Recordatorios y conciliación"
          accentWord="automáticos."
          description="Mensajes antes del vencimiento, seguimiento sin intervención y conciliación de comprobantes en un clic."
        />
        <FeatureRow
          label="03 · Unidades"
          title="Inventario único, esquemas flexibles."
          description="Apartados, anticipos, mensualidades, escalación, IVA. Un solo lugar, sin Excel V3 final final."
        />
        <div style={{ borderTop: `1px solid ${QM.hair}` }} />
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ borderTop: `1px solid ${QM.hair}`, padding: '20px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
            ardia.mx
          </span>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 400, letterSpacing: '0.18em', color: QM.fgDim }}>
            02 / 03
          </span>
        </div>
      </div>
    </div>
  )
}
