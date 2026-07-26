// ===== Клиент API «Деньги» (Cloudflare Worker) =====
// Слой доступа к серверу. Пока НЕ подключён к экранам — приложение продолжает
// работать на локальном хранилище. Переключение произойдёт отдельным шагом,
// после того как база создана и данные перенесены (см. worker/README.md).
//
// Авторизация: в каждый запрос кладём Telegram initData заголовком
// X-Telegram-Init-Data. Сервер проверяет подпись и сам определяет владельца —
// клиент не может назначить себе чужой user_id.

import { TG } from './telegram'

/** База API. Пустая строка = тот же origin (Worker отдаёт и статику, и /api). */
const API_BASE = ''

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Есть ли подпись Telegram прямо сейчас (приложение открыто внутри Telegram).
 * ВНИМАНИЕ: это НЕ полная проверка авторизации — на сайте её нет, а сессия
 * может быть. Для решения «можно ли обращаться к API» используйте resolveAuth().
 */
export function hasInitData(): boolean {
  return !!TG?.initData
}

export interface AuthInfo {
  authenticated: boolean
  userId?: number
  via?: 'telegram' | 'session'
}

/**
 * Полная проверка авторизации. Внутри Telegram отвечает сразу по initData;
 * в браузере спрашивает сервер про cookie-сессию (выданную после входа через
 * Telegram Login Widget). Раньше здесь проверялся только initData — поэтому
 * на сайте приложение вообще не обращалось к API и показывало «Guest» с нулями,
 * хотя сессия уже была выдана.
 */
export async function resolveAuth(): Promise<AuthInfo> {
  if (hasInitData()) return { authenticated: true, via: 'telegram' }
  try {
    const r = await request<AuthInfo>('/api/auth/me', { timeoutMs: 8000 })
    return r?.authenticated ? { ...r, via: r.via ?? 'session' } : { authenticated: false }
  } catch {
    return { authenticated: false }
  }
}

/**
 * Расшифровка 401 в понятный текст. Раньше здесь была одна строка
 * «Telegram authorization failed» на все случаи — по ней нельзя было понять,
 * что делать: перезапустить приложение, войти заново или дописать настройку
 * на сервере. Причину присылает сам сервер в поле reason.
 */
function authFailureText(reason?: string): string {
  const r = reason ?? ''
  if (r.includes('no bot token')) {
    return 'The server has no bot token yet (BOT_TOKEN), so it cannot check the Telegram signature.'
  }
  if (r.includes('bad signature')) {
    return 'Telegram signature does not match. Most likely the server holds a token of a different bot than the one this app is opened from.'
  }
  if (r.includes('expired')) {
    return 'The sign-in data has expired. Close the app and open it from the bot again.'
  }
  if (r.includes('no initData')) {
    return 'Not signed in. Open the app from the bot, or sign in with Telegram on the website.'
  }
  return 'Telegram authorization failed' + (r ? ` (${r})` : '')
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Таймаут запроса, мс. Мобильная сеть может «висеть» — не ждём вечно. */
  timeoutMs?: number
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = 15000 } = opts

  // Свой таймаут + внешняя отмена (например, размонтирование компонента).
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(API_BASE + path, {
      method,
      // credentials обязательны: без них cookie сессии не уедет и сайт получит
      // 401, даже если вход выполнен. API живёт на том же домене, поэтому
      // достаточно same-origin — сторонним сайтам cookie не отдаём.
      credentials: 'same-origin',
      headers: {
        // Подпись Telegram уходит двумя путями: свой заголовок и стандартный
        // Authorization в схеме «tma …». Некоторые прослойки вырезают
        // незнакомые заголовки — тогда сработает второй, и сервер примет любой.
        ...(TG?.initData
          ? {
              'X-Telegram-Init-Data': TG.initData,
              Authorization: `tma ${TG.initData}`,
            }
          : {}),
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })

    if (!res.ok) {
      let code: string | undefined
      let reason: string | undefined
      let message = `HTTP ${res.status}`
      try {
        const err = (await res.json()) as { error?: string; message?: string; reason?: string }
        code = err.error
        reason = err.reason
        message = err.message || err.error || message
      } catch {
        /* тело не JSON — оставляем общий текст */
      }
      if (res.status === 401) message = authFailureText(reason)
      // GitHub Pages отдаёт только файлы и на любой POST отвечает 405. Значит
      // приложение открыто со старого адреса, а не с Cloudflare — говорим это
      // прямо, иначе пользователь видит голый код ошибки и не понимает причину.
      if (res.status === 405) {
        message = `This copy of the app is opened from the old address (${location.host}) and cannot save to the cloud. Open it from the Cloudflare address.`
        code = 'wrong_host'
      }
      throw new ApiError(message, res.status, code)
    }

    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('Request timed out', 0, 'timeout')
    }
    throw new ApiError('Network error', 0, 'network')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// ---------- Типы ответов ----------

