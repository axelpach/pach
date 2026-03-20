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
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'pachi': {
          red: '#F13D43',
        },
        'ardia-red': '#F13D43',
      },
    },
  },
  plugins: [],
} satisfies Config
