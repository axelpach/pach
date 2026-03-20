import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import cinukLogo from '../../../assets/cinuk-white.svg'
import barrioCascattaLogo from '../../../assets/barrio-cascatta.jpeg'
import downtownLogo from '../../../assets/downtown.jpeg'
import feLogo from '../../../assets/fe.jpeg'

export function CTASlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="45%" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-20">
        {/* Partnership logos */}
        <div className="flex items-center gap-6 mb-10">
          <img src={ardiaLogo} alt="Ardia" width={56} height={56} />
          <div className="text-[28px] text-white/20 font-light">&times;</div>
          <img src={cinukLogo} alt="CINUK" className="h-10 object-contain" />
        </div>

        <h2 className="text-[48px] font-bold text-white text-center leading-tight mb-3">
          ¿Empezamos el piloto?
        </h2>
        <p className="text-[19px] text-white/40 text-center max-w-[60%] mb-8">
          Configuramos Ardia con la operación real de CINUK en menos de una semana.
          Sin costo por 1 mes. Sin compromiso.
        </p>

        <div
          data-cta="true"
          className="px-14 py-5 rounded-xl bg-[#F13D43] text-white text-[24px] font-semibold tracking-wide text-center cursor-pointer mb-3"
        >
          Agendar siguiente paso →
        </div>
        <span className="text-white/30 text-[15px]">ardia.mx</span>

        {/* CINUK projects */}
        <div className="mt-12 pt-6 border-t border-white/[0.06] w-full max-w-[700px]">
          <p className="text-[12px] text-white/25 text-center mb-5 uppercase tracking-widest">
            Proyectos CINUK
          </p>
          <div className="flex items-center justify-center gap-12">
            <img
              src={barrioCascattaLogo}
              alt="Barrio Cascatta"
              className="h-12 object-contain opacity-50"
            />
            <img
              src={downtownLogo}
              alt="Downtown Puebla"
              className="h-12 object-contain opacity-50"
            />
            <img
              src={feLogo}
              alt="FE"
              className="h-12 object-contain opacity-50"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={8} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
