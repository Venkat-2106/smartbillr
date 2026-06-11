import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // ngrok URL removed — never commit tunnel URLs to the repo.
    // If you need ngrok locally, add it to a .env.local file (gitignored).
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
          'query-vendor':  ['@tanstack/react-query'],
          'form-vendor':   ['react-hook-form', 'zod', '@hookform/resolvers'],
          'ui-vendor':     ['@heroicons/react', 'react-hot-toast', 'clsx'],
        },
      },
    },
  },
})
