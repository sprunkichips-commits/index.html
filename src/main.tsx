import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { lockZoom } from './lib/lockZoom'
import './index.css'

lockZoom()

// Регистрируем service worker: без него приложение не открывается без связи —
// его собственные файлы приходят из сети. Ошибка регистрации не критична,
// приложение просто останется онлайн-только.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* офлайн-режим недоступен — не повод падать */
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
