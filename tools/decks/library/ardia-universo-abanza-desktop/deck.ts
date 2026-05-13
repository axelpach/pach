import type { Theme } from '../../engine/types'
import { CoverSlide } from './slides/01-cover'
import { ProblemSlide } from './slides/02-problem'
import { CobranzaEngineSlide } from './slides/03-cobranza-engine'
import { CobranzaDetailSlide } from './slides/04-cobranza-detail'
import { PlatformSlide } from './slides/05-platform'
import { ResultsSlide } from './slides/06-results'
import { PricingSlide } from './slides/07-pricing'
import { CTASlide } from './slides/08-cta'

export const config = {
  title: 'Ardia × Universo aBanza (Desktop)',
  project: 'ardia',
  description: 'Propuesta de cobranza automatizada para Universo aBanza — desktop',
  theme: 'dark',
  dimensions: { width: 1920, height: 1080 },
  ctaLinks: [
    { selector: '[data-cta="true"]', url: 'https://calendly.com/axel-ardia/15-min-ardia-demo', page: 7 },
  ],
}

export const slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[] = [
  CoverSlide, ProblemSlide, CobranzaEngineSlide, CobranzaDetailSlide,
  PlatformSlide, ResultsSlide, PricingSlide, CTASlide,
]
