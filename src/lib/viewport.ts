// ===== Доступная область экрана =====
// Внутри Telegram на iOS появление клавиатуры НЕ меняет window.innerHeight и не
// меняет 100vh: видимая область уменьшается, а вёрстка об этом не узнаёт. Из-за
// этого шторка «New transaction» уезжала под шапку Telegram, её низ обрезался, а
// между шторкой и клавиатурой оставалась тёмная полоса.
//
// Модуль публикует в CSS две переменные и обновляет их на каждое изменение:
//   --app-vh — высота области, которую реально видно;
//   --kb     — сколько клавиатура закрывает снизу.
// Всё остальное (высоты, max-height, положение шторки) считается от них.
//
// Источники в порядке доверия:
//   1. visualViewport — единственный, кто на iOS знает про клавиатуру;
//   2. --tg-viewport-height / --tg-viewport-stable-height — их выставляет сам
//      Telegram, полезны там, где visualViewport отсутствует или врёт;
//   3. 100dvh в CSS — запасной вариант для обычного браузера.

import { TG } from './telegram'

function readPx(name: string): number | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function apply() {
  const root = document.documentElement
  const vv = window.visualViewport

  const tgHeight = readPx('--tg-viewport-height')
  const tgStable = readPx('--tg-viewport-stable-height')
  const layout = root.clientHeight || window.innerHeight

  // Берём НАИМЕНЬШУЮ из известных высот: любая из них может оказаться больше
  // реально видимой области, и тогда низ интерфейса уедет под клавиатуру.
  const known = [vv?.height, tgHeight].filter((n): n is number => !!n && n > 0)
  const usable = known.length ? Math.min(...known) : (tgStable ?? layout)

  // Насколько клавиатура перекрывает низ: разница между разметочной областью и
  // видимой, с поправкой на то, что iOS дополнительно сдвигает видимую область
  // вверх (offsetTop), когда прокручивает страницу к полю ввода.
  const covered = vv ? Math.max(0, layout - (vv.height + vv.offsetTop)) : 0

  root.style.setProperty('--app-vh', `${Math.round(usable)}px`)
  root.style.setProperty('--kb', `${Math.round(covered)}px`)

  // Нижняя безопасная зона (вырез/жестовая полоса). В Bot API 8.0 Telegram
  // отдаёт её сам; env() остаётся запасным вариантом в обычном браузере.
  const safeBottom = TG?.safeAreaInset?.bottom ?? 0
  root.style.setProperty('--tg-bottom', `${Math.max(0, safeBottom)}px`)
}

let started = false

/**
 * Запускает слежение за областью экрана. Вызывается один раз при старте;
 * повторные вызовы игнорируются.
 */
export function trackViewport() {
  if (started || typeof window === 'undefined') return
  started = true

  apply()

  // resize — появление и скрытие клавиатуры, поворот экрана.
  // scroll у visualViewport — iOS сдвигает видимую область, не меняя её высоты;
  // без этого шторка «отставала» от клавиатуры на пару десятков пикселей.
  window.visualViewport?.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('scroll', apply)
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)

  // Telegram сообщает о своих изменениях отдельно: разворачивание приложения,
  // полноэкранный режим, смена безопасных зон.
  TG?.onEvent?.('viewportChanged', apply)
  TG?.onEvent?.('safeAreaChanged', apply)
  TG?.onEvent?.('contentSafeAreaChanged', apply)

  // Значения --tg-viewport-* Telegram выставляет не мгновенно: пересчитываем
  // ещё раз, когда они точно уже есть.
  setTimeout(apply, 120)
  setTimeout(apply, 600)
}

/**
 * Подводит поле ввода под видимую область после появления клавиатуры.
 * Задержка нужна потому, что на iOS клавиатура выезжает анимацией, и до её
 * окончания visualViewport ещё не знает итоговой высоты.
 */
export function scrollIntoViewOnFocus(el: HTMLElement | null, delay = 260) {
  if (!el) return
  window.setTimeout(() => {
    apply()
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      el.scrollIntoView(false)
    }
  }, delay)
}
