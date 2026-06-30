import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Глушим pinch-zoom (жесты двумя пальцами) на iOS/Telegram WebView, где
// viewport user-scalable=no часто игнорируется. Double-tap-zoom отключён через
// CSS touch-action: manipulation. Прокрутку и обычные касания не трогаем.
function lockPinchZoom() {
  const prevent = (e: Event) => e.preventDefault()
  document.addEventListener('gesturestart', prevent, { passive: false })
  document.addEventListener('gesturechange', prevent, { passive: false })
  document.addEventListener('gestureend', prevent, { passive: false })
  // Запасной путь для WebKit без gesture-событий: касание вторым пальцем.
  document.addEventListener(
    'touchmove',
    (e) => {
      if ((e as TouchEvent).touches.length > 1) e.preventDefault()
    },
    { passive: false },
  )
}
lockPinchZoom()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
