import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import cinukLogo from '../../../assets/cinuk-white.svg'
import cinukLogos from '../../../assets/cinuk-logos.svg'

export function CTASlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Main content — centered */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-16 gap-8">
        {/* Logos */}
        <div className="flex items-center gap-5">
          <img src={ardiaLogo} alt="Ardia" className="w-14 h-14" />
          <span className="text-[32px] text-white/40 font-light">×</span>
          <img src={cinukLogo} alt="CINUK" className="h-10" />
        </div>

        {/* Heading */}
        <h1 className="text-[48px] font-bold tracking-tight leading-tight text-white m-0">
          ¿Empezamos el piloto?
        </h1>

        {/* Subtitle */}
        <p className="text-[20px] text-white/40 leading-relaxed m-0 max-w-[700px]">
          Agenda una llamada de 15 minutos para definir los siguientes pasos y comenzar la implementación.
        </p>

        {/* CTA Button */}
        <div
          data-cta="true"
          className="rounded-[14px] px-12 py-[18px] cursor-pointer"
          style={{ backgroundColor: theme.accent }}
        >
          <p className="text-[24px] font-bold text-white m-0">
            Agendar siguiente paso →
          </p>
        </div>

        {/* URL */}
        <p className="text-[18px] text-white/40 m-0">ardia.mx</p>
      </div>

      {/* Project logos — bottom */}
      <div className="relative z-10 px-16 pb-14">
        <div className="rounded-xl bg-white/[0.08] px-8 py-5">
          <p className="text-[16px] text-white/40 mb-4 m-0 uppercase tracking-widest text-center">
            Proyectos CINUK
          </p>
          <div className="flex items-center justify-center">
            <img src={cinukLogos} alt="Proyectos CINUK" className="h-12" />
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={8} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
