import {
  Globe,
  Receipt,
  Building2,
  KeyRound,
  Calendar,
  BarChart3,
} from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
  bg,
}: {
  icon: React.ElementType
  title: string
  description: string
  color: string
  bg: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <h3 className="text-[16px] font-semibold text-white mb-1">{title}</h3>
      <p className="text-[12px] text-white/40 leading-relaxed">{description}</p>
    </div>
  )
}

export function PlatformSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="45%" />

      <div className="relative z-10 px-20 pt-12 flex items-center justify-between">
        <img src={ardiaLogo} alt="Ardia" width={30} height={30} />
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Plataforma</span>
      </div>

      <div className="relative z-10 px-20 pt-6">
        <h2 className="text-[42px] font-bold text-white tracking-tight leading-tight">
          Más allá de la cobranza:{' '}
          <span style={{ color: theme.accent }}>una plataforma completa.</span>
        </h2>
        <p className="text-[17px] text-white/40 mt-3 leading-relaxed">
          Además del motor de cobranza, Ardia incluye todo lo que necesitas para operar tus proyectos comerciales y de preventa.
        </p>
      </div>

      {/* Feature grid — 3x2 */}
      <div className="relative z-10 px-20 pt-8 grid grid-cols-3 gap-4 flex-1">
        <FeatureCard
          icon={Receipt}
          title="Facturación Electrónica"
          description="Genera CFDI automáticamente al verificar un pago. Tus clientes descargan su factura desde el portal."
          color="text-purple-400"
          bg="bg-purple-400/10"
        />
        <FeatureCard
          icon={Globe}
          title="Portal de Clientes"
          description="Autoservicio 24/7. Tus arrendatarios ven su estado de cuenta, suben comprobantes y descargan facturas."
          color="text-blue-400"
          bg="bg-blue-400/10"
        />
        <FeatureCard
          icon={Building2}
          title="Gestión de Rentas"
          description="Contratos con escalamiento automático, depósitos, periodos de gracia y penalizaciones configurables."
          color="text-emerald-400"
          bg="bg-emerald-400/10"
        />
        <FeatureCard
          icon={KeyRound}
          title="Ciclo de Unidades"
          description="Administra el ciclo completo: disponible → rentada → liquidada. Todo desde un dashboard."
          color="text-yellow-400"
          bg="bg-yellow-400/10"
        />
        <FeatureCard
          icon={Calendar}
          title="Esquemas de Pago"
          description="Para preventa: apartado, anticipo, mensualidades. Cotizador integrado para compartir con prospectos."
          color="text-orange-400"
          bg="bg-orange-400/10"
        />
        <FeatureCard
          icon={BarChart3}
          title="Dashboard en Tiempo Real"
          description="Visibilidad completa: cobros pendientes, verificados, vencidos. Métricas de tu operación al instante."
          color="text-cyan-400"
          bg="bg-cyan-400/10"
        />
      </div>

      <SlideFooter theme={theme} pageNum={5} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
