import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// base must match the GitHub Pages project subpath: https://<user>.github.io/index.html/
export default defineConfig({
  base: '/index.html/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Без инлайн-полифилла modulepreload — чтобы CSP script-src был строгим ('self'),
    // без 'unsafe-inline'. Telegram WebView — современный Chromium/WebKit, polyfill не нужен.
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // recharts + d3 — тяжёлый и редко меняется: отдельным чанком для кэша
            if (/[\\/]node_modules[\\/](recharts|d3-|victory-vendor|internmap)/.test(id)) return 'recharts'
            return 'vendor'
          }
        },
      },
    },
  },
})
