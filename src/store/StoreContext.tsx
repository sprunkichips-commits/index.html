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
  type AppData,
  type Cursor,
  type Inv,
  type Profile,
  type Tx,
  type TxType,
  clampStr,
  clampAmt,
  cursorFromData,
  emptyData,
  parseProfile,
  parseStored,
  sanitize,
  uid,
  validDate,
  CAT_MAX,
  NAME_MAX,
  NOTE_MAX,
  TYPE_MAX,
  DEMO,
} from '@/lib/data'
import { KEY, PKEY, TKEY, bigGet, bigSet, cloudGet, cloudSet, sget, sset } from '@/lib/storage'
import { hasCloud, tgPaintColors, tgReady, tgUser } from '@/lib/telegram'
import { today } from '@/lib/format'

export type Theme = 'dark' | 'light'
export type Tab = 'dash' | 'tx' | 'stats' | 'inv'
export type Filter = 'Все' | 'Доход' | 'Расход'

const THEME_BG: Record<Theme, string> = { dark: '#0F110E', light: '#F4F5EF' }

interface AddTxInput {
  type: TxType
  amount: number
  category: string
  date: string
  note: string
}
interface AddInvInput {
  name: string
  type: string
  invested: number
  current: number
}

interface Store {
  data: AppData
  theme: Theme
  cursor: Cursor
  tab: Tab
  filter: Filter
  notice: string | null
  firstName: string
  profile: Profile
  displayName: string
  setTab: (t: Tab) => void
  setFilter: (f: Filter) => void
  shiftMonth: (delta: number) => void
  toggleTheme: () => void
  setTheme: (t: Theme) => void
  setProfile: (p: Profile) => void
  addTx: (input: AddTxInput) => boolean
  delTx: (id: string) => void
  addInv: (input: AddInvInput) => boolean
  delInv: (id: string) => void
  restore: (obj: unknown) => void
  loadDemo: () => void
  clearAll: () => void
  download: () => void
  copy: () => void
  toast: (m: string) => void
}

const StoreCtx = createContext<Store | null>(null)

