import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  type GoalsData,
  computeStreak,
  emptyGoals,
  localDateStr,
  MAX_GOALS,
  MAX_TASKS,
  parseGoals,
  TITLE_MAX,
} from '@/lib/goals'
import { uid, validDate } from '@/lib/data'
import { GKEY, bigGet, bigSet, sget, sset } from '@/lib/storage'
import { hasCloud, tgUserId } from '@/lib/telegram'
import { decryptJSON, deriveAutoKey, encryptJSON, hasCrypto } from '@/lib/crypto'
import { useStore } from './StoreContext'

export type GoalsStatus = 'loading' | 'ready'

interface GoalsStore {
  status: GoalsStatus
  data: GoalsData
  encrypted: boolean
  streak: number
  todayKey: string
  addGoal: (title: string, targetDate: string) => boolean
  editGoal: (id: string, title: string, targetDate: string) => void
  delGoal: (id: string) => void
  addTask: (title: string) => boolean
  editTask: (id: string, title: string) => void
  delTask: (id: string) => void
  toggleToday: (taskId: string) => void
  restoreGoals: (obj: unknown) => void
  clearAllGoals: () => void
}

const Ctx = createContext<GoalsStore | null>(null)

export function useGoals(): GoalsStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGoals must be used within GoalsProvider')
  return ctx
}

interface Loaded {
  data: GoalsData
  legacy: boolean // было незашифрованным (enc:0) — нужно пересохранить зашифрованным
  failed: boolean // запись ЕСТЬ, но прочитать не удалось — НЕ затирать её пустотой
}

