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
  PAYER_MAX,
  TYPE_MAX,
  DEMO,
} from '@/lib/data'
import {
  CSKEY, KEY, PKEY, TKEY,
  bigGet, bigSet, cloudGet, cloudSet, dailySnapshot, readSnapshot, sget, sset,
} from '@/lib/storage'
import { localDateStr } from '@/lib/goals'
import { api, hasInitData, resolveAuth, type AuthInfo } from '@/lib/api'
import { fullRange, toCloudPayload, toLocalTx } from '@/lib/cloudSync'
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
  payer?: string
  date: string
  note: string
}
interface AddInvInput {
  name: string
  type: string
  invested: number
  current: number
}

/** Состояние связи с облаком: облако — источник правды, локально — кэш чтения. */
export type CloudState = 'off' | 'syncing' | 'synced' | 'offline'

/** Авторизация асинхронна: на сайте её приходится спрашивать у сервера. */
export type AuthState = 'checking' | 'authed' | 'anon'

interface Store {
  data: AppData
  theme: Theme
  chartStyle: ChartStyle
  cursor: Cursor
  tab: Tab
  filter: Filter
  notice: string | null
  cloud: CloudState
  syncCloud: () => void
  /** Заметное предупреждение: запись в облако заблокирована предохранителем. */
  dataGuard: string | null
  auth: AuthState
  authInfo: AuthInfo | null
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
  const [cloud, setCloud] = useState<CloudState>(() => (hasInitData() ? 'syncing' : 'off'))
  // Внутри Telegram знаем сразу; в браузере ждём ответа сервера про сессию.
  const [auth, setAuth] = useState<AuthState>(() => (hasInitData() ? 'authed' : 'checking'))
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(() =>
    hasInitData() ? { authenticated: true, via: 'telegram' } : null,
  )
  const authedRef = useRef(hasInitData())
  const toastTimer = useRef<number | null>(null)
  // Пользователь уже менял данные/профиль в этой сессии? Тогда поздняя
  // гидратация из облака НЕ должна затирать его правки (см. boot-эффект).
  const dataDirty = useRef(false)
  const profileDirty = useRef(false)

  // ----- ПРЕДОХРАНИТЕЛЬ ОТ ПОТЕРИ ДАННЫХ -----
  // Настоящая история операций может лежать только в Telegram CloudStorage.
  // Если приложение запустится, не прочитав её (нет связи, сбой, пустая база
  // D1), в памяти окажется пустота — и первая же запись затрёт историю
  // безвозвратно. Поэтому в облако не пишем, пока не убедились, что прочитали
  // его успешно, и никогда не пишем пустоту поверх непустого хранилища.
  const cloudLoadOk = useRef(false) // чтение CloudStorage завершилось успешно
  const cloudHadData = useRef(false) // в CloudStorage что-то было
  const [dataGuard, setDataGuard] = useState<string | null>(null)

  const isEmpty = (d: AppData) => d.transactions.length === 0 && d.investments.length === 0

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
        // Предохранитель: пишем в облако только если успешно его прочитали.
        if (!cloudLoadOk.current) {
          setDataGuard(
            'Cloud data was not loaded, so saving to Telegram is paused to protect your history. Download a backup and reopen the app.',
          )
          return
        }
        // И никогда не затираем непустое хранилище пустотой.
        if (cloudHadData.current && isEmpty(next)) {
          setDataGuard(
            'Refused to overwrite your Telegram data with an empty set. Nothing was sent to the cloud.',
          )
          return
        }
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

  /**
   * Тянет операции из облака и заменяет ими локальные. Облако — источник
   * правды: при расхождении побеждает оно. Локальная копия остаётся как кэш,
   * чтобы приложение открывалось и работало на чтение без связи.
   */
  const syncCloud = useCallback(() => {
    if (!authedRef.current) return
    setCloud('syncing')
    const { from, to } = fullRange()
    api
      .transactions({ from, to })
      .then(({ items }) => {
        const transactions = items.map(toLocalTx)
        setData((prev) => {
          // Тот же принцип: пустой ответ базы не стирает уже имеющиеся записи.
          // Пустая D1 при непустой истории — это состояние «ещё не перенесли»,
          // а не «данных нет».
          if (transactions.length === 0 && prev.transactions.length > 0) {
            setDataGuard(
              'The cloud database is still empty while this device has data. Showing your local data; nothing was overwritten.',
            )
            return prev
          }
          const next = { ...prev, transactions }
          sset(KEY, JSON.stringify(next)) // обновляем офлайн-кэш
          return next
        })
        setCloud('synced')
      })
      .catch(() => {
        // Нет связи или сервер недоступен — продолжаем работать на кэше.
        setCloud('offline')
      })
  }, [])

