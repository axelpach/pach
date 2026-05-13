import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'
import { Globe, Receipt, Building2, KeyRound, Calendar, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: <Receipt size={22} className="text-purple-400" />,
    bg: 'bg-purple-400/10 border border-purple-400/20',
    title: 'Facturación CFDI',
    description: 'Generación automática de facturas al confirmar cada pago.',
  },
  {
    icon: <Globe size={22} className="text-blue-400" />,
    bg: 'bg-blue-400/10 border border-blue-400/20',
    title: 'Portal del comprador',
    description: 'Tus clientes consultan estado de cuenta y pagan en línea 24/7.',
  },
  {
    icon: <Building2 size={22} className="text-emerald-400" />,
    bg: 'bg-emerald-400/10 border border-emerald-400/20',
    title: 'Gestión de unidades',
    description: 'Inventario de unidades, asignación de compradores y contratos.',
  },
  {
    icon: <KeyRound size={22} className="text-yellow-400" />,
    bg: 'bg-yellow-400/10 border border-yellow-400/20',
    title: 'Acceso por roles',
    description: 'Permisos diferenciados para admin, cobranza y ventas.',
  },
  {
    icon: <Calendar size={22} className="text-orange-400" />,
    bg: 'bg-orange-400/10 border border-orange-400/20',
    title: 'Esquemas de pago',
    description: 'Configura apartado, anticipo y mensualidades por proyecto.',
  },
  {
    icon: <BarChart3 size={22} className="text-cyan-400" />,
    bg: 'bg-cyan-400/10 border border-cyan-400/20',
    title: 'Reportes en tiempo real',
    description: 'Dashboard con cobranza, morosidad y proyecciones de flujo.',
  },
]

export function PlatformSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />

      {/* Header */}
      <div className="relative z-10 px-20 pt-12 flex items-center gap-4">
        <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
        <span className="text-[15px] uppercase tracking-widest text-white/40 ml-2">PLATAFORMA</span>
      </div>

      {/* Heading */}
      <div className="relative z-10 px-20 pt-8">
        <h2 className={`text-[56px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}>
          Más allá de la cobranza:{' '}
          <span style={{ color: theme.accent }}>una plataforma completa.</span>
        </h2>
        <p className="text-[24px] text-white/50 leading-relaxed mt-4 max-w-[70%]">
          Todo lo que necesitas para gestionar preventas, rentas y cobranza en un solo lugar.
        </p>
      </div>

      {/* 3x2 grid */}
      <div className="relative z-10 px-20 pt-8 flex-1">
        <div className="grid grid-cols-3 gap-4">
          {features.map((feat, i) => (
            <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
              <div className={`w-11 h-11 rounded-xl ${feat.bg} flex items-center justify-center mb-3`}>
                {feat.icon}
              </div>
              <div className={`text-[20px] font-semibold ${theme.textPrimary}`}>{feat.title}</div>
              <div className="text-[15px] text-white/40 mt-2 leading-relaxed">{feat.description}</div>
            </div>
          ))}
        </div>
      </div>

      <SlideFooter theme={theme} pageNum={5} totalPages={8} label="ardia.mx" />
    </SlideWrapper>
  )
}
