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

// ===== Вход на сайте (вне Telegram) =====
// В обычном браузере initData нет, поэтому используется Telegram Login Widget:
// пользователь жмёт «Войти через Telegram», Telegram присылает данные с подписью.
// Схема подписи отличается от initData: ключ = SHA256(токен бота), без "WebAppData".

const SESSION_DAYS = 30
export const SESSION_COOKIE = 'dengi_session'

async function sha256(data: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(data))
}

/** Проверяет данные Telegram Login Widget. */
export async function verifyLoginWidget(
  params: Record<string, string>,
  botToken: string,
): Promise<VerifyResult> {
  const hash = params.hash
  if (!hash) return { ok: false, reason: 'no hash' }
  if (!botToken) return { ok: false, reason: 'server misconfigured: no bot token' }

  const dataCheckString = Object.keys(params)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n')

  const secret = await sha256(botToken)
  const expected = toHex(await hmacSha256(new Uint8Array(secret), dataCheckString))
  if (!timingSafeEqual(expected, hash)) return { ok: false, reason: 'bad signature' }

  const authDate = Number(params.auth_date || 0)
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'login expired' }
  }
  const id = Number(params.id)
  if (!Number.isFinite(id)) return { ok: false, reason: 'no user id' }
  return { ok: true, user: { id, first_name: params.first_name, username: params.username } }
}

/** Подписанный маркер сессии: "userId.срок.подпись". Секрет — токен бота. */
export async function createSession(userId: number, botToken: string): Promise<string> {
  const payload = `${userId}.${Date.now() + SESSION_DAYS * 86400_000}`
  const sig = toHex(await hmacSha256(encoder.encode(botToken), payload))
  return `${payload}.${sig}`
}

/** Разбирает маркер сессии; возвращает id пользователя или null. */
export async function readSession(token: string, botToken: string): Promise<number | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || !botToken) return null
  const [idStr, expStr, sig] = parts
  const expected = toHex(await hmacSha256(encoder.encode(botToken), `${idStr}.${expStr}`))
  if (!timingSafeEqual(expected, sig)) return null
  if (!(Number(expStr) > Date.now())) return null
  const id = Number(idStr)
  return Number.isFinite(id) ? id : null
}

export function sessionCookie(token: string): string {
  // HttpOnly — недоступна скриптам (защита от кражи через XSS);
  // Secure + SameSite=Lax — не уходит на чужие сайты и только по HTTPS.
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`
}

export function readCookie(header: string | undefined, name: string): string {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}

export interface AuthEnv {
  Bindings: { DB: D1Database; BOT_TOKEN: string; BOT_USERNAME?: string; ALLOW_DEV_USER?: string }
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
/**
 * Достаёт initData из запроса. Основной заголовок — X-Telegram-Init-Data;
 * Authorization принимается как второй вариант (в том числе в виде
 * «tma <initData>» — так это оформляет официальный SDK Telegram).
 */
function readInitData(c: { req: { header: (k: string) => string | undefined } }): string {
  const direct = c.req.header('X-Telegram-Init-Data')
  if (direct) return direct
  const auth = c.req.header('Authorization') || ''
  if (/^tma\s+/i.test(auth)) return auth.replace(/^tma\s+/i, '')
  // Bearer/Basic — это не initData, такие схемы не трогаем.
  return /^(bearer|basic)\s/i.test(auth) ? '' : auth
}

export const telegramAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  // Способ 1: приложение внутри Telegram присылает подписанный initData.
  const initData = readInitData(c)
  const res = initData
    ? await verifyInitData(initData, c.env.BOT_TOKEN)
    : { ok: false as const, reason: 'no initData' }

  // Способ 2: сайт в обычном браузере — cookie сессии, выданная после входа
  // через Telegram Login Widget. Данные те же самые: владелец один и тот же
  // Telegram-аккаунт, поэтому и там и там виден один набор операций.
  if (!res.ok) {
    const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE)
    if (token) {
      const userId = await readSession(token, c.env.BOT_TOKEN)
      if (userId) {
        c.set('userId', userId)
        c.set('user', { id: userId })
        return next()
      }
    }
  }

  if (!res.ok || !res.user) {
    // Локальная разработка: разрешаем фиктивного пользователя, только если это
    // явно включено переменной ALLOW_DEV_USER (в боевом окружении её нет).
    const devUser = c.env.ALLOW_DEV_USER
    if (devUser && /^\d+$/.test(devUser)) {
      c.set('userId', Number(devUser))
      c.set('user', { id: Number(devUser), first_name: 'Dev' })
      return next()
    }
    // В логи — только причина отказа, без самой строки initData.
    console.log(
      'AUTH REJECTED',
      JSON.stringify({
        path: c.req.path,
        method: c.req.method,
        reason: res.reason,
        initDataLength: initData.length,
        botTokenConfigured: !!c.env.BOT_TOKEN,
        cookie: c.req.header('Cookie') ? 'present' : 'none',
      }),
    )
    return c.json({ error: 'unauthorized', reason: res.reason }, 401)
  }

  c.set('userId', res.user.id)
  c.set('user', res.user)
  await next()
}
