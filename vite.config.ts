import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

// Версия сборки = короткий SHA коммита + дата. Показывается в Settings, чтобы
// всегда можно было проверить, какая сборка открыта (кэш Telegram/Pages
// задерживает обновления до ~10 минут).
function buildVersion(): string {
  let sha = 'dev'
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    /* вне git-репозитория */
  }
  return `${sha} · ${new Date().toISOString().slice(0, 10)}`
}

/**
 * База путей к ассетам зависит от хостинга:
 *   Cloudflare   — сайт отдаётся из корня домена: /            (по умолчанию)
 *   GitHub Pages — проект лежит в подпапке /index.html/        (задаётся явно)
 *
 * Если база не совпадает с хостингом, ссылки на JS/CSS ведут не туда, файлы
 * не находятся и открывается белый экран. Поэтому значение НЕ угадывается по
 * переменным окружения: по умолчанию корень, а старый хостинг закрепляет свой
 * путь сам — см. VITE_BASE в .github/workflows/deploy.yml.
 */
const BASE = process.env.VITE_BASE || '/'

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(buildVersion()) },
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
