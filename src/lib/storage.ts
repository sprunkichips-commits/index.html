// ===== Хранилище (перенос 1:1 по поведению из исходного index.html) =====
// Источник истины — CloudStorage Telegram; fallback — localStorage; затем память.
// Данные > 4096 байт бьются на чанки по 3500 (data_0, data_1, … + счётчик data_n).
import { TG } from './telegram'

export const KEY = 'pm-finance-v1' // localStorage: данные
export const TKEY = 'pm-finance-theme-v1' // localStorage: тема
export const PKEY = 'pm-finance-profile-v1' // localStorage: профиль (ник + аватар)
export const GKEY = 'pm-goals-v1' // localStorage: цели (шифруются автоключом)
export const CSKEY = 'pm-finance-chartstyle-v1' // localStorage: стиль графиков (classic | studio)
// CloudStorage: данные в чанках под именем "data" (data_0…/data_n), тема в "theme",
// профиль в чанках под именем "profile" (аватар не влезает в один ключ 4096).

const CHUNK = 3500
const prevN: Record<string, number> = {}

export function cloudGet(k: string): Promise<string | null> {
  return new Promise((res) => {
    try {
      TG!.CloudStorage!.getItem(k, (e, v) => res(e ? null : v || null))
    } catch {
      res(null)
    }
  })
}

export function cloudSet(k: string, v: string): Promise<boolean> {
  return new Promise((res) => {
    try {
      TG!.CloudStorage!.setItem(k, v, (e, ok) => res(!e && !!ok))
    } catch {
      res(false)
    }
  })
}

export function cloudRem(ks: string[]): Promise<boolean> {
  return new Promise((res) => {
    try {
      TG!.CloudStorage!.removeItems(ks, (e, ok) => res(!e && !!ok))
    } catch {
      res(false)
    }
  })
}

/**
 * Запись больших значений чанками. Возвращает true только если ВСЕ чанки и
 * счётчик записались — иначе false, чтобы вызывающий мог предупредить о
 * несинхронизированных данных (счётчик _n пишем последним: старая версия
 * останется целостной, если часть чанков не записалась).
 */
export async function bigSet(name: string, str: string): Promise<boolean> {
  const n = Math.max(1, Math.ceil(str.length / CHUNK))
  // Сколько чанков было раньше: из кэша сессии, иначе читаем старый счётчик.
  // Без этого при уменьшении данных в новой сессии хвостовые чанки оставались
  // в CloudStorage навсегда и потихоньку съедали лимит ключей Telegram (1024).
  let pn = prevN[name] || 0
  if (!pn) {
    const ns = await cloudGet(name + '_n')
    pn = (ns && parseInt(ns)) || 0
  }
  const ops: Promise<boolean>[] = []
  for (let i = 0; i < n; i++) ops.push(cloudSet(name + '_' + i, str.slice(i * CHUNK, (i + 1) * CHUNK)))
  const oks = await Promise.all(ops)
  if (!oks.every(Boolean)) return false
  if (!(await cloudSet(name + '_n', String(n)))) return false
  prevN[name] = n
  if (pn > n) {
    const rm: string[] = []
    for (let j = n; j < pn; j++) rm.push(name + '_' + j)
    // Уборка хвостов — не влияет на целостность, ошибку не считаем фатальной.
    if (rm.length) await cloudRem(rm)
  }
  return true
}

export function bigGet(name: string): Promise<string | null> {
  return cloudGet(name + '_n').then((ns) => {
    if (ns == null) return null
    const n = parseInt(ns) || 0
    const arr: Promise<string | null>[] = []
    for (let i = 0; i < n; i++) arr.push(cloudGet(name + '_' + i))
    return Promise.all(arr).then((parts) => {
      for (let j = 0; j < parts.length; j++) if (parts[j] == null) return null
      prevN[name] = n
      return parts.join('')
    })
  })
}

const mem: Record<string, string> = {}

export function sget(k: string): string | null {
  try {
    const v = localStorage.getItem(k)
    return v == null ? null : v
  } catch {
    return k in mem ? mem[k] : null
  }
}

/**
 * Запись в localStorage; false — место кончилось или доступ запрещён (значение
 * удержится в памяти только до закрытия страницы — вызывающий должен предупредить).
 */
export function sset(k: string, v: string): boolean {
  try {
    localStorage.setItem(k, v)
    return true
  } catch {
    mem[k] = v
    return false
  }
}

/**
 * Ежедневный автоснимок: перед ПЕРВЫМ изменением за день откладывает текущее
 * значение ключа в key+'-snap' ({d: дата, v: значение}). Даёт «вчерашнюю»
 * копию для восстановления после случайной очистки/порчи. Только локально —
 * ключи CloudStorage не тратим (основная облачная копия и так есть).
 */
export function dailySnapshot(key: string, todayStr: string): void {
  try {
    const cur = sget(key)
    if (cur == null) return
    const raw = sget(key + '-snap')
    if (raw) {
      const p = JSON.parse(raw) as { d?: string }
      if (p?.d === todayStr) return // сегодня уже откладывали
    }
    sset(key + '-snap', JSON.stringify({ d: todayStr, v: cur }))
  } catch {
    /* снимок — best effort, основную запись не блокируем */
  }
}

/** Читает автоснимок: дата и сохранённое значение, либо null. */
export function readSnapshot(key: string): { d: string; v: string } | null {
  try {
    const raw = sget(key + '-snap')
    if (!raw) return null
    const p = JSON.parse(raw) as { d?: unknown; v?: unknown }
    return typeof p?.d === 'string' && typeof p?.v === 'string' ? { d: p.d, v: p.v } : null
  } catch {
    return null
  }
}
