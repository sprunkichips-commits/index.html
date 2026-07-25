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

/** Доступен ли серверный режим: без initData сервер откажет в доступе. */
export function hasApiAuth(): boolean {
  return !!TG?.initData
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
      headers: {
        'X-Telegram-Init-Data': TG?.initData || '',
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })

    if (!res.ok) {
      let code: string | undefined
      let message = `HTTP ${res.status}`
      try {
        const err = (await res.json()) as { error?: string; message?: string }
        code = err.error
        message = err.message || err.error || message
      } catch {
        /* тело не JSON — оставляем общий текст */
      }
      if (res.status === 401) message = 'Telegram authorization failed'
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

export interface ApiStats {
  range: { from: string; to: string }
  totals: { incomeCents: number; expenseCents: number; netCents: number; income: number; expense: number; net: number }
  incomeSources: ApiCategoryStat[]
  expenseCategories: ApiCategoryStat[]
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

export const api = {
  health: () => request<{ ok: boolean; ts: number }>('/api/health'),

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
