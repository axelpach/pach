import { Link } from 'react-router-dom'
import { Presentation, ArrowRight } from 'lucide-react'

// For now, deck registry is static. Later this will come from the DB.
const decks = [
  {
    slug: 'ardia-one-pager',
    title: 'Ardia One-Pager',
    project: 'ardia',
    description: 'Sales deck — 3 slides, pain → solution → CTA',
    slideCount: 3,
    dimensions: '1080 x 1528',
    createdAt: '2026-03-20',
  },
]

export default function Decks() {
  return (
    <div className="flex-1 p-8">
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Decks</h1>
          <p className="text-white/40 text-sm mt-1">
            Presentations generated with code. Preview, edit, and download as PDF.
          </p>
        </div>

        <div className="grid gap-4">
          {decks.map((deck) => (
            <Link
              key={deck.slug}
              to={`/decks/${deck.slug}`}
              className="flex items-center gap-5 p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-[#F13D43]/10 flex items-center justify-center shrink-0">
                <Presentation className="w-6 h-6 text-[#F13D43]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">{deck.title}</span>
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[11px] text-white/40 font-medium">
                    {deck.project}
                  </span>
                </div>
                <div className="text-sm text-white/40 mt-1">{deck.description}</div>
                <div className="text-xs text-white/25 mt-1">
                  {deck.slideCount} slides · {deck.dimensions}px · {deck.createdAt}
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors" />
            </Link>
          ))}
        </div>

        {decks.length === 0 && (
          <div className="text-center py-20">
            <Presentation className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No decks yet.</p>
            <p className="text-white/25 text-sm mt-1">
              Use Claude Code to generate your first deck.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
