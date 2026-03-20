import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import cinukLogo from '../../../assets/cinuk-white.svg'

export function CoverSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="40%" />

      {/* Logos */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-5">
        <img src={ardiaLogo} alt="Ardia" width={40} height={40} />
        <div className="w-px h-8 bg-white/20" />
        <img src={cinukLogo} alt="CINUK" className="h-7 object-contain" />
      </div>

      {/* Two column layout */}
      <div className="relative z-10 flex-1 flex px-20 pt-6 gap-16">
        {/* Left — headline */}
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[15px] text-white/40 uppercase tracking-widest mb-4">Propuesta para CINUK</p>
          <h1 className="text-white text-[54px] font-bold leading-[1.08] tracking-tight">
            Automatiza tu
            <br />
            cobranza con
            <br />
            <span style={{ color: theme.accent }}>inteligencia.</span>
          </h1>
          <p className="text-[20px] text-white/50 mt-5 leading-relaxed max-w-[95%]">
            Ardia reemplaza el proceso manual de cobranza de tu equipo con una plataforma
            que cobra, concilia y factura — automáticamente.
          </p>
        </div>

        {/* Right — value props */}
        <div className="flex-1 flex flex-col justify-center space-y-5">
          {[
            { title: 'Motor de cobranza automatizado', detail: 'WhatsApp + email como respaldo' },
            { title: 'Facturación electrónica (CFDI)', detail: 'Integrada al flujo de cobro' },
            { title: 'Portal de autoservicio', detail: 'Tus clientes consultan y pagan 24/7' },
            { title: 'Gestión de rentas y preventas', detail: 'Contratos, esquemas y unidades' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                style={{ backgroundColor: theme.accent }}
              />
              <div>
                <span className="text-[19px] font-semibold text-white">{item.title}</span>
                <p className="text-[14px] text-white/40 mt-0.5">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={1} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
