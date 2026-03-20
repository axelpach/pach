import { Gift, CheckCircle2, Infinity } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

export function PricingSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      <div className="relative z-10 px-20 pt-12 flex items-center justify-between">
        <img src={ardiaLogo} alt="Ardia" width={30} height={30} />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Propuesta</span>
      </div>

      <div className="relative z-10 px-20 pt-6">
        <h2 className="text-[42px] font-bold text-white tracking-tight leading-tight">
          Piloto sin costo{' '}
          <span style={{ color: theme.accent }}>por 1 mes.</span>
        </h2>
        <p className="text-[17px] text-white/40 mt-3 leading-relaxed">
          Probamos Ardia con tu operación real. Si funciona, seguimos. Sin compromiso.
        </p>
      </div>

      <div className="relative z-10 flex-1 flex px-20 pt-6 gap-6">
        {/* Left — Pilot */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-2xl border-2 border-emerald-400/30 bg-emerald-400/[0.04] p-7 h-full flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-11 h-11 rounded-xl bg-emerald-400/15 flex items-center justify-center">
                <Gift className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-[22px] font-bold text-white">Piloto gratuito — 1 mes</h3>
                <p className="text-[13px] text-emerald-300/60">Sin costo, sin compromiso</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                'Configuramos toda tu operación',
                'Activamos cobranza automática',
                'Portal para tus arrendatarios',
                'Facturación electrónica incluida',
                'Soporte personalizado',
                'Migración de datos incluida',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[14px] text-white/60">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Pricing */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 h-full flex flex-col justify-center">
            <h3 className="text-[16px] font-semibold text-white/50 mb-4 uppercase tracking-wide">Después del piloto</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[48px] font-bold text-white">$3,990</span>
              <span className="text-[18px] text-white/40">MXN / mes</span>
            </div>
            <p className="text-[15px] text-white/40 mb-6">
              Incluye hasta <span className="text-white font-semibold">40 unidades</span> en cobranza activa
            </p>
            <div className="space-y-4 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <span className="text-[14px] text-white/50">+</span>
                </div>
                <div>
                  <span className="text-[16px] font-semibold text-white">$100 MXN</span>
                  <span className="text-[14px] text-white/40 ml-2">por unidad extra en cobranza activa</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <Infinity className="w-4 h-4 text-white/50" />
                </div>
                <div>
                  <span className="text-[16px] font-semibold text-white">Usuarios ilimitados</span>
                  <span className="text-[14px] text-white/40 ml-2">— sin costo adicional</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={7} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
