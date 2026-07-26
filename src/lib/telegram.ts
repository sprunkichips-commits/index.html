// ===== Telegram Mini App =====
// Модуль остаётся ЕДИНСТВЕННОЙ точкой соприкосновения с Telegram: остальной код
// работает через эти функции и не знает, что под ними.
//
// Внутри уживаются два источника:
//   - @telegram-apps/sdk — официальный SDK. Через него идут инициализация,
//     разворачивание вьюпорта, CSS-переменные окружения и тактильный отклик:
//     там он даёт проверки поддержки и корректно работает на всех клиентах.
//   - window.Telegram.WebApp — прежний путь для CloudStorage, initData и
//     попапов. Переносить их на SDK намеренно НЕ стали: на CloudStorage завязан
//     предохранитель от потери истории операций, а на initData — авторизация;
//     обе цепочки проверены и работают, а переписывание ради единообразия
//     рисковало бы настоящими данными. Причина техническая, а не «не успели».
// SDK подключается динамическим импортом: в первый кадр он не нужен, а весит
// ощутимо (≈17 кБ gzip). Загружается сразу после старта, задолго до первого
// касания, поэтому вибрация успевает стать доступной.
type Sdk = typeof import('@telegram-apps/sdk')

import { trackViewport } from './viewport'
export interface TgUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}
export interface TgCloudStorage {
  getItem: (key: string, cb: (err: unknown, value?: string) => void) => void
  setItem: (key: string, value: string, cb: (err: unknown, ok?: boolean) => void) => void
  removeItems: (keys: string[], cb: (err: unknown, ok?: boolean) => void) => void
}
export interface TgWebApp {
  ready: () => void
  expand: () => void
  initData: string
  initDataUnsafe?: { user?: TgUser }
  colorScheme?: 'light' | 'dark'
  CloudStorage?: TgCloudStorage
  /** Отступы системных элементов экрана (статус-бар, вырез камеры). Bot API 8.0+. */
  safeAreaInset?: { top: number; bottom: number; left: number; right: number }
  /** Отступы элементов самого Telegram (кнопки «Закрыть», «…»). Bot API 8.0+. */
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number }
  showConfirm?: (message: string, callback: (confirmed: boolean) => void) => void
  showAlert?: (message: string, callback?: () => void) => void
  setBackgroundColor?: (color: string) => void
  setHeaderColor?: (color: string) => void
  onEvent?: (event: string, cb: () => void) => void
  /** Версия Bot API, поддерживаемая клиентом («7.10», «8.0»). */
  version?: string
  /** Полноэкранный режим, Bot API 8.0+. На старых клиентах отсутствует. */
  requestFullscreen?: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

