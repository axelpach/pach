import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import avanzaLogo from '../../../assets/universo-avanza.jpg'

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
          <img src={avanzaLogo} alt="Universo aBanza" className="h-10 rounded-full" />
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

      <SlideFooter theme={theme} pageNum={8} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
