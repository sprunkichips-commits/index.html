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
  cleanAvatar,
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
import {
  CSKEY, KEY, PKEY, TKEY,
  bigGet, bigSet, cloudGet, cloudSet, dailySnapshot, readSnapshot, sget, sset,
} from '@/lib/storage'
import { localDateStr } from '@/lib/goals'
import { hasCloud, tgPaintColors, tgReady, tgUser } from '@/lib/telegram'

export type Theme = 'dark' | 'light'
/** Стиль графиков статистики: classic — столбцы, studio — линия (как в YouTube Studio). */
export type ChartStyle = 'classic' | 'studio'
export type Tab = 'dash' | 'tx' | 'stats' | 'goals'
export type Filter = 'Все' | 'Доход' | 'Расход'

const THEME_BG: Record<Theme, string> = { dark: '#0F110E', light: '#F4F5EF' }

interface AddTxInput {
  type: TxType
  amount: number
  category: string
  subCategory?: string
  transit?: boolean
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
  chartStyle: ChartStyle
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
  setChartStyle: (s: ChartStyle) => void
  setProfile: (p: Profile) => void
  addTx: (input: AddTxInput) => boolean
  delTx: (id: string) => void
  addInv: (input: AddInvInput) => boolean
  delInv: (id: string) => void
  restore: (obj: unknown) => void
  restoreSnapshot: () => boolean
  loadDemo: () => void
  clearAll: () => void
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
  const [chartStyle, setChartStyleState] = useState<ChartStyle>(() =>
    sget(CSKEY) === 'studio' ? 'studio' : 'classic',
  )
  const [cursor, setCursor] = useState<Cursor>(() => cursorFromData(parseStored(sget(KEY)) || emptyData()))
  const [tab, setTab] = useState<Tab>('dash')
  const [filter, setFilter] = useState<Filter>('Все')
  const [notice, setNotice] = useState<string | null>(null)
  const [profile, setProfileState] = useState<Profile>(() => parseProfile(sget(PKEY)))
  const toastTimer = useRef<number | null>(null)
  // Пользователь уже менял данные/профиль в этой сессии? Тогда поздняя
  // гидратация из облака НЕ должна затирать его правки (см. boot-эффект).
  const dataDirty = useRef(false)
  const profileDirty = useRef(false)

  const firstName = tgUser?.first_name?.trim() || ''
  const displayName = profile.name || firstName || 'Guest'

