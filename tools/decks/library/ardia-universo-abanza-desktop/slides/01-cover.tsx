import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import avanzaLogo from '../../../assets/universo-avanza.jpg'

const valueProps = [
  { title: 'Motor de cobranza automatizado', detail: 'WhatsApp + email como respaldo' },
  { title: 'Facturación electrónica (CFDI)', detail: 'Integrada al flujo de cobro' },
  { title: 'Portal de autoservicio', detail: 'Tus clientes consultan y pagan 24/7' },
  { title: 'Gestión de rentas y preventas', detail: 'Contratos, esquemas y unidades' },
]

export function CoverSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header logos */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <div className="w-px h-8 bg-white/20" />
        <img src={avanzaLogo} alt="Universo aBanza" className="h-9 rounded-full" />
      </div>

      {/* Two columns */}
      <div className="relative z-10 flex-1 flex px-20 gap-16 items-center">
        {/* Left column */}
        <div className="flex-1 flex flex-col justify-center">
          <span className="text-[16px] uppercase tracking-widest text-white/40 mb-4">
            PROPUESTA PARA UNIVERSO ABANZA
          </span>
          <h1 className={`text-[60px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
            Automatiza tu{'\n'}cobranza con{' '}
            <span style={{ color: theme.accent }}>inteligencia.</span>
          </h1>
          <p className="text-[26px] text-white/50 leading-relaxed mt-6 max-w-[90%]">
            Reemplaza el seguimiento manual de pagos con un motor de cobranza que trabaja las 24 horas — sin perder el toque personal.
          </p>
        </div>

        {/* Right column — value prop cards */}
        <div className="flex-1 flex flex-col justify-center gap-5">
          {valueProps.map((vp, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 flex items-start gap-4"
            >
              <div
                className="w-[10px] h-[10px] rounded-full mt-[7px] shrink-0"
                style={{ backgroundColor: theme.accent }}
              />
              <div>
                <div className={`text-[24px] font-semibold ${theme.textPrimary}`}>{vp.title}</div>
                <div className="text-[18px] text-white/40 mt-1">{vp.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={1} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
