import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import avanzaLogo from '../../../assets/universo-avanza.jpg'

const valueProps = [
  { title: 'Motor de cobranza automatizado', desc: 'WhatsApp + email como respaldo' },
  { title: 'Facturación electrónica (CFDI)', desc: 'Integrada al flujo de cobro' },
  { title: 'Portal de autoservicio', desc: 'Tus clientes consultan y pagan 24/7' },
  { title: 'Gestión de rentas y preventas', desc: 'Contratos, esquemas y unidades' },
]

export function CoverSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-8">
        {/* Logos */}
        <div className="flex items-center gap-4">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <div className="w-px h-8 bg-white/20" />
          <img src={avanzaLogo} alt="Universo aBanza" className="h-8 rounded-full" />
        </div>

        {/* Label */}
        <p className="text-[16px] uppercase tracking-widest text-white/40 m-0">
          Propuesta para Universo aBanza
        </p>

        {/* Heading */}
        <h1 className="text-[56px] font-bold tracking-tight leading-tight text-white m-0">
          Automatiza tu{'\n'}cobranza con{'\n'}
          <span style={{ color: theme.accent }}>inteligencia.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[22px] text-white/50 leading-relaxed m-0">
          Ardia reemplaza el proceso manual de cobranza con un motor inteligente que envía recordatorios, genera facturas y da visibilidad total a tu equipo.
        </p>

        {/* Value props */}
        <div className="flex flex-col gap-3">
          {valueProps.map((item, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 flex items-start gap-3"
            >
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: theme.accent }}
              />
              <div>
                <p className="text-[20px] font-semibold text-white m-0">{item.title}</p>
                <p className="text-[16px] text-white/40 mt-1 m-0">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={1} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
