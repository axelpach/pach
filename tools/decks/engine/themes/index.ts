import type { Theme } from '../types'

export const dark: Theme = {
  name: 'dark',
  bg: '#0C0C0F',
  textPrimary: 'text-white',
  textSecondary: 'text-white/60',
  textMuted: 'text-white/40',
  accent: '#F13D43',
  accentBg: 'bg-[#F13D43]',
  cardBg: 'bg-white/[0.02]',
  cardBorder: 'border-white/[0.06]',
  glowColor: 'rgba(241, 61, 67, 0.15)',
  glowOpacity: 0.15,
}

export const light: Theme = {
  name: 'light',
  bg: '#FAFAFA',
  textPrimary: 'text-gray-900',
  textSecondary: 'text-gray-600',
  textMuted: 'text-gray-400',
  accent: '#F13D43',
  accentBg: 'bg-[#F13D43]',
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  glowColor: 'rgba(241, 61, 67, 0.08)',
  glowOpacity: 0.08,
}

export const neutral: Theme = {
  name: 'neutral',
  bg: '#1A1A2E',
  textPrimary: 'text-white',
  textSecondary: 'text-white/60',
  textMuted: 'text-white/40',
  accent: '#4F46E5',
  accentBg: 'bg-indigo-600',
  cardBg: 'bg-white/[0.03]',
  cardBorder: 'border-white/[0.08]',
  glowColor: 'rgba(79, 70, 229, 0.15)',
  glowOpacity: 0.15,
}

export const themes: Record<string, Theme> = { dark, light, neutral }

export function getTheme(name: string): Theme {
  return themes[name] || dark
}
