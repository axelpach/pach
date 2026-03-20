import { useParams } from 'react-router-dom'
import { SlideRenderer } from '@decks/engine/SlideRenderer'
import { getTheme } from '@decks/engine/themes'

// Deck registry — maps slugs to their slide components + config.
// Later this will be dynamic (filesystem scan or DB lookup).
import { slides, config } from '@decks/library/ardia-one-pager/deck'

const deckRegistry: Record<string, { slides: typeof slides; config: typeof config }> = {
  'ardia-one-pager': { slides, config },
}

export default function DeckViewer() {
  const { slug } = useParams<{ slug: string }>()
  const deck = slug ? deckRegistry[slug] : null

  if (!deck) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/40">Deck not found.</p>
      </div>
    )
  }

  const theme = getTheme(deck.config.theme)

  return (
    <SlideRenderer
      slides={deck.slides}
      title={deck.config.title}
      description={`${deck.slides.length} slides · ${deck.config.dimensions.width} x ${deck.config.dimensions.height}px`}
      width={deck.config.dimensions.width}
      height={deck.config.dimensions.height}
      theme={theme}
      filename={slug!}
      ctaLinks={deck.config.ctaLinks}
    />
  )
}
