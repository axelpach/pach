import type { Theme } from '../../engine/types'
import { OnboardingSlide } from './slides/01-onboarding'

export const config = {
  title: 'Onboarding — Universo aBanza',
  project: 'ardia',
  description: 'Carga inicial del piloto Ardia × Universo aBanza — renta comercial',
  theme: 'dark',
  dimensions: { width: 1080, height: 1528 },
  ctaLinks: [],
}

export const slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[] = [
  OnboardingSlide,
]
