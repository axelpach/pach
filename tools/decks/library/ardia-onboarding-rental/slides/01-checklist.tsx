import { Building2, Home, Receipt, CreditCard, Bell } from 'lucide-react'
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'
import ardiaLogo from '../../../assets/ardia-iso.png'

function Section({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  items,
}: {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  items: string[]
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <h3 className="text-[18px] font-bold text-white">{title}</h3>
      </div>
      <div className="space-y-2 pl-11">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-[6px] h-[6px] rounded-full bg-white/20 mt-[7px] shrink-0" />
            <span className="text-[14px] text-white/50 leading-snug">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChecklistSlide({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="15%" />

      {/* Header */}
      <div className="relative z-10 px-16 pt-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={ardiaLogo} alt="Ardia" className="w-10 h-10" />
          <span className="font-bold tracking-[0.2em] text-white text-[16px]">ARDIA</span>
        </div>
        <span className="text-[14px] text-white/30 tracking-wide uppercase">Onboarding</span>
      </div>

      {/* Title */}
      <div className="relative z-10 px-16 pt-8 pb-6">
        <h2 className="text-[36px] font-bold text-white tracking-tight leading-tight">
          Checklist de implementación
          <br />
          <span style={{ color: theme.accent }}>Renta comercial</span>
        </h2>
        <p className="text-[16px] text-white/40 mt-3 leading-relaxed">
          Información necesaria para dar de alta la cuenta en Ardia.
        </p>
      </div>

      {/* Sections */}
      <div className="relative z-10 px-16 space-y-4">
        <Section
          icon={Building2}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
          title="Organización y proyectos"
          items={[
            'Usuarios admin (nombre, correo, teléfono, rol)',
            'Nombre de cada proyecto y dirección',
            'Edificios o zonas dentro del proyecto (ej. Torre A, Torre B, Nave 1, Zona Norte — nombre, número de pisos o niveles)',
          ]}
        />

        <Section
          icon={Home}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-400/10"
          title="Unidades"
          items={[
            'Listado por unidad: número/nombre, edificio o zona, piso, superficie (m²)',
            'Tipologías: nombre del tipo (ej. Local 40m², Oficina Premium, Bodega), superficie, precio base de renta',
            'Precio de renta mensual por unidad (si varía del precio base de tipología)',
            'Estatus actual: disponible, rentada, o no disponible',
          ]}
        />

        <div className="grid grid-cols-2 gap-4">
          <Section
            icon={CreditCard}
            iconColor="text-orange-400"
            iconBg="bg-orange-400/10"
            title="Contratos existentes"
            items={[
              'Inquilinos: nombre, correo, teléfono',
              'Fechas inicio/fin de contrato',
              'Monto de renta actual',
              'Historial de pagos / saldos pendientes',
            ]}
          />

          <Section
            icon={Bell}
            iconColor="text-cyan-400"
            iconBg="bg-cyan-400/10"
            title="Operaciones"
            items={[
              'Datos bancarios para instrucciones de pago',
            ]}
          />
        </div>

        <Section
          icon={Receipt}
          iconColor="text-purple-400"
          iconBg="bg-purple-400/10"
          title="Facturación (opcional — pueden mantener su flujo actual)"
          items={[
            'Flujo de emisión: factura a crédito (PPD) + complemento de pago, o factura directa al cobrar (PUE)?',
            'Régimen fiscal de la empresa (ej. 601 General de Ley PM)',
            'Uso de CFDI requerido por inquilinos (ej. G03 Gastos en general)',
            '¿La renta incluye IVA o se suma aparte? ¿A qué tasa?',
            '¿Manejan retenciones de ISR (10%) y/o IVA (10.66%) con inquilinos personas morales?',
            'Concepto y clave SAT para rentas (ej. 80131500 - Alquiler y arrendamiento)',
            '¿El concepto varía por tipo de espacio? (local, oficina, bodega)',
            '¿Facturan depósitos en garantía? ¿Con qué concepto?',
            'Cuenta predial de cada local (requerido por el SAT para arrendamiento)',
            'Método de pago habitual de los inquilinos (transferencia, cheque, etc.)',
          ]}
        />
      </div>

      <SlideFooter theme={theme} pageNum={1} totalPages={1} label="ardia.mx" />
    </SlideWrapper>
  )
}