export function useStore(): Store {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

function applyTheme(t: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', t === 'dark')
  root.classList.toggle('light', t === 'light')
  tgPaintColors(THEME_BG[t])
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => parseStored(sget(KEY)) || emptyData())
  const [theme, setThemeState] = useState<Theme>(() => (sget(TKEY) === 'light' ? 'light' : 'dark'))
  const [cursor, setCursor] = useState<Cursor>(() => cursorFromData(parseStored(sget(KEY)) || emptyData()))
  const [tab, setTab] = useState<Tab>('dash')
  const [filter, setFilter] = useState<Filter>('Все')
  const [notice, setNotice] = useState<string | null>(null)
  const [profile, setProfileState] = useState<Profile>(() => parseProfile(sget(PKEY)))
  const toastTimer = useRef<number | null>(null)

  const firstName = tgUser?.first_name?.trim() || ''
  const displayName = profile.name || firstName || 'Гость'

  // Persist helper — localStorage зеркало + CloudStorage (как в исходнике).
  const persist = useCallback((next: AppData) => {
    setData(next)
    const str = JSON.stringify(next)
    sset(KEY, str)
    if (hasCloud) bigSet('data', str)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    sset(TKEY, t)
    if (hasCloud) cloudSet('theme', t)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  // Профиль (ник + аватар): нормализуем, зеркалим в localStorage и в облако.
  const setProfile = useCallback((p: Profile) => {
    const next: Profile = { name: clampStr(p.name, NAME_MAX).trim(), avatar: p.avatar || '' }
    setProfileState(next)
    const str = JSON.stringify(next)
    sset(PKEY, str)
    if (hasCloud) bigSet('profile', str)
  }, [])

  const toast = useCallback((m: string) => {
    setNotice(m)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setNotice(null), 1900)
  }, [])

  const shiftMonth = useCallback((delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }, [])

  const addTx = useCallback(
    (input: AddTxInput): boolean => {
      const category = clampStr(input.category, CAT_MAX)
      const note = clampStr((input.note || '').trim(), NOTE_MAX)
      const amount = clampAmt(input.amount)
      if (!category || amount <= 0 || !validDate(input.date)) return false
      const tx: Tx = {
        id: uid(),
        date: input.date,
        type: input.type === 'Доход' ? 'Доход' : 'Расход',
        category,
        amount,
        note,
      }
      const next: AppData = { ...data, transactions: [tx, ...data.transactions] }
      const d = new Date(input.date + 'T00:00:00')
      setCursor({ y: d.getFullYear(), m: d.getMonth() })
      persist(next)
      toast('Добавлено')
      return true
    },
    [data, persist, toast],
  )

  const delTx = useCallback(
    (id: string) => {
      persist({ ...data, transactions: data.transactions.filter((x) => x.id !== id) })
    },
    [data, persist],
  )

  const addInv = useCallback(
    (input: AddInvInput): boolean => {
      const name = clampStr(input.name.trim(), NAME_MAX)
      const invested = clampAmt(input.invested)
      const current = clampAmt(input.current)
      const type = clampStr(input.type, TYPE_MAX) || 'Прочее'
      if (!name || invested <= 0) return false
      const inv: Inv = { id: uid(), name, type, invested, current }
      persist({ ...data, investments: [...data.investments, inv] })
      toast('Актив добавлен')
      return true
    },
    [data, persist, toast],
  )

  const delInv = useCallback(
    (id: string) => {
      persist({ ...data, investments: data.investments.filter((x) => x.id !== id) })
    },
    [data, persist],
  )

  const restore = useCallback(
    (obj: unknown) => {
      const c = sanitize(obj)
      if (!c) {
        toast('Файл не подходит')
        return
      }
      setCursor(cursorFromData(c))
      persist(c)
      toast('Восстановлено')
    },
    [persist, toast],
  )

  const loadDemo = useCallback(() => {
    restore(DEMO)
  }, [restore])

  const clearAll = useCallback(() => {
    setCursor(cursorFromData(emptyData()))
    persist(emptyData())
    toast('Очищено')
  }, [persist, toast])

  const download = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dengi-backup-' + today() + '.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Файл скачан')
    } catch {
      toast('Не удалось скачать')
    }
  }, [data, toast])

  const copy = useCallback(() => {
    const str = JSON.stringify(data)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(
        () => toast('Скопировано'),
        () => toast('Не удалось скопировать'),
      )
    } else {
      toast('Буфер недоступен')
    }
  }, [data, toast])

  // ----- Старт: тема + Telegram + гидратация из CloudStorage -----
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    applyTheme(theme)
    tgReady()
    if (!hasCloud) return
    Promise.all([bigGet('data'), cloudGet('theme'), bigGet('profile')]).then(([dataStr, th, profStr]) => {
      if ((th === 'light' || th === 'dark') && th !== theme) {
        setThemeState(th)
        applyTheme(th)
      }
      if (dataStr) {
        const parsed = parseStored(dataStr) // raw, без sanitize — обратная совместимость
        if (parsed) {
          setData(parsed)
          sset(KEY, dataStr)
          setCursor(cursorFromData(parsed))
        }
      } else if (data.transactions.length || data.investments.length) {
        // нет облачных данных, но есть локальные — поднимаем в облако (как в исходнике)
        bigSet('data', JSON.stringify(data))
        cloudSet('theme', theme)
      }
      if (profStr) {
        const p = parseProfile(profStr)
        setProfileState(p)
        sset(PKEY, JSON.stringify(p))
      } else if (profile.name || profile.avatar) {
        // нет облачного профиля, но есть локальный — поднимаем в облако
        bigSet('profile', JSON.stringify(profile))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<Store>(
    () => ({
      data,
      theme,
      cursor,
      tab,
      filter,
      notice,
      firstName,
      profile,
      displayName,
      setTab,
      setFilter,
      shiftMonth,
      toggleTheme,
      setTheme,
      setProfile,
      addTx,
      delTx,
      addInv,
      delInv,
      restore,
      loadDemo,
      clearAll,
      download,
      copy,
      toast,
    }),
    [
      data, theme, cursor, tab, filter, notice, firstName, profile, displayName,
      shiftMonth, toggleTheme, setTheme, setProfile, addTx, delTx, addInv, delInv,
      restore, loadDemo, clearAll, download, copy, toast,
    ],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
