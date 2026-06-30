// ===== Шифрование данных целей (Web Crypto) =====
// AES-GCM (256-бит) + ключ из PIN через PBKDF2-SHA256 (150 000 итераций).
// Никакой внешней сети — всё считается локально в браузере. Соль и IV хранятся
// рядом с шифротекстом (это не секреты). Без правильного PIN расшифровать нельзя,
// а подмена шифротекста ловится тегом аутентичности AES-GCM (decrypt бросит ошибку).

const PBKDF2_ITERS = 150_000
const enc = new TextEncoder()
const dec = new TextDecoder()

export function hasCrypto(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function'
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH))
  }
  return btoa(s)
}

function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomSaltB64(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

// Постоянная соль приложения (не секрет). Секретность ключа держится на
// идентификаторе пользователя Telegram (у каждого свой), а не на этой строке.
const STATIC_SALT_B64 = 'Z29hbHMtc2FsdC0wMDAwMQ=='

/**
 * Автоматический ключ «в коде»: выводится из идентификатора пользователя — без
 * пароля и без ввода. Даёт прозрачное шифрование данных на диске: в хранилище
 * лежит только шифротекст. Это защита от прямого вытаскивания/чтения данных, а не
 * пароль (исходник публичный) — поэтому пишем об этом честно в README.
 */
export async function deriveAutoKey(userSecret: string): Promise<CryptoKey> {
  return deriveKey('pmg:v1:' + userSecret, STATIC_SALT_B64)
}

/** Выводит AES-ключ из PIN и соли (base64). */
export async function deriveKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBuf(saltB64), iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Шифрует объект → строка вида "iv.ciphertext" (обе части base64). */
export async function encryptJSON(obj: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)))
  return bufToB64(iv.buffer) + '.' + bufToB64(ct)
}

/** Расшифровывает строку "iv.ciphertext". Бросает ошибку при неверном ключе/подмене. */
export async function decryptJSON(payload: string, key: CryptoKey): Promise<unknown> {
  const dot = payload.indexOf('.')
  if (dot < 0) throw new Error('bad payload')
  const iv = b64ToBuf(payload.slice(0, dot))
  const ct = b64ToBuf(payload.slice(dot + 1))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return JSON.parse(dec.decode(pt))
}
