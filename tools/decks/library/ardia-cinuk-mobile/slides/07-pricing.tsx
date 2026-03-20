import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Gift, CheckCircle2, Infinity } from 'lucide-react'

const pilotItems = [
  'Motor de cobranza automatizado (WhatsApp + email)',
  'Facturación electrónica (CFDI)',
  'Portal de autoservicio para arrendatarios',
  'Dashboard de cobranza en tiempo real',
  'Configuración e implementación incluida',
  'Soporte dedicado durante el piloto',
]

export function PricingSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 flex flex-col h-full px-16 justify-center gap-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="text-[14px] uppercase tracking-widest text-white/40 font-semibold">Propuesta</span>
        </div>

        {/* Heading */}
        <h1 className="text-[52px] font-bold tracking-tight leading-tight text-white m-0">
          Piloto sin costo{'\n'}
          <span style={{ color: theme.accent }}>por 1 mes.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[20px] text-white/60 leading-relaxed m-0">
          Prueba Ardia sin compromiso. Si no ves resultados, no pagas nada.
        </p>

        {/* Pilot card */}
        <div className="rounded-2xl bg-emerald-400/[0.04] border-2 border-emerald-400/30 p-7">
          <div className="flex items-center gap-3 mb-5">
            <Gift size={28} color="#22c55e" />
            <p className="text-[24px] font-bold text-emerald-400 m-0">
              Piloto gratuito — 1 mes
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {pilotItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 size={20} color="#22c55e" className="mt-0.5 shrink-0" />
                <p className="text-[16px] text-white/60 m-0 leading-snug">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing card */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-7">
          <p className="text-[14px] uppercase tracking-widest text-white/40 font-semibold mb-3 m-0">
            Después del piloto
          </p>
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-[52px] font-extrabold text-white m-0">$3,990</p>
            <p className="text-[20px] text-white/40 m-0">MXN / mes</p>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} color={theme.accent} />
              <p className="text-[18px] text-white/60 m-0">40 unidades en cobranza activa incluidas</p>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} color={theme.accent} />
              <p className="text-[18px] text-white/60 m-0">+$100 MXN por unidad extra en cobranza activa</p>
            </div>
            <div className="flex items-center gap-2">
              <Infinity size={18} color={theme.accent} />
              <p className="text-[18px] text-white/60 m-0">Usuarios ilimitados</p>
            </div>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={7} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
