/**
 * Запрещает масштабирование страницы, чтобы Mini App вёл себя как нативное
 * приложение: без pinch-zoom, double-tap-zoom и зума с клавиатуры/колеса.
 * Прокрутка одним пальцем остаётся (см. также touch-action: pan-y в CSS).
 */
export function lockZoom(): void {
  if (typeof document === 'undefined') return
  const prevent = (e: Event) => e.preventDefault()

  // iOS Safari / WebKit — жесты масштабирования
  document.addEventListener('gesturestart', prevent, { passive: false })
  document.addEventListener('gesturechange', prevent, { passive: false })
  document.addEventListener('gestureend', prevent, { passive: false })

  // Pinch несколькими пальцами (Android и прочее) — режем, прокрутку одним пальцем не трогаем
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault()
    },
    { passive: false },
  )

  // Десктоп: Ctrl + колесо мыши
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault()
    },
    { passive: false },
  )

  // Десктоп: Ctrl/Cmd + (+ / - / = / 0)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault()
    }
  })
}
