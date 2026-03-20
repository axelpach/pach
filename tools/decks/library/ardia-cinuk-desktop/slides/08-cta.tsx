import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import cinukLogo from '../../../assets/cinuk-white.svg'
import cinukLogos from '../../../assets/cinuk-logos.svg'

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
          <img src={cinukLogo} alt="CINUK" className="h-12" />
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

      {/* Bottom — CINUK projects */}
      <div className="relative z-10 px-20 pb-16">
        <div className="rounded-xl bg-white/[0.08] px-10 py-5">
          <div className="flex items-center justify-center gap-10">
            <span className="text-[15px] uppercase tracking-widest text-white/40">PROYECTOS CINUK</span>
            <img src={cinukLogos} alt="Proyectos CINUK" className="h-14" />
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={8} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
