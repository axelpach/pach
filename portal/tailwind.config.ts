import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../tools/decks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        void: '#000000',
        pit: '#050605',
        'pit-2': '#0a0e0c',
        'pit-3': '#141a17',
        rim: '#1c2620',
        phosphor: '#00ff88',
        'phosphor-soft': '#22cc77',
        'phosphor-deep': '#0e6638',
        amber: '#ffb547',
        fault: '#ff4d6d',
        'pach-info': '#5ad6ff',
        'fg-1': '#cffbe1',
        'fg-2': '#9bd9b3',
        'fg-3': '#5a8a72',
        'fg-4': '#2e4a3c',
        'bg-0': '#000000',
        'bg-1': '#050605',
        'bg-2': '#0a0e0c',
        'bg-3': '#141a17',
        'bg-input': '#1c2620',
        accent: '#00ff88',
        'accent-soft': '#22cc77',
        'accent-deep': '#0e6638',
        ok: '#00ff88',
        warn: '#ffb547',
        fail: '#ff4d6d',
        // legacy aliases (decks library still imports these)
        'pach': { red: '#00ff88' },
        'ardia-red': '#F13D43',
      },
      letterSpacing: {
        'label': '0.18em',
        'wide-2': '0.25em',
      },
      boxShadow: {
        'glow-xs': '0 0 6px rgba(0,255,136,0.25)',
        'glow-sm': '0 0 12px rgba(0,255,136,0.35)',
        'glow-md': '0 0 24px rgba(0,255,136,0.45), 0 0 2px rgba(0,255,136,0.9)',
        'glow-lg': '0 0 48px rgba(0,255,136,0.55), 0 0 4px rgba(0,255,136,1)',
        'glow-amber': '0 0 18px rgba(255,181,71,0.4)',
        'glow-fault': '0 0 18px rgba(255,77,109,0.5)',
      },
      animation: {
        'blink': 'pach-blink 1s steps(2,end) infinite',
        'pulse-pach': 'pach-pulse 1.6s ease-in-out infinite',
      },
      keyframes: {
        'pach-blink': { '0%,50%': { opacity: '1' }, '51%,100%': { opacity: '0' } },
        'pach-pulse': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
    },
  },
  plugins: [],
} satisfies Config