async function loadFrom(envStr: string | null, key: CryptoKey | null): Promise<Loaded> {
  if (!envStr) return { data: emptyGoals(), legacy: false, failed: false }
  let e: { enc?: number; blob?: string; data?: unknown }
  try {
    e = JSON.parse(envStr)
  } catch {
    return { data: emptyGoals(), legacy: false, failed: true }
  }
  if (e?.enc === 2 && typeof e.blob === 'string') {
    if (!key) return { data: emptyGoals(), legacy: false, failed: true }
    try {
      return { data: parseGoals(await decryptJSON(e.blob, key)), legacy: false, failed: false }
    } catch {
      return { data: emptyGoals(), legacy: false, failed: true }
    }
  }
  if (e?.enc === 0) return { data: parseGoals(e.data), legacy: true, failed: false } // старый незашифрованный формат
  return { data: emptyGoals(), legacy: false, failed: true } // незнакомый конверт — не трогаем
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { toast } = useStore()
  const [status, setStatus] = useState<GoalsStatus>('loading')
  const [data, setData] = useState<GoalsData>(emptyGoals())
  const [encrypted, setEncrypted] = useState(false)

  const dataRef = useRef<GoalsData>(data)
  const keyRef = useRef<CryptoKey | null>(null)
  // Пользователь уже менял цели в этой сессии? Тогда поздняя гидратация из
  // облака не должна затирать его правки (см. boot-эффект).
  const dirty = useRef(false)
  const todayKey = localDateStr()

  // Сохранение: всегда шифруем (если доступен Web Crypto), иначе — открытым текстом.
  const persist = useCallback(
    async (next: GoalsData) => {
      try {
        let env: string
        if (keyRef.current) {
          env = JSON.stringify({ enc: 2, blob: await encryptJSON(next, keyRef.current) })
        } else {
          env = JSON.stringify({ enc: 0, data: next })
        }
        sset(GKEY, env)
        if (hasCloud && !(await bigSet('goals', env))) {
          toast('Saved on device; Telegram sync failed')
        }
      } catch {
        toast('Could not save goals')
      }
    },
    [toast],
  )

  const apply = useCallback(
    (next: GoalsData) => {
      dirty.current = true
      dataRef.current = next
      setData(next)
      void persist(next)
    },
    [persist],
  )

  // Старт: вывести ключ (из id пользователя), подтянуть данные (облако > локально), расшифровать.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      let key: CryptoKey | null = null
      if (hasCrypto()) {
        try {
          key = await deriveAutoKey(String(tgUserId ?? 'browser-local'))
        } catch {
          key = null
        }
      }
      keyRef.current = key
      setEncrypted(!!key)

      let envStr = sget(GKEY)
      let fromCloud = false
      if (hasCloud) {
        const cloudStr = await bigGet('goals')
        if (cloudStr) {
          envStr = cloudStr
          sset(GKEY, cloudStr)
          fromCloud = true
        }
      }

      const loaded = await loadFrom(envStr, key)

      if (loaded.failed && envStr) {
        // Запись есть, но прочитать не смогли (сбой ключа/повреждение). Прячем
        // копию в GKEY-bak, чтобы дальнейшие сохранения её не уничтожили, —
        // данные можно будет вытащить вручную или при следующем удачном запуске.
        sset(GKEY + '-bak', envStr)
        toast('Could not read saved goals — backup kept')
      }

      // Пользователь мог успеть внести правки, пока грузилось облако, — тогда
      // его данные главнее (они уже записаны локально и в облако).
      if (!dirty.current) {
        dataRef.current = loaded.data
        setData(loaded.data)
      }
      setStatus('ready')

      // Миграция старого незашифрованного формата → пересохранить зашифрованным.
      // А также поднять локальные данные в облако, если там пусто.
      const hasContent = loaded.data.goals.length || loaded.data.tasks.length || Object.keys(loaded.data.logs).length
      if (!dirty.current && ((loaded.legacy && key) || (hasCloud && !fromCloud && hasContent))) {
        void persist(loaded.data)
      }
    })()
  }, [persist, toast])

  const addGoal = useCallback(
    (title: string, targetDate: string): boolean => {
      const t = title.trim().slice(0, TITLE_MAX)
      if (!t || !validDate(targetDate) || dataRef.current.goals.length >= MAX_GOALS) return false
      apply({ ...dataRef.current, goals: [...dataRef.current.goals, { id: uid(), title: t, targetDate }] })
      return true
    },
    [apply],
  )

  const editGoal = useCallback(
    (id: string, title: string, targetDate: string) => {
      const t = title.trim().slice(0, TITLE_MAX)
      if (!t || !validDate(targetDate)) return
      apply({
        ...dataRef.current,
        goals: dataRef.current.goals.map((g) => (g.id === id ? { ...g, title: t, targetDate } : g)),
      })
    },
    [apply],
  )

  const delGoal = useCallback(
    (id: string) => {
      apply({ ...dataRef.current, goals: dataRef.current.goals.filter((g) => g.id !== id) })
    },
    [apply],
  )

  const addTask = useCallback(
    (title: string): boolean => {
      const t = title.trim().slice(0, TITLE_MAX)
      if (!t || dataRef.current.tasks.length >= MAX_TASKS) return false
      apply({ ...dataRef.current, tasks: [...dataRef.current.tasks, { id: uid(), title: t }] })
      return true
    },
    [apply],
  )

  const editTask = useCallback(
    (id: string, title: string) => {
      const t = title.trim().slice(0, TITLE_MAX)
      if (!t) return
      apply({ ...dataRef.current, tasks: dataRef.current.tasks.map((x) => (x.id === id ? { ...x, title: t } : x)) })
    },
    [apply],
  )

  const delTask = useCallback(
    (id: string) => {
      apply({ ...dataRef.current, tasks: dataRef.current.tasks.filter((x) => x.id !== id) })
    },
    [apply],
  )

  const toggleToday = useCallback(
    (taskId: string) => {
      // Дату берём в момент клика, а не из замыкания: если приложение висело
      // открытым через полночь, отметка должна попасть в НОВЫЙ день.
      const key = localDateStr()
      const cur = dataRef.current
      const total = cur.tasks.length
      const log = cur.logs[key] || { done: [], total }
      const has = log.done.includes(taskId)
      const done = has ? log.done.filter((x) => x !== taskId) : [...log.done, taskId]
      apply({ ...cur, logs: { ...cur.logs, [key]: { done, total } } })
    },
    [apply],
  )

  /** Восстановление целей из бэкапа (строгая нормализация parseGoals). */
  const restoreGoals = useCallback(
    (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return
      apply(parseGoals(obj))
    },
    [apply],
  )

  const clearAllGoals = useCallback(() => {
    apply(emptyGoals())
  }, [apply])

  const streak = useMemo(() => computeStreak(data.logs, todayKey), [data.logs, todayKey])

  const value = useMemo<GoalsStore>(
    () => ({
      status, data, encrypted, streak, todayKey,
      addGoal, editGoal, delGoal, addTask, editTask, delTask, toggleToday, restoreGoals, clearAllGoals,
    }),
    [status, data, encrypted, streak, todayKey, addGoal, editGoal, delGoal, addTask, editTask, delTask, toggleToday, restoreGoals, clearAllGoals],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
