// ===== Модель «Целей»: большая цель с дедлайном + ежедневные задачи + серия =====
// Хранится отдельно от финансов (ключ pm-goals-v1 / CloudStorage "goals"),
// может шифроваться PIN-кодом (см. crypto.ts, GoalsContext).
import { clampStr, uid, validDate } from './data'

export interface Goal {
  id: string
  title: string
  targetDate: string // YYYY-MM-DD — к какому дню хочу достичь
}

export interface DailyTask {
  id: string
  title: string
}

/** Запись за день: какие задачи закрыты + сколько их было всего (снимок). */
export interface DayLog {
  done: string[]
  total: number
}

export interface GoalsData {
  goals: Goal[]
  tasks: DailyTask[]
  logs: Record<string, DayLog> // дата YYYY-MM-DD -> запись
}

export const TITLE_MAX = 80
export const MAX_GOALS = 30
export const MAX_TASKS = 30
export const MAX_LOG_DAYS = 800

export function emptyGoals(): GoalsData {
  return { goals: [], tasks: [], logs: {} }
}

export function isGoalsEmpty(d: GoalsData): boolean {
  return d.goals.length === 0 && d.tasks.length === 0 && Object.keys(d.logs).length === 0
}

/** Локальная дата YYYY-MM-DD (не UTC — важно для «вечерней» отметки дня). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Сколько дней осталось до даты цели (может быть отрицательным — просрочено). */
export function daysLeft(targetDate: string, todayStr: string = localDateStr()): number {
  const a = new Date(todayStr + 'T00:00:00').getTime()
  const b = new Date(targetDate + 'T00:00:00').getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Процент закрытых задач за день (0…100). */
export function percentForDay(log: DayLog | undefined): number {
  if (!log || !log.total) return 0
  return Math.round((Math.min(log.done.length, log.total) / log.total) * 100)
}

/**
 * Серия (как в Duolingo): сколько дней подряд закрыта хотя бы одна задача,
 * считая от сегодня. Если сегодня ещё не отмечено — серия не рвётся, считаем со вчера.
 */
export function computeStreak(logs: Record<string, DayLog>, todayStr: string = localDateStr()): number {
  const ok = (s: string) => {
    const l = logs[s]
    return !!l && l.done.length > 0
  }
  const d = new Date(todayStr + 'T00:00:00')
  if (!ok(localDateStr(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (ok(localDateStr(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Сдвиг локальной даты на delta дней: ('2026-07-06', -6) → '2026-06-30'. */
export function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return localDateStr(d)
}

export interface RangePoint {
  date: string // YYYY-MM-DD
  percent: number // 0…100
}

// Потолок точек графика — защита от абсурдного кастомного диапазона.
export const RANGE_MAX_DAYS = 366

/** Точки для графика: процент закрытия за каждый день диапазона (включительно).
 *  Дни без записи — 0%, чтобы пропуски были видны, а не сглаживались. */
export function rangeSeries(logs: Record<string, DayLog>, startStr: string, endStr: string): RangePoint[] {
  if (!startStr || !endStr || startStr > endStr) return []
  const out: RangePoint[] = []
  const end = new Date(endStr + 'T00:00:00')
  for (const d = new Date(startStr + 'T00:00:00'); d <= end && out.length < RANGE_MAX_DAYS; d.setDate(d.getDate() + 1)) {
    const key = localDateStr(d)
    out.push({ date: key, percent: percentForDay(logs[key]) })
  }
  return out
}

export interface TaskStat {
  id: string
  title: string
  doneDays: number
  days: number
  pct: number // 0…100 — доля дней диапазона, когда задача закрыта
}

/** Статистика по каждой текущей задаче за диапазон: в какие дни она закрывалась.
 *  Отсортирована по убыванию — сразу видно, что делаю чаще, а что реже. */
export function taskStats(
  logs: Record<string, DayLog>,
  tasks: DailyTask[],
  startStr: string,
  endStr: string,
): TaskStat[] {
  if (!tasks.length || !startStr || !endStr || startStr > endStr) return []
  const doneBy: Record<string, number> = {}
  let days = 0
  const end = new Date(endStr + 'T00:00:00')
  for (const d = new Date(startStr + 'T00:00:00'); d <= end && days < RANGE_MAX_DAYS; d.setDate(d.getDate() + 1)) {
    days++
    const log = logs[localDateStr(d)]
    if (log) for (const id of log.done) doneBy[id] = (doneBy[id] || 0) + 1
  }
  return tasks
    .map((t) => {
      const doneDays = doneBy[t.id] || 0
      return { id: t.id, title: t.title, doneDays, days, pct: days ? Math.round((doneDays / days) * 100) : 0 }
    })
    .sort((a, b) => b.pct - a.pct)
}

function cleanId(v: unknown): string {
  return typeof v === 'string' && v ? v.slice(0, 32) : uid()
}

/** Строгая нормализация структуры (после расшифровки/чтения). */
export function parseGoals(obj: unknown): GoalsData {
  if (!obj || typeof obj !== 'object') return emptyGoals()
  const o = obj as Record<string, unknown>

  const goals: Goal[] = Array.isArray(o.goals)
    ? ((o.goals as unknown[])
        .slice(0, MAX_GOALS)
        .map((g): Goal | null => {
          if (!g || typeof g !== 'object') return null
          const r = g as Record<string, unknown>
          const targetDate = validDate(r.targetDate)
          const title = clampStr(r.title, TITLE_MAX).trim()
          if (!targetDate || !title) return null
          return { id: cleanId(r.id), title, targetDate }
        })
        .filter((x): x is Goal => x !== null))
    : []

  const tasks: DailyTask[] = Array.isArray(o.tasks)
    ? ((o.tasks as unknown[])
        .slice(0, MAX_TASKS)
        .map((t): DailyTask | null => {
          if (!t || typeof t !== 'object') return null
          const r = t as Record<string, unknown>
          const title = clampStr(r.title, TITLE_MAX).trim()
          if (!title) return null
          return { id: cleanId(r.id), title }
        })
        .filter((x): x is DailyTask => x !== null))
    : []

  const logs: Record<string, DayLog> = {}
  if (o.logs && typeof o.logs === 'object') {
    // При переполнении истории оставляем САМЫЕ НОВЫЕ дни (сортировка по дате),
    // а не первые попавшиеся — иначе можно молча потерять свежие отметки.
    const entries = Object.entries(o.logs as Record<string, unknown>)
      .filter(([k]) => validDate(k))
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, MAX_LOG_DAYS)
    for (const [k, v] of entries) {
      if (!v || typeof v !== 'object') continue
      const lv = v as Record<string, unknown>
      const done = Array.isArray(lv.done)
        ? (lv.done as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).slice(0, 32)).slice(0, MAX_TASKS)
        : []
      const total =
        typeof lv.total === 'number' && lv.total >= 0 ? Math.min(Math.round(lv.total), MAX_TASKS) : done.length
      logs[k] = { done, total }
    }
  }

  return { goals, tasks, logs }
}