export const TG: TgWebApp | null =
  (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null

/**
 * Мягкий клиентский UX-замок. ЭТО НЕ авторизация: его можно обойти, открыв
 * страницу вне Telegram или поправив код в браузере. Реальная приватность —
 * в том, что CloudStorage у каждого пользователя Telegram свой, чужой не увидит
 * твои данные. Настоящая проверка доступа требует валидации подписи initData на
 * бэкенде — для статического файла на GitHub Pages это вне рамок.
 * 0 = без замка. Впиши свой Telegram ID (число), чтобы открыть только себе.
 */
export const OWNER_ID = 0

export const hasCloud = !!(TG && TG.initData && TG.CloudStorage)

export const tgUser: TgUser | null = (() => {
  try {
    return (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) || null
  } catch {
    return null
  }
})()

export const tgUserId: number | null = tgUser ? tgUser.id : null

/**
 * Прокидывает отступы безопасных зон Telegram в CSS-переменную --tg-top.
 *
 * В полноэкранном режиме сверху накладываются две вещи: системные элементы
 * телефона (статус-бар, вырез) и кнопки самого Telegram («Закрыть», «…»).
 * Полагаться только на CSS env(safe-area-inset-top) нельзя — он знает про вырез,
 * но не про кнопки Telegram, из-за чего шапка приложения уезжала под них.
 * Значения приходят из API и обновляются при повороте экрана.
 */
function applySafeArea() {
  if (!TG) return
  try {
    const sys = TG.safeAreaInset?.top ?? 0
    const content = TG.contentSafeAreaInset?.top ?? 0
    // Отступы складываются: сначала системная зона, внутри неё — кнопки Telegram.
    const top = Math.max(0, sys + content)
    document.documentElement.style.setProperty('--tg-top', `${top}px`)
  } catch {
    /* noop */
  }
}

/** Загруженный SDK. null — ещё не приехал, вне Telegram или не поддерживается. */
let sdk: Sdk | null = null

function loadSdk() {
  void import('@telegram-apps/sdk')
    .then((mod) => {
      // isTMA() отсеивает обычный браузер, где инициализация не имеет смысла.
      if (!mod.isTMA()) return
      mod.init()
      sdk = mod
    })
    .catch(() => {
      /* старый клиент или окружение без поддержки — работаем без SDK */
    })
}

/** Сравнение версий Bot API вида «8.0»: есть ли у клиента нужный минимум. */
function versionAtLeast(min: string): boolean {
  const have = String(TG?.version ?? '0').split('.').map(Number)
  const need = min.split('.').map(Number)
  for (let i = 0; i < Math.max(have.length, need.length); i++) {
    const a = have[i] || 0
    const b = need[i] || 0
    if (a !== b) return a > b
  }
  return true
}

export function tgReady() {
  loadSdk()
  // Слежение за видимой областью запускаем до всего остального: от неё зависят
  // высоты, и лучше выставить переменные раньше первой отрисовки.
  trackViewport()

  if (!TG) return
  try {
    TG.ready()
    // expand() и вьюпорт оставлены на WebApp: SDK-версия требует асинхронного
    // монтирования компонента, и до его завершения окно успевало моргнуть
    // в свёрнутом виде. Здесь разворачивание происходит сразу.
    TG.expand()
    applySafeArea()
    // Значения приходят асинхронно и меняются при повороте/разворачивании.
    TG.onEvent?.('safeAreaChanged', applySafeArea)
    TG.onEvent?.('contentSafeAreaChanged', applySafeArea)
    TG.onEvent?.('viewportChanged', applySafeArea)

    // Полноэкранный режим появился в Bot API 8.0. На старых клиентах метода
    // просто нет — проверяем версию И оборачиваем в try/catch: клиент может
    // отдать версию, но отказать в самом вызове.
    if (versionAtLeast('8.0') && typeof TG.requestFullscreen === 'function') {
      try {
        TG.requestFullscreen()
      } catch {
        /* клиент не поддерживает — остаёмся в обычном режиме */
      }
    }
  } catch {
    /* noop */
  }
}

// ===== Тактильный отклик =====
// Короткая вибрация под пальцем — то, чем нативное приложение отличается от
// сайта: действие подтверждается ощущением, а не только картинкой. Вне Telegram
// и на клиентах без поддержки функции просто ничего не делают, поэтому вызывать
// их можно откуда угодно без проверок.

function haptic(fn: (s: Sdk) => void) {
  if (!sdk) return
  try {
    fn(sdk)
  } catch {
    /* клиент не поддерживает вибрацию — это не повод ломать действие */
  }
}

/** Лёгкий отклик: переключатели, выбор варианта. */
export function tgImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  haptic((s) => s.hapticFeedbackImpactOccurred(style))
}

/** Итог операции: получилось, не получилось, предупреждение. */
export function tgNotify(type: 'success' | 'error' | 'warning') {
  haptic((s) => s.hapticFeedbackNotificationOccurred(type))
}

/** Перебор элементов: вкладки, прокрутка выбора. Ощущается слабее impact. */
export function tgSelection() {
  haptic((s) => s.hapticFeedbackSelectionChanged())
}

/**
 * Подтверждение действия. В Telegram — нативный попап showConfirm, вне
 * Telegram (или на старом клиенте) — обычный window.confirm. Возвращает true,
 * если пользователь подтвердил. Используется перед необратимыми действиями.
 */
export function tgConfirm(message: string): Promise<boolean> {
  if (TG && typeof TG.showConfirm === 'function') {
    return new Promise((resolve) => {
      try {
        TG.showConfirm!(message, (ok) => resolve(!!ok))
      } catch {
        resolve(safeWindowConfirm(message))
      }
    })
  }
  return Promise.resolve(safeWindowConfirm(message))
}

/**
 * Показать сообщение попапом. Нужно потому, что внутри Telegram нет консоли
 * разработчика: ошибка сети или отказ сервера иначе видны только как тост
 * «не сохранилось», без причины. showAlert — нативный попап Telegram
 * (Bot API 6.2+), window.alert — запас для старых клиентов и браузера.
 */
export function tgAlert(message: string): void {
  if (TG && typeof TG.showAlert === 'function') {
    try {
      TG.showAlert(message)
      return
    } catch {
      /* старый клиент — падаем в window.alert */
    }
  }
  try {
    window.alert(message)
  } catch {
    /* некуда показать — молча, ронять приложение из-за сообщения нельзя */
  }
}

function safeWindowConfirm(message: string): boolean {
  try {
    return window.confirm(message)
  } catch {
    return false // не смогли спросить — безопаснее НЕ выполнять необратимое
  }
}

export function tgPaintColors(bgHex: string) {
  if (!TG || !bgHex) return
  try {
    TG.setBackgroundColor && TG.setBackgroundColor(bgHex)
    TG.setHeaderColor && TG.setHeaderColor(bgHex)
  } catch {
    /* noop */
  }
}
