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
export const PIN_MIN = 4
export const PIN_MAX = 32

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

/** Точки для линейного графика: процент закрытия по дням (окно до maxDays). */
export function trendSeries(
  logs: Record<string, DayLog>,
  todayStr: string = localDateStr(),
  maxDays = 30,
): { label: string; percent: number; date: string }[] {
  const keys = Object.keys(logs).sort()
  if (keys.length === 0) return []
  const today = new Date(todayStr + 'T00:00:00')
  const earliest = new Date(keys[0] + 'T00:00:00')
  const windowStart = new Date(today)
  windowStart.setDate(today.getDate() - (maxDays - 1))
  const start = earliest > windowStart ? earliest : windowStart
  const out: { label: string; percent: number; date: string }[] = []
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = localDateStr(d)
    out.push({ label: String(d.getDate()), percent: percentForDay(logs[key]), date: key })
  }
  return out
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
    for (const [k, v] of Object.entries(o.logs as Record<string, unknown>).slice(0, MAX_LOG_DAYS)) {
      if (!validDate(k) || !v || typeof v !== 'object') continue
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

export function validPin(pin: string): boolean {
  return typeof pin === 'string' && pin.length >= PIN_MIN && pin.length <= PIN_MAX
}
