import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso-light.png'
import abanzaLogo from '../../../assets/universo-avanza.jpg'

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
const mono = "'Geist Mono', ui-monospace, Menlo, monospace"

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: QM.fgDim,
      }}
    >
      {children}
    </span>
  )
}

function Section({
  index,
  title,
  accent,
  intro,
  fields,
}: {
  index: string
  title: string
  accent: string
  intro: string
  fields: string[]
}) {
  return (
    <div style={{ borderTop: `1px solid ${QM.hair}`, paddingTop: 28, paddingBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
        <span
          style={{
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.18em',
            color: QM.fgFaint,
            minWidth: 28,
          }}
        >
          {index}
        </span>
        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontFamily: sans,
              fontSize: 30,
              fontWeight: 200,
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
              color: QM.fg,
              margin: 0,
            }}
          >
            {title}{' '}
            <span
              style={{
                fontFamily: serif,
                fontStyle: 'italic',
                fontWeight: 400,
                color: QM.accent,
                letterSpacing: '-0.015em',
              }}
            >
              {accent}
            </span>
          </h3>
          <p
            style={{
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 300,
              color: QM.fg2,
              lineHeight: 1.55,
              marginTop: 10,
              marginBottom: 18,
              maxWidth: 720,
              letterSpacing: '-0.005em',
            }}
          >
            {intro}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: 36,
              rowGap: 8,
            }}
          >
            {fields.map((f, i) => (
              <div
                key={i}
                style={{
                  fontFamily: mono,
                  fontSize: 12,
                  fontWeight: 400,
                  color: QM.fg2,
                  letterSpacing: '0.02em',
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${QM.hair2}`,
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function OnboardingSlide({ width, height, theme: _theme }: { width: number; height: number; theme: Theme }) {
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
          top: -240,
          right: -240,
          width: 820,
          height: 820,
          background: `radial-gradient(circle, rgba(228, 63, 63, 0.10) 0%, rgba(228, 63, 63, 0) 60%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Top bar — co-branded */}
      <div
        style={{
          padding: '52px 64px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={ardiaLogo} alt="Ardia" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span
              style={{
                fontFamily: serif,
                fontStyle: 'italic',
                fontSize: 26,
                letterSpacing: '-0.01em',
                color: QM.fg,
                lineHeight: 1,
              }}
            >
              Ardia
            </span>
          </div>
          <span
            style={{
              fontFamily: sans,
              fontSize: 18,
              fontWeight: 200,
              color: QM.fgFaint,
              lineHeight: 1,
            }}
          >
            ×
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={abanzaLogo}
              alt="Universo aBanza"
              style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: '50%' }}
            />
            <span
              style={{
                fontFamily: sans,
                fontSize: 14,
                fontWeight: 400,
                color: QM.fg,
                letterSpacing: '-0.005em',
              }}
            >
              Universo aBanza
            </span>
          </div>
        </div>
        <MonoLabel>Onboarding · Pilot 2026</MonoLabel>
      </div>

      {/* Hero */}
      <div style={{ padding: '64px 64px 0', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span style={{ width: 6, height: 6, background: QM.accent, display: 'inline-block' }} />
          <MonoLabel>Carga inicial · renta comercial</MonoLabel>
        </div>
        <h1
          style={{
            fontFamily: sans,
            fontSize: 56,
            fontWeight: 200,
            lineHeight: 1.0,
            letterSpacing: '-0.045em',
            color: QM.fg,
            margin: 0,
          }}
        >
          Lo mínimo para{' '}
          <span
            style={{
              fontFamily: serif,
              fontStyle: 'italic',
              fontWeight: 400,
              color: QM.accent,
              letterSpacing: '-0.02em',
            }}
          >
            arrancar
          </span>
          <br />
          el piloto.
        </h1>
        <p
          style={{
            fontFamily: sans,
            fontSize: 16,
            fontWeight: 300,
            color: QM.fg2,
            lineHeight: 1.6,
            maxWidth: 680,
            marginTop: 22,
            letterSpacing: '-0.005em',
          }}
        >
          Esto es una guía, no un formulario. Si ya tienes esta información en otro formato — tu Excel, tu CRM, lo que
          sea — mándalo así. Nosotros lo adaptamos.
        </p>
      </div>

      {/* Sections */}
      <div style={{ padding: '52px 64px 0', position: 'relative', zIndex: 10 }}>
        <Section
          index="01"
          title="Locales"
          accent="y su estatus."
          intro="El inventario base. Una fila por local — propio, rentado o disponible."
          fields={[
            'clave_local',
            'proyecto',
            'nivel_o_piso',
            'm² rentables',
            'estatus',
            'renta de lista mensual',
          ]}
        />

        <Section
          index="02"
          title="Contratos vigentes"
          accent="con quién y por cuánto."
          intro="Todo lo que está rentado hoy."
          fields={[
            'clave_local',
            'inquilino',
            'contacto (nombre, tel, correo)',
            'fecha inicio / fin',
            'renta mensual (MXN)',
            'depósito en garantía',
            'día de pago',
            'incremento anual (% o INPC)',
            'cuota de mantenimiento',
            'notas',
          ]}
        />

        <Section
          index="03"
          title="Cobranza"
          accent="qué se pagó y qué no."
          intro="El estado del mes en curso. Es lo que nos permite arrancar con datos reales."
          fields={[
            'clave_local',
            'mes',
            'concepto',
            'monto',
            'fecha de vencimiento',
            'estatus (pagado · pendiente · vencido)',
            'fecha de pago',
            'monto pagado',
          ]}
        />
      </div>

      {/* Closing note */}
      <div style={{ padding: '12px 64px 0', position: 'relative', zIndex: 10 }}>
        <div
          style={{
            borderTop: `1px solid ${QM.hair}`,
            paddingTop: 22,
            display: 'flex',
            alignItems: 'baseline',
            gap: 24,
          }}
        >
          <span
            style={{
              fontFamily: serif,
              fontStyle: 'italic',
              fontSize: 22,
              color: QM.accent,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            ¿Dudas?
          </span>
          <span
            style={{
              fontFamily: sans,
              fontSize: 15,
              fontWeight: 300,
              color: QM.fg2,
              lineHeight: 1.5,
              letterSpacing: '-0.005em',
            }}
          >
            Mándanos lo que tengas y lo platicamos. Todos los montos en MXN.
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            borderTop: `1px solid ${QM.hair}`,
            padding: '20px 64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <MonoLabel>ardia.mx</MonoLabel>
          <MonoLabel>Universo aBanza · 01 / 01</MonoLabel>
        </div>
      </div>
    </div>
  )
}