  const addTx = useCallback(
    (input: AddTxInput): boolean => {
      const category = clampStr(input.category, CAT_MAX)
      const subCategory = clampStr(input.subCategory || '', CAT_MAX)
      const payer = clampStr((input.payer || '').trim(), PAYER_MAX)
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
        ...(payer ? { payer } : {}),
        amount,
        note,
        createdAt: Date.now(),
      }
      // Показываем сразу (не ждём сеть), затем отправляем в облако. Если
      // отправка не прошла — честно говорим об этом и возвращаем состояние
      // к тому, что реально лежит в облаке, чтобы на экране не осталось
      // операции, которой на сервере нет.
      const next: AppData = { ...data, transactions: [tx, ...data.transactions] }
      const d = new Date(input.date + 'T00:00:00')
      setCursor({ y: d.getFullYear(), m: d.getMonth() })
      persist(next)

      if (authedRef.current) {
        api
          .addTransaction(toCloudPayload({ ...input, category, subCategory, payer, note, amount }))
          .then(() => {
            setCloud('synced')
            syncCloud()
          })
          .catch(() => {
            setCloud('offline')
            toast('No connection — not saved to the cloud')
          })
      }
      toast('Added')
      return true
    },
    [data, persist, toast, syncCloud],
  )

  const delTx = useCallback(
    (id: string) => {
      persist({ ...data, transactions: data.transactions.filter((x) => x.id !== id) })
      if (authedRef.current) {
        api.deleteTransaction(id).catch(() => {
          setCloud('offline')
          toast('No connection — not deleted in the cloud')
          syncCloud() // вернём то, что реально в облаке
        })
      }
    },
    [data, persist, toast, syncCloud],
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
    // Сначала выясняем, авторизованы ли мы (в браузере это запрос к серверу),
    // и только потом тянем данные. Иначе на сайте синхронизация не запускалась
    // вообще — и он показывал «Guest» с нулями при живой сессии.
    void resolveAuth().then((info) => {
      authedRef.current = info.authenticated
      setAuthInfo(info)
      setAuth(info.authenticated ? 'authed' : 'anon')
      if (info.authenticated) syncCloud()
      else setCloud('off')
    })
    // Запись есть, но JSON не читается (порча/обрыв записи)? Прячем копию в
    // -bak: дальнейшие сохранения перезапишут KEY, а исходник останется.
    const rawLocal = sget(KEY)
    if (rawLocal && !parseStored(rawLocal)) {
      sset(KEY + '-bak', rawLocal)
      toast('Could not read saved data — backup kept')
    }
    if (!hasCloud) {
      cloudLoadOk.current = true // облака нет вовсе — предохранителю нечего защищать
      return
    }
    Promise.all([bigGet('data'), cloudGet('theme'), bigGet('profile'), cloudGet('chartstyle')])
      .catch((e) => {
        // Чтение не удалось — предохранитель остаётся включённым, писать нельзя.
        setDataGuard(
          'Could not read your Telegram data. Saving is paused so nothing gets overwritten. Check the connection and reopen the app.',
        )
        throw e
      })
      .then(
      ([dataStr, th, profStr, cs]) => {
        // Чтение прошло. Запоминаем, было ли там что-то: с этого момента запись
        // в облако разрешена, но пустотой поверх непустого — по-прежнему нет.
        cloudLoadOk.current = true
        const cloudParsed = dataStr ? parseStored(dataStr) : null
        cloudHadData.current = !!cloudParsed && !isEmpty(cloudParsed)

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
      cloud,
      syncCloud,
      dataGuard,
      auth,
      authInfo,
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
      data, theme, chartStyle, cursor, tab, filter, notice, cloud, syncCloud, dataGuard, auth, authInfo, firstName, profile, displayName,
      shiftMonth, toggleTheme, setTheme, setChartStyle, setProfile, addTx, delTx, addInv, delInv,
      restore, restoreSnapshot, loadDemo, clearAll, toast,
    ],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
