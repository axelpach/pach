import type { Theme } from '../../engine/types'
import { ChecklistSlide } from './slides/01-checklist'

export const config = {
  title: 'Onboarding — Renta Comercial',
  project: 'ardia',
  description: 'Checklist de información para implementar cuenta de renta comercial',
  theme: 'dark',
  dimensions: {
    width: 1080,
    height: 1528,
  },
  ctaLinks: [],
}

export const slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[] = [
  ChecklistSlide,
]
