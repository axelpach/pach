import type { ComponentType } from 'react'

export interface DeckConfig {
  title: string
  project: string
  description?: string
  theme: string
  slides: string[] // ordered list of slide file names (without extension)
  dimensions: {
    width: number
    height: number
  }
  metadata?: Record<string, unknown>
}

export interface SlideProps {
  width: number
  height: number
  theme: Theme
}

export interface Theme {
  name: string
  bg: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accent: string
  accentBg: string
  cardBg: string
  cardBorder: string
  glowColor: string
  glowOpacity: number
}

export interface SlideComponent {
  component: ComponentType<SlideProps>
  name: string
}

export interface ExportOptions {
  format: 'pdf' | 'png'
  pixelRatio?: number
  quality?: number
  /** For PDF: add clickable links */
  links?: Array<{
    selector: string
    url: string
    page: number
  }>
}
