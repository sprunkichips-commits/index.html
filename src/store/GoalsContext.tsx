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
  validPin,
} from '@/lib/goals'
import { uid, validDate } from '@/lib/data'
import { GKEY, bigGet, bigSet, sget, sset } from '@/lib/storage'
import { hasCloud } from '@/lib/telegram'
import { deriveKey, decryptJSON, encryptJSON, hasCrypto, randomSaltB64 } from '@/lib/crypto'
import { useStore } from './StoreContext'

export type GoalsStatus = 'locked' | 'ready'

interface GoalsStore {
  status: GoalsStatus
  data: GoalsData
  encrypted: boolean
  cryptoOk: boolean
  unlockError: string | null
  streak: number
  todayKey: string
  unlock: (pin: string) => Promise<boolean>
  enablePin: (pin: string) => Promise<boolean>
  changePin: (pin: string) => Promise<boolean>
  disablePin: () => Promise<void>
  addGoal: (title: string, targetDate: string) => boolean
  editGoal: (id: string, title: string, targetDate: string) => void
  delGoal: (id: string) => void
  addTask: (title: string) => boolean
  editTask: (id: string, title: string) => void
  delTask: (id: string) => void
  toggleToday: (taskId: string) => void
  clearAllGoals: () => void
}

const Ctx = createContext<GoalsStore | null>(null)

export function useGoals(): GoalsStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGoals must be used within GoalsProvider')
  return ctx
}

type ParsedEnv =
  | { kind: 'enc'; salt: string; blob: string }
  | { kind: 'plain'; data: GoalsData }
  | null

function parseEnv(str: string | null): ParsedEnv {
  if (!str) return null
  try {
    const e = JSON.parse(str)
    if (e && e.enc === 1 && typeof e.salt === 'string' && typeof e.blob === 'string') {
      return { kind: 'enc', salt: e.salt, blob: e.blob }
    }
    if (e && e.enc === 0) return { kind: 'plain', data: parseGoals(e.data) }
  } catch {
    /* ignore */
  }
  return null
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { toast } = useStore()
  const initial = useRef<ParsedEnv>(parseEnv(sget(GKEY))).current

  const [status, setStatus] = useState<GoalsStatus>(initial?.kind === 'enc' ? 'locked' : 'ready')
  const [data, setData] = useState<GoalsData>(initial?.kind === 'plain' ? initial.data : emptyGoals())
  const [encrypted, setEncrypted] = useState(initial?.kind === 'enc')
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const dataRef = useRef<GoalsData>(data)
  const keyRef = useRef<CryptoKey | null>(null)
  const saltRef = useRef<string | null>(initial?.kind === 'enc' ? initial.salt : null)
  const blobRef = useRef<string | null>(initial?.kind === 'enc' ? initial.blob : null)
  const encRef = useRef<boolean>(initial?.kind === 'enc')

  const todayKey = localDateStr()

  // ----- Сохранение: собрать конверт (шифрованный или нет) -> localStorage + CloudStorage -----
  const persist = useCallback(async (next: GoalsData) => {
    try {
      let env: string
      if (encRef.current && keyRef.current && saltRef.current) {
        const blob = await encryptJSON(next, keyRef.current)
        env = JSON.stringify({ enc: 1, salt: saltRef.current, blob })
      } else {
        env = JSON.stringify({ enc: 0, data: next })
      }
      sset(GKEY, env)
      if (hasCloud) await bigSet('goals', env)
    } catch {
      toast('Не удалось сохранить цели')
    }
  }, [toast])

  const apply = useCallback(
    (next: GoalsData) => {
      dataRef.current = next
      setData(next)
      void persist(next)
    },
    [persist],
  )

  // ----- Старт: подтянуть из CloudStorage (источник истины), как у финансов -----
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (!hasCloud) return
    bigGet('goals').then((cloudStr) => {
      if (cloudStr) {
        const env = parseEnv(cloudStr)
        sset(GKEY, cloudStr)
        if (env?.kind === 'enc') {
          saltRef.current = env.salt
          blobRef.current = env.blob
          encRef.current = true
          setEncrypted(true)
          setStatus('locked')
        } else if (env?.kind === 'plain') {
          encRef.current = false
          keyRef.current = null
          setEncrypted(false)
          dataRef.current = env.data
          setData(env.data)
          setStatus('ready')
        }
      } else {
        // в облаке пусто, а локально что-то есть — поднимаем наверх
        const local = sget(GKEY)
        if (local) bigSet('goals', local)
      }
    })
  }, [])

  // ----- PIN / шифрование -----
  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    if (!saltRef.current || !blobRef.current) return false
    try {
      const key = await deriveKey(pin, saltRef.current)
      const obj = await decryptJSON(blobRef.current, key)
      const parsed = parseGoals(obj)
      keyRef.current = key
      encRef.current = true
      setEncrypted(true)
      dataRef.current = parsed
      setData(parsed)
      setStatus('ready')
      setUnlockError(null)
      return true
    } catch {
      setUnlockError('Неверный PIN-код')
      return false
    }
  }, [])

  const enablePin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!hasCrypto() || !validPin(pin)) return false
      const salt = randomSaltB64()
      keyRef.current = await deriveKey(pin, salt)
      saltRef.current = salt
      encRef.current = true
      setEncrypted(true)
      await persist(dataRef.current)
      return true
    },
    [persist],
  )

  const changePin = enablePin

  const disablePin = useCallback(async () => {
    keyRef.current = null
    encRef.current = false
    setEncrypted(false)
    await persist(dataRef.current)
  }, [persist])

  // ----- CRUD целей/задач -----
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
      const cur = dataRef.current
      const total = cur.tasks.length
      const log = cur.logs[todayKey] || { done: [], total }
      const has = log.done.includes(taskId)
      const done = has ? log.done.filter((x) => x !== taskId) : [...log.done, taskId]
      apply({ ...cur, logs: { ...cur.logs, [todayKey]: { done, total } } })
    },
    [apply, todayKey],
  )

  const clearAllGoals = useCallback(() => {
    apply(emptyGoals())
  }, [apply])

  const streak = useMemo(() => computeStreak(data.logs, todayKey), [data.logs, todayKey])

  const value = useMemo<GoalsStore>(
    () => ({
      status,
      data,
      encrypted,
      cryptoOk: hasCrypto(),
      unlockError,
      streak,
      todayKey,
      unlock,
      enablePin,
      changePin,
      disablePin,
      addGoal,
      editGoal,
      delGoal,
      addTask,
      editTask,
      delTask,
      toggleToday,
      clearAllGoals,
    }),
    [
      status, data, encrypted, unlockError, streak, todayKey,
      unlock, enablePin, changePin, disablePin, addGoal, editGoal, delGoal,
      addTask, editTask, delTask, toggleToday, clearAllGoals,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
