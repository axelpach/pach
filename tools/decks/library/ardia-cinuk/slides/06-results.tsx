import { Zap, TrendingUp, Users, CheckCircle2 } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

export function ResultsSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="30%" />

      <div className="relative z-10 px-20 pt-12 flex items-center justify-between">
        <img src={ardiaLogo} alt="Ardia" width={30} height={30} />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Resultados</span>
      </div>

      <div className="relative z-10 flex-1 flex px-20 pt-4 gap-14">
        {/* Left — metrics */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-[42px] font-bold text-white tracking-tight leading-tight">
            Lo que puedes esperar
            <br />
            <span style={{ color: theme.accent }}>desde el primer mes.</span>
          </h2>
          <p className="text-[16px] text-white/40 mt-3 leading-relaxed">
            Basado en la operación con desarrolladores inmobiliarios que ya usan la plataforma.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              {
                icon: Zap,
                value: '~70%',
                label: 'menos tiempo en seguimiento',
                color: 'text-yellow-400',
                bg: 'bg-yellow-400/10',
              },
              {
                icon: TrendingUp,
                value: '~30%',
                label: 'más pagos a tiempo',
                color: 'text-emerald-400',
                bg: 'bg-emerald-400/10',
              },
              {
                icon: Users,
                value: '24/7',
                label: 'autoservicio para clientes',
                color: 'text-blue-400',
                bg: 'bg-blue-400/10',
              },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 text-center">
                <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center mx-auto mb-2`}>
                  <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} />
                </div>
                <div className="text-[32px] font-bold text-white">{stat.value}</div>
                <div className="text-[13px] text-white/50 mt-1 leading-snug">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — implementation */}
        <div className="flex-[0.85] flex flex-col justify-center">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7">
            <h3 className="text-[20px] font-bold text-white mb-5">Implementación en menos de una semana</h3>
            <div className="space-y-4">
              {[
                'Cargamos tu inventario de locales y unidades',
                'Configuramos contratos de renta activos',
                'Damos de alta a tus arrendatarios actuales',
                'Activamos recordatorios automáticos',
                'Conectamos facturación electrónica (CFDI)',
                'Sin costo de implementación',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-[14px] text-white/50 leading-snug">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <p className="text-[12px] text-white/30">
                * 1 semana de configuración a partir de que CINUK envíe sus datos (inventario, contratos, arrendatarios).
              </p>
            </div>
          </div>
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={6} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