  const toast = useCallback((m: string) => {
    setNotice(m)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setNotice(null), 1900)
  }, [])

  // Persist helper — localStorage зеркало + CloudStorage. Перед первой записью
  // дня откладываем автоснимок «вчерашнего» состояния. О сбоях говорим вслух:
  // облако не записалось — данные целы локально; локально не влезло и облака
  // нет — данные живут только до закрытия, нужен бэкап.
  const persist = useCallback(
    (next: AppData) => {
      dataDirty.current = true
      setData(next)
      dailySnapshot(KEY, localDateStr())
      const str = JSON.stringify(next)
      const okLocal = sset(KEY, str)
      if (hasCloud) {
        void bigSet('data', str).then((ok) => {
          if (!ok) toast('Saved on device; Telegram sync failed')
        })
      } else if (!okLocal) {
        toast('Storage is full — download a backup now!')
      }
    },
    [toast],
  )

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    sset(TKEY, t)
    if (hasCloud) cloudSet('theme', t)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const setChartStyle = useCallback((s: ChartStyle) => {
    setChartStyleState(s)
    sset(CSKEY, s)
    if (hasCloud) cloudSet('chartstyle', s)
  }, [])

  // Профиль (ник + аватар): нормализуем, зеркалим в localStorage и в облако.
  const setProfile = useCallback(
    (p: Profile) => {
      profileDirty.current = true
      const next: Profile = { name: clampStr(p.name, NAME_MAX).trim(), avatar: cleanAvatar(p.avatar) }
      setProfileState(next)
      const str = JSON.stringify(next)
      sset(PKEY, str)
      if (hasCloud) {
        void bigSet('profile', str).then((ok) => {
          if (!ok) toast('Saved on device; Telegram sync failed')
        })
      }
    },
    [toast],
  )

  const shiftMonth = useCallback((delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }, [])

  const addTx = useCallback(
    (input: AddTxInput): boolean => {
      const category = clampStr(input.category, CAT_MAX)
      const subCategory = clampStr(input.subCategory || '', CAT_MAX)
      const note = clampStr((input.note || '').trim(), NOTE_MAX)
      const amount = clampAmt(input.amount)
      if (!category || amount <= 0 || !validDate(input.date)) return false
      const tx: Tx = {
        id: uid(),
        date: input.date,
        type: input.type === 'Доход' ? 'Доход' : 'Расход',
        category,
        ...(subCategory ? { subCategory } : {}),
        ...(input.transit ? { transit: true } : {}),
        amount,
        note,
        createdAt: Date.now(),
      }
      const next: AppData = { ...data, transactions: [tx, ...data.transactions] }
      const d = new Date(input.date + 'T00:00:00')
      setCursor({ y: d.getFullYear(), m: d.getMonth() })
      persist(next)
      toast('Added')
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
      toast('Asset added')
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
        toast('Invalid file')
        return
      }
      setCursor(cursorFromData(c))
      persist(c)
      toast('Restored')
    },
    [persist, toast],
  )

  /** Откат финансов к автоснимку (состояние на начало дня снимка). */
  const restoreSnapshot = useCallback((): boolean => {
    const snap = readSnapshot(KEY)
    const parsed = snap ? parseStored(snap.v) : null
    if (!parsed) return false
    setCursor(cursorFromData(parsed))
    persist(parsed)
    return true
  }, [persist])

  const loadDemo = useCallback(() => {
    restore(DEMO)
  }, [restore])

  const clearAll = useCallback(() => {
    setCursor(cursorFromData(emptyData()))
    persist(emptyData())
    toast('Cleared')
  }, [persist, toast])

  // ----- Старт: тема + Telegram + гидратация из CloudStorage -----
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    applyTheme(theme)
    tgReady()
    // Запись есть, но JSON не читается (порча/обрыв записи)? Прячем копию в
    // -bak: дальнейшие сохранения перезапишут KEY, а исходник останется.
    const rawLocal = sget(KEY)
    if (rawLocal && !parseStored(rawLocal)) {
      sset(KEY + '-bak', rawLocal)
      toast('Could not read saved data — backup kept')
    }
    if (!hasCloud) return
    Promise.all([bigGet('data'), cloudGet('theme'), bigGet('profile'), cloudGet('chartstyle')]).then(
      ([dataStr, th, profStr, cs]) => {
        if ((th === 'light' || th === 'dark') && th !== theme) {
          setThemeState(th)
          applyTheme(th)
        }
        if (cs === 'classic' || cs === 'studio') {
          setChartStyleState(cs)
          sset(CSKEY, cs)
        }
        // Если пользователь уже успел что-то изменить, пока грузилось облако, —
        // его правки главнее: они уже записаны и локально, и в облако.
        if (dataStr && !dataDirty.current) {
          const parsed = parseStored(dataStr) // raw, без sanitize — обратная совместимость
          if (parsed) {
            setData(parsed)
            sset(KEY, dataStr)
            setCursor(cursorFromData(parsed))
          }
        } else if (!dataStr && (data.transactions.length || data.investments.length)) {
          // нет облачных данных, но есть локальные — поднимаем в облако (как в исходнике)
          void bigSet('data', JSON.stringify(data))
          cloudSet('theme', theme)
        }
        if (profStr && !profileDirty.current) {
          const p = parseProfile(profStr)
          setProfileState(p)
          sset(PKEY, JSON.stringify(p))
        } else if (!profStr && (profile.name || profile.avatar)) {
          // нет облачного профиля, но есть локальный — поднимаем в облако
          void bigSet('profile', JSON.stringify(profile))
        }
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<Store>(
    () => ({
      data,
      theme,
      chartStyle,
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
      setChartStyle,
      setProfile,
      addTx,
      delTx,
      addInv,
      delInv,
      restore,
      restoreSnapshot,
      loadDemo,
      clearAll,
      toast,
    }),
    [
      data, theme, chartStyle, cursor, tab, filter, notice, firstName, profile, displayName,
      shiftMonth, toggleTheme, setTheme, setChartStyle, setProfile, addTx, delTx, addInv, delInv,
      restore, restoreSnapshot, loadDemo, clearAll, toast,
    ],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
