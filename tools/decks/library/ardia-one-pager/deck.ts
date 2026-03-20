import type { Theme } from '../../engine/types'
import { CoverSlide } from './slides/01-cover'
import { FeaturesSlide } from './slides/02-features'
import { ResultsSlide } from './slides/03-results'

export const config = {
  title: 'Ardia One-Pager',
  project: 'ardia',
  description: 'Sales deck — pain, solution, CTA',
  theme: 'dark',
  dimensions: {
    width: 1080,
    height: 1528,
  },
  ctaLinks: [
    {
      selector: '[data-cta="true"]',
      url: 'https://calendly.com/axel-ardia/15-min-ardia-demo',
      page: 2,
    },
  ],
}

export const slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[] = [
  CoverSlide,
  FeaturesSlide,
  ResultsSlide,
]
