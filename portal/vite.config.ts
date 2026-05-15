import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@decks': path.resolve(__dirname, '../tools/decks'),
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
