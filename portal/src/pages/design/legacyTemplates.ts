import type { ComponentType } from 'react'
import type { Theme } from '@decks/engine/types'

import { slides as onePagerSlides, config as onePagerConfig } from '@decks/library/ardia-one-pager/deck'
import { slides as cinukDesktopSlides, config as cinukDesktopConfig } from '@decks/library/ardia-cinuk-desktop/deck'
import { slides as cinukMobileSlides, config as cinukMobileConfig } from '@decks/library/ardia-cinuk-mobile/deck'
import { slides as onboardingRentalSlides, config as onboardingRentalConfig } from '@decks/library/ardia-onboarding-rental/deck'
import { slides as abanzaDesktopSlides, config as abanzaDesktopConfig } from '@decks/library/ardia-universo-abanza-desktop/deck'
import { slides as abanzaMobileSlides, config as abanzaMobileConfig } from '@decks/library/ardia-universo-abanza-mobile/deck'
import { slides as abanzaOnboardingSlides, config as abanzaOnboardingConfig } from '@decks/library/ardia-universo-abanza-onboarding/deck'

type SlideComponent = ComponentType<{ width: number; height: number; theme: Theme }>

export type LegacyDesignTemplate = {
  id: string
  slug: string
  title: string
  project: string
  organizationProject: string
  type: 'deck'
  sourceKind: 'legacy-code'
  description: string
  slideCount: number
  dimensions: string
  createdAt: string
  slides: SlideComponent[]
  config: typeof onePagerConfig
}

export const legacyDesignTemplates: LegacyDesignTemplate[] = [
  {
    id: 'legacy:ardia-one-pager',
    slug: 'ardia-one-pager',
    title: 'Ardia One-Pager',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Sales deck - 3 slides, pain to solution to CTA',
    slideCount: 3,
    dimensions: '1080 x 1528',
    createdAt: '2026-03-20',
    slides: onePagerSlides,
    config: onePagerConfig,
  },
  {
    id: 'legacy:ardia-cinuk-desktop',
    slug: 'ardia-cinuk-desktop',
    title: 'Ardia x CINUK (Desktop)',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Propuesta para CINUK - 16:9 landscape',
    slideCount: 8,
    dimensions: '1920 x 1080',
    createdAt: '2026-03-20',
    slides: cinukDesktopSlides,
    config: cinukDesktopConfig,
  },
  {
    id: 'legacy:ardia-cinuk-mobile',
    slug: 'ardia-cinuk-mobile',
    title: 'Ardia x CINUK (Mobile)',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Propuesta para CINUK - formato vertical movil',
    slideCount: 8,
    dimensions: '1080 x 1528',
    createdAt: '2026-03-20',
    slides: cinukMobileSlides,
    config: cinukMobileConfig,
  },
  {
    id: 'legacy:ardia-onboarding-rental',
    slug: 'ardia-onboarding-rental',
    title: 'Onboarding - Renta Comercial',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Checklist de informacion para implementar renta comercial',
    slideCount: 1,
    dimensions: '1080 x 1528',
    createdAt: '2026-04-01',
    slides: onboardingRentalSlides,
    config: onboardingRentalConfig,
  },
  {
    id: 'legacy:ardia-universo-abanza-desktop',
    slug: 'ardia-universo-abanza-desktop',
    title: 'Ardia x Universo aBanza (Desktop)',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Propuesta para Universo aBanza - 16:9 landscape',
    slideCount: 8,
    dimensions: '1920 x 1080',
    createdAt: '2026-04-10',
    slides: abanzaDesktopSlides,
    config: abanzaDesktopConfig,
  },
  {
    id: 'legacy:ardia-universo-abanza-mobile',
    slug: 'ardia-universo-abanza-mobile',
    title: 'Ardia x Universo aBanza (Mobile)',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Propuesta para Universo aBanza - formato vertical movil',
    slideCount: 8,
    dimensions: '1080 x 1528',
    createdAt: '2026-04-10',
    slides: abanzaMobileSlides,
    config: abanzaMobileConfig,
  },
  {
    id: 'legacy:ardia-universo-abanza-onboarding',
    slug: 'ardia-universo-abanza-onboarding',
    title: 'Onboarding - Universo aBanza',
    project: 'ardia',
    organizationProject: 'ardia',
    type: 'deck',
    sourceKind: 'legacy-code',
    description: 'Carga inicial del piloto - locales, contratos y cobranza',
    slideCount: 1,
    dimensions: '1080 x 1528',
    createdAt: '2026-04-30',
    slides: abanzaOnboardingSlides,
    config: abanzaOnboardingConfig,
  },
]
