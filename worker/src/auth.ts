// ===== Проверка подлинности Telegram Mini App (initData) =====
// Клиент присылает строку initData, которую выдал сам Telegram. Она подписана
// HMAC-SHA256 с ключом, выведенным из токена бота. Подделать подпись, не зная
// токена, нельзя — поэтому user_id из проверенной строки можно доверять и
// использовать как владельца данных.
//
// Алгоритм (документация Telegram):
//   secret_key = HMAC_SHA256(key: "WebAppData", data: <bot_token>)
//   hash       = HMAC_SHA256(key: secret_key,   data: <data_check_string>)
// где data_check_string — все поля кроме hash, отсортированные по ключу,
// в виде "k=v", склеенные через \n.

import type { MiddlewareHandler } from 'hono'

export interface TgUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

/** Максимальный возраст initData. Защита от повторного использования старой строки. */
const MAX_AGE_SECONDS = 24 * 60 * 60

const encoder = new TextEncoder()

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Сравнение за постоянное время — чтобы по скорости ответа нельзя было подбирать хэш. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface VerifyResult {
  ok: boolean
  user?: TgUser
  reason?: string
}

/** Проверяет initData и возвращает пользователя Telegram, если подпись верна. */
export async function verifyInitData(initData: string, botToken: string): Promise<VerifyResult> {
  if (!initData) return { ok: false, reason: 'no initData' }
  if (!botToken) return { ok: false, reason: 'server misconfigured: no bot token' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'no hash' }

  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = await hmacSha256(encoder.encode('WebAppData'), botToken)
  const expected = toHex(await hmacSha256(secretKey, dataCheckString))
  if (!timingSafeEqual(expected, hash)) return { ok: false, reason: 'bad signature' }

  // Свежесть: старая перехваченная строка не должна работать вечно.
  const authDate = Number(params.get('auth_date') || 0)
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'initData expired' }
  }

  try {
    const user = JSON.parse(params.get('user') || 'null') as TgUser | null
    if (!user || typeof user.id !== 'number') return { ok: false, reason: 'no user' }
    return { ok: true, user }
  } catch {
    return { ok: false, reason: 'bad user payload' }
  }
}

export interface AuthEnv {
  Bindings: { DB: D1Database; BOT_TOKEN: string; ALLOW_DEV_USER?: string }
  Variables: { userId: number; user: TgUser }
}

/**
 * Middleware: пускает дальше только запросы с валидным initData и кладёт
 * userId в контекст. Все запросы к данным обязаны фильтроваться по нему —
 * так пользователь физически не может увидеть чужие операции.
 *
 * initData принимаем в заголовке X-Telegram-Init-Data (не в URL: адреса
 * попадают в логи и историю, а initData — чувствительная строка).
 */
export const telegramAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const initData = c.req.header('X-Telegram-Init-Data') || ''
  const res = await verifyInitData(initData, c.env.BOT_TOKEN)

  if (!res.ok || !res.user) {
    // Локальная разработка: разрешаем фиктивного пользователя, только если это
    // явно включено переменной ALLOW_DEV_USER (в боевом окружении её нет).
    const devUser = c.env.ALLOW_DEV_USER
    if (devUser && /^\d+$/.test(devUser)) {
      c.set('userId', Number(devUser))
      c.set('user', { id: Number(devUser), first_name: 'Dev' })
      return next()
    }
    return c.json({ error: 'unauthorized', reason: res.reason }, 401)
  }

  c.set('userId', res.user.id)
  c.set('user', res.user)
  await next()
}
