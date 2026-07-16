import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [react(), process.env.ANALYZE === 'true' && visualizer({ open: true, filename: 'dist/stats.html' })].filter(Boolean),
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'react-vendor'
          if (id.includes('node_modules/@tanstack/react-query')) return 'query-vendor'
          if (id.includes('node_modules/react-hook-form') || id.includes('node_modules/@hookform') || id.includes('node_modules/zod')) return 'form-vendor'
          if (id.includes('node_modules/react-hot-toast') || id.includes('node_modules/@heroicons')) return 'ui-vendor'
        },
      },
    },
  },
})
