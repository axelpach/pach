import { Zap, TrendingUp, Users, CheckCircle2 } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'

function ArdiaLogo({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-lg bg-[#F13D43] flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        A
      </div>
      <span className="font-bold tracking-[0.2em] text-white" style={{ fontSize: size * 0.5 }}>
        ARDIA
      </span>
    </div>
  )
}

export function ResultsSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="30%" />

      <div className="relative z-10 px-16 pt-14 flex items-center justify-between">
        <ArdiaLogo />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Resultados</span>
      </div>

      <div className="relative z-10 px-16 pt-8">
        <h2 className="text-[40px] font-bold text-white tracking-tight leading-tight">
          Lo que puedes esperar
          <br />
          <span style={{ color: theme.accent }}>desde el primer mes.</span>
        </h2>
        <p className="text-[18px] text-white/40 mt-4 leading-relaxed max-w-[85%]">
          Basado en la operacion con desarrolladores inmobiliarios que ya usan la plataforma.
        </p>
      </div>

      {/* Metrics */}
      <div className="relative z-10 px-16 pt-10 grid grid-cols-3 gap-5">
        {[
          {
            icon: Zap,
            value: '~70%',
            label: 'menos tiempo en seguimiento de cobranza',
            color: 'text-yellow-400',
            bg: 'bg-yellow-400/10',
            detail: 'Recordatorios automaticos reemplazan llamadas manuales',
          },
          {
            icon: TrendingUp,
            value: '~30%',
            label: 'mas pagos a tiempo',
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10',
            detail: 'Los recordatorios por WhatsApp tienen mayor tasa de respuesta',
          },
          {
            icon: Users,
            value: '24/7',
            label: 'autoservicio para compradores',
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
            detail: 'Tus clientes resuelven sus dudas sin llamar a tu equipo',
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 text-center"
          >
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mx-auto mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="text-[36px] font-bold text-white">{stat.value}</div>
            <div className="text-[15px] text-white/50 mt-1 leading-snug">{stat.label}</div>
            <div className="text-[12px] text-white/30 mt-2 leading-snug">{stat.detail}</div>
          </div>
        ))}
      </div>

      {/* Benefits */}
      <div className="relative z-10 px-16 pt-10">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
          <h3 className="text-[20px] font-bold text-white mb-5">Implementacion en menos de una semana</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              'Cargamos tu inventario de unidades',
              'Configuramos tus esquemas de pago',
              'Damos de alta a tus compradores actuales',
              'Activamos recordatorios automaticos por WhatsApp',
              'Tus clientes acceden a su portal desde dia uno',
              'Sin costo de implementacion',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-[15px] text-white/50 leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex-1" />
      <div className="relative z-10 flex flex-col items-center gap-5 pb-16">
        <div
          data-cta="true"
          className="px-12 py-5 rounded-xl bg-[#F13D43] text-white text-[24px] font-semibold tracking-wide text-center cursor-pointer"
        >
          Agenda una demo de 15 minutos →
        </div>
        <span className="text-white/30 text-[15px]">
          La plataforma de cobranza para desarrolladores inmobiliarios
        </span>
      </div>

      <SlideFooter theme={theme} pageNum={3} totalPages={3} label="ardia.mx" />
    </SlideWrapper>
  )
}
