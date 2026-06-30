// ===== Хранилище (перенос 1:1 по поведению из исходного index.html) =====
// Источник истины — CloudStorage Telegram; fallback — localStorage; затем память.
// Данные > 4096 байт бьются на чанки по 3500 (data_0, data_1, … + счётчик data_n).
import { TG } from './telegram'

export const KEY = 'pm-finance-v1' // localStorage: данные
export const TKEY = 'pm-finance-theme-v1' // localStorage: тема
export const PKEY = 'pm-finance-profile-v1' // localStorage: профиль (ник + аватар)
export const GKEY = 'pm-goals-v1' // localStorage: цели (может быть зашифровано PIN-ом)
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

export function bigSet(name: string, str: string): Promise<void> {
  const n = Math.max(1, Math.ceil(str.length / CHUNK))
  const ops: Promise<boolean>[] = []
  for (let i = 0; i < n; i++) ops.push(cloudSet(name + '_' + i, str.slice(i * CHUNK, (i + 1) * CHUNK)))
  return Promise.all(ops)
    .then(() => cloudSet(name + '_n', String(n)))
    .then(() => {
      const pn = prevN[name] || 0
      if (pn > n) {
        const rm: string[] = []
        for (let j = n; j < pn; j++) rm.push(name + '_' + j)
        if (rm.length) return cloudRem(rm).then(() => undefined)
      }
      return undefined
    })
    .then(() => {
      prevN[name] = n
    })
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

export function sset(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    mem[k] = v
  }
}
