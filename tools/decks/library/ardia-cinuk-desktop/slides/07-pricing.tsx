import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Gift, CheckCircle2, Infinity } from 'lucide-react'

const pilotFeatures = [
  'Motor de cobranza automatizado',
  'WhatsApp + email',
  'Facturación CFDI',
  'Portal del comprador',
  'Hasta 40 unidades en cobranza activa',
  'Soporte dedicado',
]

export function PricingSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <span className="text-[15px] uppercase tracking-widest text-white/40 ml-2">PROPUESTA</span>
      </div>

      {/* Heading */}
      <div className="relative z-10 px-20 pt-8">
        <h2 className={`text-[60px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
          Piloto sin costo{' '}
          <span style={{ color: theme.accent }}>por 1 mes.</span>
        </h2>
        <p className="text-[26px] text-white/50 leading-relaxed mt-4 max-w-[70%]">
          Prueba Ardia con un proyecto real antes de comprometerte.
        </p>
      </div>

      {/* Two columns */}
      <div className="relative z-10 flex-1 flex px-20 gap-16 pt-8">
        {/* Left — pilot card */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-xl bg-emerald-400/[0.04] border-2 border-emerald-400/30 p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                <Gift size={24} className="text-emerald-400" />
              </div>
              <div className={`text-[28px] font-semibold ${theme.textPrimary}`}>Piloto gratuito — 1 mes</div>
            </div>
            <div className="space-y-4">
              {pilotFeatures.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                  <span className={`text-[20px] ${theme.textPrimary}`}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — post-pilot pricing */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-8">
            <span className="text-[15px] uppercase tracking-widest text-white/40">DESPUÉS DEL PILOTO</span>
            <div className="mt-4 flex items-baseline gap-3">
              <span className={`text-[60px] font-bold ${theme.textPrimary}`}>$3,990</span>
              <span className="text-[24px] text-white/50">MXN / mes</span>
            </div>
            <div className={`text-[22px] mt-3 ${theme.textPrimary}`}>Incluye hasta 40 unidades en cobranza activa</div>

            <div className="border-t border-white/[0.06] my-6" />

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[22px] text-white/50">+$100 MXN por unidad extra en cobranza activa</span>
              </div>
              <div className="flex items-center gap-3">
                <Infinity size={20} className="text-white/50 shrink-0" />
                <span className={`text-[22px] ${theme.textPrimary}`}>Usuarios ilimitados</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={7} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
