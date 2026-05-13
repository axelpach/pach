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

function BigStat({ value, unit, label, detail, isFirst }: { value: string; unit?: string; label: string; detail: string; isFirst?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '0 32px', borderLeft: isFirst ? 'none' : `1px solid ${QM.hair2}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: sans, fontSize: 72, fontWeight: 200, color: QM.fg, letterSpacing: '-0.05em', lineHeight: 0.95 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 32, color: QM.accent, letterSpacing: '-0.02em' }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 400, color: QM.fg, marginTop: 14, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
        {label}
      </div>
      <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 300, color: QM.fgDim, marginTop: 8, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
        {detail}
      </div>
    </div>
  )
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '14px 0', borderTop: `1px solid ${QM.hair2}` }}>
      <span style={{ width: 6, height: 6, background: QM.accent, display: 'inline-block', flexShrink: 0, transform: 'translateY(-2px)' }} />
      <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 300, color: QM.fg2, letterSpacing: '-0.005em', lineHeight: 1.5 }}>
        {text}
      </span>
    </div>
  )
}

export function ResultsSlide({ width, height, theme: _theme }: { width: number; height: number; theme: Theme }) {
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
      {/* Subtle radial glow */}
      <div
        style={{
          position: 'absolute',
          bottom: -250,
          left: -150,
          width: 800,
          height: 800,
          background: `radial-gradient(circle, rgba(228, 63, 63, 0.10) 0%, rgba(228, 63, 63, 0) 60%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Top bar */}
      <div style={{ padding: '56px 64px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
        <Brand />
        <Eyebrow>Resultados</Eyebrow>
      </div>

      {/* Headline */}
      <div style={{ padding: '64px 64px 0', position: 'relative', zIndex: 10 }}>
        <h2 style={{ fontFamily: sans, fontSize: 52, fontWeight: 200, color: QM.fg, letterSpacing: '-0.045em', lineHeight: 1.0, margin: 0 }}>
          Lo que cambia
          <br />
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: QM.accent, letterSpacing: '-0.02em' }}>
            desde el primer mes
          </span>
          .
        </h2>
        <p style={{ fontFamily: sans, fontSize: 17, fontWeight: 300, color: QM.fg2, lineHeight: 1.55, marginTop: 24, maxWidth: 720, letterSpacing: '-0.005em' }}>
          Métricas observadas con desarrolladores que ya operan sobre Ardia.
        </p>
      </div>

      {/* Stats — vertical hairline dividers */}
      <div style={{ padding: '64px 32px 0', display: 'flex', position: 'relative', zIndex: 10 }}>
        <BigStat
          value="70"
          unit="%"
          label="menos tiempo en seguimiento."
          detail="Recordatorios automáticos reemplazan llamadas manuales."
          isFirst
        />
        <BigStat
          value="30"
          unit="%"
          label="más pagos a tiempo."
          detail="WhatsApp tiene mayor tasa de respuesta que el correo."
        />
        <BigStat
          value="24"
          unit="/7"
          label="autoservicio para clientes."
          detail="Resuelven dudas sin marcar a tu equipo."
        />
      </div>

      {/* Implementation */}
      <div style={{ padding: '72px 64px 0', position: 'relative', zIndex: 10 }}>
        <div style={{ marginBottom: 20 }}>
          <Eyebrow>Implementación · menos de una semana</Eyebrow>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 56 }}>
          <div>
            <ChecklistItem text="Cargamos tu inventario de unidades." />
            <ChecklistItem text="Configuramos tus esquemas de pago." />
            <ChecklistItem text="Damos de alta a tus compradores actuales." />
            <div style={{ borderTop: `1px solid ${QM.hair2}` }} />
          </div>
          <div>
            <ChecklistItem text="Activamos recordatorios por WhatsApp." />
            <ChecklistItem text="Tus clientes acceden a su portal el día uno." />
            <ChecklistItem text="Sin costo de implementación." />
            <div style={{ borderTop: `1px solid ${QM.hair2}` }} />
          </div>
        </div>
      </div>

      {/* CTA — text + hairline underline, no filled button */}
      <div style={{ marginTop: 'auto', padding: '0 64px 64px', position: 'relative', zIndex: 10 }}>
        <div style={{ borderTop: `1px solid ${QM.hair}`, paddingTop: 56, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 22, color: QM.accent, letterSpacing: '-0.02em' }}>
            Empieza este mes.
          </span>
          <h3 style={{ fontFamily: sans, fontSize: 40, fontWeight: 200, color: QM.fg, letterSpacing: '-0.04em', lineHeight: 1.05, margin: 0 }}>
            Agenda una demo de 15 minutos.
          </h3>
          <div
            data-cta="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              alignSelf: 'flex-start',
              marginTop: 12,
              padding: '10px 0',
              fontFamily: sans,
              fontSize: 16,
              fontWeight: 400,
              color: QM.fg,
              letterSpacing: '-0.005em',
              borderBottom: `1px solid ${QM.accent}`,
              cursor: 'pointer',
            }}
          >
            calendly.com/axel-ardia
            <span style={{ color: QM.accent, fontFamily: serif, fontStyle: 'italic', fontSize: 18 }}>→</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${QM.hair}`, padding: '20px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
          ardia.mx
        </span>
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 400, letterSpacing: '0.18em', color: QM.fgDim }}>
          03 / 03
        </span>
      </div>
    </div>
  )
}
