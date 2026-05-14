import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// Static deck registry until decks are read from DB.
const decks = [
  { slug: 'ardia-one-pager', title: 'Ardia One-Pager', project: 'ardia', description: 'Sales deck — 3 slides, pain → solution → CTA', slideCount: 3, dimensions: '1080 x 1528', createdAt: '2026-03-20' },
  { slug: 'ardia-cinuk-desktop', title: 'Ardia × CINUK (Desktop)', project: 'ardia', description: 'Propuesta para CINUK — 16:9 landscape, texto grande', slideCount: 8, dimensions: '1920 x 1080', createdAt: '2026-03-20' },
  { slug: 'ardia-cinuk-mobile', title: 'Ardia × CINUK (Mobile)', project: 'ardia', description: 'Propuesta para CINUK — formato vertical para móvil', slideCount: 8, dimensions: '1080 x 1528', createdAt: '2026-03-20' },
  { slug: 'ardia-onboarding-rental', title: 'Onboarding — Renta Comercial', project: 'ardia', description: 'Checklist de información para implementar cuenta de renta comercial', slideCount: 1, dimensions: '1080 x 1528', createdAt: '2026-04-01' },
  { slug: 'ardia-universo-abanza-desktop', title: 'Ardia × Universo aBanza (Desktop)', project: 'ardia', description: 'Propuesta para Universo aBanza — 16:9 landscape, texto grande', slideCount: 8, dimensions: '1920 x 1080', createdAt: '2026-04-10' },
  { slug: 'ardia-universo-abanza-mobile', title: 'Ardia × Universo aBanza (Mobile)', project: 'ardia', description: 'Propuesta para Universo aBanza — formato vertical para móvil', slideCount: 8, dimensions: '1080 x 1528', createdAt: '2026-04-10' },
  { slug: 'ardia-universo-abanza-onboarding', title: 'Onboarding — Universo aBanza', project: 'ardia', description: 'Carga inicial del piloto — locales, contratos y cobranza', slideCount: 1, dimensions: '1080 x 1528', createdAt: '2026-04-30' },
]

export default function Decks() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-8 py-7">
      <div className="max-w-4xl">
        <div className="mb-7">
          <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1.5">◊ decks · library</div>
          <h1 className="font-mono text-2xl font-bold text-fg-1 lowercase">decks</h1>
          <p className="text-sm text-fg-3 mt-1">
            <span className="text-fg-4">›</span> presentations rendered from code · {decks.length} on file
          </p>
        </div>

        <div className="border-t border-[rgba(0,255,140,0.10)]">
          {decks.map((deck) => (
            <Link
              key={deck.slug}
              to={`/decks/${deck.slug}`}
              className="group flex items-center gap-4 px-3 py-3.5 border-b border-[rgba(0,255,140,0.10)] hover:bg-[rgba(0,255,136,0.03)] hover:border-strong transition-colors"
            >
              <span className="text-fg-4 group-hover:text-accent transition-colors text-sm">▸</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-semibold text-fg-1 lowercase">{deck.title}</span>
                  <span className="px-1.5 py-0 border border-[rgba(0,255,140,0.15)] text-[9px] uppercase tracking-label text-fg-3">
                    {deck.project}
                  </span>
                </div>
                <div className="text-sm text-fg-3 mt-1">
                  <span className="text-fg-4">› </span>
                  {deck.description}
                </div>
                <div className="text-[10px] uppercase tracking-label text-fg-4 mt-1">
                  {deck.slideCount} slides · {deck.dimensions} · {deck.createdAt}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-fg-4 group-hover:text-accent transition-colors" />
            </Link>
          ))}
        </div>

        {decks.length === 0 && (
          <div className="text-center py-20 text-fg-3 font-mono text-sm">
            <span className="text-fg-4">// </span>no decks yet
          </div>
        )}
      </div>
    </div>
  )
}