export interface ApiCategory {
  id: string
  name: string
  kind: 'income' | 'expense'
  color: string | null
  icon: string | null
}

export interface ApiSubCategory {
  id: string
  parentId: string
  name: string
}

export interface ApiTransaction {
  id: string
  date: string
  type: 'income' | 'expense'
  categoryId: string
  subCategoryId: string | null
  amountCents: number
  amount: number
  transit: boolean
  payer: string | null
  note: string | null
  createdAt: number
}

export interface ApiCategoryStat {
  categoryId: string
  name: string
  color: string | null
  icon: string | null
  totalCents: number
  total: number
  percent: number
}

/** Транзит: деньги, прошедшие насквозь. Отдельно от expenseCategories —
 *  в тратах и процентах их нет. */
export interface ApiTransfers {
  receivedCents: number
  passedOnCents: number
  keptCents: number
  /** Передано сверх полученного: настоящая трата, уже учтённая в категориях. */
  ownMoneyCents: number
  received: number
  passedOn: number
  kept: number
  ownMoney: number
  items: (ApiCategoryStat & { total: number })[]
}

export interface ApiStats {
  range: { from: string; to: string }
  totals: { incomeCents: number; expenseCents: number; netCents: number; income: number; expense: number; net: number }
  incomeSources: ApiCategoryStat[]
  expenseCategories: ApiCategoryStat[]
  transfers: ApiTransfers
}

export interface ApiSubCategoryStats {
  categoryId: string
  totalCents: number
  total: number
  items: { subcategoryId: string | null; name: string; totalCents: number; total: number; percent: number }[]
}

export interface NewTransaction {
  date: string
  type: 'income' | 'expense'
  categoryId: string
  subCategoryId?: string | null
  /** Сумма в рублях; на сервере переводится в копейки. */
  amount: number
  transit?: boolean
  payer?: string
  note?: string
}

/** Период: либо явные даты, либо год+месяц (месяц 1–12). */
export type Period = { from: string; to: string } | { year: number; month: number }

function periodQuery(p?: Period): string {
  if (!p) return ''
  const q =
    'from' in p
      ? new URLSearchParams({ from: p.from, to: p.to })
      : new URLSearchParams({ year: String(p.year), month: String(p.month) })
  return '?' + q.toString()
}

// ---------- Методы ----------

/** Счётчики переноса. duplicates — «уже было в базе» (повторная отправка). */
export interface ImportCounts {
  imported: number
  duplicates: number
  skipped: number
}

/** Отчёт переноса: сколько записей ушло в базу, сколько уже было, сколько пропущено. */
export interface ImportReport {
  transactions: ImportCounts
  goals: ImportCounts
  tasks: ImportCounts
  taskLog: ImportCounts
  profile: boolean
  warnings: string[]
}

export const api = {
  /** Публичные настройки сервера (имя бота для кнопки входа). */
  config: () => request<{ botUsername: string }>('/api/config'),

  health: () =>
    request<{
      ok: boolean
      ts: number
      database?: string
      botToken?: 'configured' | 'missing'
      botUsername?: 'configured' | 'missing'
    }>('/api/health'),

  /** Переносит бэкап (финансы + цели) в облако. Повторный вызов не дублирует. */
  importBackup: (payload: unknown) =>
    request<ImportReport>('/api/import', { method: 'POST', body: payload, timeoutMs: 60000 }),

  categories: (signal?: AbortSignal) =>
    request<{ categories: ApiCategory[]; subcategories: ApiSubCategory[] }>('/api/categories', { signal }),

  transactions: (period?: Period, signal?: AbortSignal) =>
    request<{ items: ApiTransaction[] }>('/api/transactions' + periodQuery(period), { signal }),

  addTransaction: (tx: NewTransaction) =>
    request<ApiTransaction>('/api/transactions', { method: 'POST', body: tx }),

  deleteTransaction: (id: string) =>
    request<{ ok: true }>(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  stats: (period?: Period, signal?: AbortSignal) =>
    request<ApiStats>('/api/stats' + periodQuery(period), { signal }),

  subCategoryStats: (categoryId: string, period?: Period, signal?: AbortSignal) => {
    const q = periodQuery(period)
    const sep = q ? '&' : '?'
    return request<ApiSubCategoryStats>(
      `/api/stats/subcategories${q}${sep}categoryId=${encodeURIComponent(categoryId)}`,
      { signal },
    )
  },

  monthly: (year: number, signal?: AbortSignal) =>
    request<{ year: number; months: { month: number; income: number; expense: number }[] }>(
      `/api/stats/monthly?year=${year}`,
      { signal },
    ),
}
