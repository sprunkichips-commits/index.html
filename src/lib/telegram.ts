// ===== Telegram Mini App SDK =====
// Подключается через <script src="telegram-web-app.js"> в index.html.
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
  HapticFeedback?: { impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void }
  setBackgroundColor?: (color: string) => void
  setHeaderColor?: (color: string) => void
  onEvent?: (event: string, cb: () => void) => void
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

export function tgReady() {
  if (!TG) return
  try {
    TG.ready()
    TG.expand()
  } catch {
    /* noop */
  }
}

/** Лёгкий тактильный отклик (нативная вибро-отдача Telegram); вне TG — no-op. */
export function tgHaptic() {
  try {
    TG?.HapticFeedback?.impactOccurred?.('light')
  } catch {
    /* noop */
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
