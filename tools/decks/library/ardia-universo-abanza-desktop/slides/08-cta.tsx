import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import avanzaLogo from '../../../assets/universo-avanza.jpg'

export function CTASlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="45%" />

      {/* Centered content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-20">
        {/* Logos row */}
        <div className="flex items-center gap-5 mb-10">
          <img src={ardiaLogo} alt="Ardia" className="w-14 h-14" />
          <span className="text-[32px] text-white/30">×</span>
          <img src={avanzaLogo} alt="Universo aBanza" className="h-12 rounded-full" />
        </div>

        {/* Headline */}
        <h2 className={`text-[60px] font-bold tracking-tight text-center ${theme.textPrimary}`}>
          ¿Empezamos el piloto?
        </h2>

        {/* Subtitle */}
        <p className="text-[24px] text-white/50 text-center mt-4 max-w-[700px] leading-relaxed">
          Configuramos tu primer proyecto en menos de una semana. Sin costo por 60 días.
        </p>

        {/* CTA button */}
        <div
          data-cta="true"
          className="mt-10 px-14 py-5 rounded-xl bg-[#F13D43] text-white text-[28px] font-semibold tracking-wide text-center cursor-pointer"
        >
          Agendar siguiente paso →
        </div>

        {/* URL */}
        <span className="text-[18px] text-white/40 mt-5">ardia.mx</span>
      </div>

      <SlideFooter theme={theme} pageNum={8} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
