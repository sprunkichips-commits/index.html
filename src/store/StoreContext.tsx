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
  CSKEY, KEY, MKEY, PKEY, TKEY,
  bigGet, bigSet, cloudGet, cloudSet, dailySnapshot, readSnapshot, sget, srem, sset,
} from '@/lib/storage'
import { localDateStr } from '@/lib/goals'
import { api, ApiError, hasInitData, resolveAuth, type AuthInfo } from '@/lib/api'
import { fullRange, toCloudPayload, toLocalTx } from '@/lib/cloudSync'
import { hasCloud, tgAlert, tgNotify, tgPaintColors, tgReady, tgUser } from '@/lib/telegram'

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

/** Итог полного стирания: сколько строк удалено в облаке или почему не вышло. */
export interface WipeResult {
  ok: boolean
  error?: string
  deleted?: Record<string, number>
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
  /** Необратимо удаляет ВСЕ данные: облако, локальную копию, Telegram. */
  clearAll: () => Promise<WipeResult>
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
  // База отдала непустой набор операций, и он применён? Тогда копия из Telegram
  // CloudStorage — устаревший КЭШ и права затирать истину не имеет. Без этого
  // исход зависел от того, кто ответит последним: CloudStorage медленнее, и на
  // телефоне побеждал старый кэш — удалённая на сайте операция возвращалась.
  // Именно «непустой»: пустой ответ базы означать «данных нет» не обязан
  // (см. syncCloud), и тогда копия из CloudStorage по-прежнему нужна.
  const cloudRowsApplied = useRef(false)
  const lastSyncAt = useRef(0)
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
        // База уже отдавала операции на этом устройстве? Отметка живёт в
        // localStorage, поэтому решение не зависит от того, кто из двух
        // асинхронных чтений успел первым.
        const everHadRows = sget(MKEY) === '1'
        if (transactions.length > 0) {
          sset(MKEY, '1')
          // Дублируем отметку в CloudStorage: она должна жить там же, где кэш.
          // Иначе на устройстве с очищенным localStorage кэш есть, а знания о
          // том, что перенос состоялся, нет — и удалённые записи «оживают».
          if (hasCloud) void cloudSet('cloudrows', '1')
        }

        setData((prev) => {
          // Пустой ответ базы — это два совершенно разных состояния:
          //  1. историю ещё не перенесли в облако. Стирать локальную копию
          //     нельзя ни при каких условиях — она единственная.
          //  2. записи действительно удалены, возможно с другого устройства.
          //     Пустоту обязаны принять, иначе удаление не доедет.
          // Различаем по отметке: если база хоть раз отдавала операции, значит
          // перенос состоялся и ей можно верить.
          if (transactions.length === 0 && !everHadRows) {
            if (prev.transactions.length > 0 || cloudHadData.current) {
              setDataGuard(
                'The cloud database is still empty while this device has data. Showing your local data; nothing was overwritten.',
              )
              return prev
            }
          }
          if (transactions.length > 0) cloudRowsApplied.current = true
          const next = { ...prev, transactions }
          const str = JSON.stringify(next)
          sset(KEY, str) // обновляем офлайн-кэш
          // Кэш в Telegram тоже: иначе он остаётся с уже удалёнными записями и
          // в офлайне показал бы их снова. Но пустотой перезаписываем ТОЛЬКО
          // когда точно знаем, что база авторитетна (перенос состоялся), —
          // иначе можно затереть непереехавшую историю.
          if (hasCloud && cloudLoadOk.current && (transactions.length > 0 || everHadRows)) {
            void bigSet('data', str)
          }
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
      if (!category || amount <= 0 || !validDate(input.date)) {
        tgNotify('error') // форма не заполнена — отклик до появления подсказки
        return false
      }
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
        void (async () => {
          try {
            await api.addTransaction(
              toCloudPayload({ ...input, category, subCategory, payer, note, amount }),
            )
            setCloud('synced')
            syncCloud()
          } catch (e) {
            // Раньше здесь на любую ошибку писался тост «No connection», и
            // отказ сервера (401, 400) выглядел как пропавшая сеть. Внутри
            // Telegram консоли нет, поэтому настоящую причину показываем
            // попапом — иначе её негде увидеть.
            setCloud('offline')
            const msg = e instanceof ApiError ? e.message : 'Unknown error'
            const code = e instanceof ApiError ? ` [${e.status || 'network'}]` : ''
            tgNotify('error')
            tgAlert(`Not saved to the cloud${code}\n\n${msg}`)
            toast('Not saved to the cloud')
          }
        })()
      }
      tgNotify('success')
      toast('Added')
      return true
    },
    [data, persist, toast, syncCloud],
  )

  const delTx = useCallback(
    (id: string) => {
      persist({ ...data, transactions: data.transactions.filter((x) => x.id !== id) })
      if (authedRef.current) {
        api.deleteTransaction(id).catch((e) => {
          // Как и при добавлении: показываем настоящую причину попапом, иначе
          // отказ сервера выглядит как пропавшая сеть, а операция «удалилась»
          // только на экране и вернётся при следующей синхронизации.
          setCloud('offline')
          const msg = e instanceof ApiError ? e.message : 'Unknown error'
          const code = e instanceof ApiError ? ` [${e.status || 'network'}]` : ''
          tgAlert(`Not deleted in the cloud${code}\n\n${msg}`)
          toast('Not deleted in the cloud')
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

  /**
   * Полное стирание. Раньше кнопка «Clear all» очищала только состояние в
   * памяти через persist(): в облаке (D1) записи оставались, и следующая же
   * синхронизация возвращала их обратно — удаление выглядело сделанным ровно
   * до перезагрузки. Плюс предохранитель persist() запрещает писать пустоту
   * поверх непустого хранилища, поэтому копия в Telegram тоже оставалась.
   *
   * Здесь порядок обратный и предохранители сняты осознанно:
   *   1. сначала облако — пока строки в базе, любое локальное стирание временно;
   *   2. только после успеха — локальный кэш, автоснимки и копия в Telegram.
   * Если облако не ответило, НИЧЕГО не стираем и возвращаем причину: соврать
   * «удалено», оставив данные в базе, хуже, чем честно показать ошибку.
   */
  const clearAll = useCallback(async (): Promise<WipeResult> => {
    let deleted: Record<string, number> | undefined
    if (authedRef.current) {
      try {
        const res = await api.wipeAll()
        deleted = res.deleted
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Unknown error'
        setCloud('offline')
        return { ok: false, error: msg }
      }
    }

    const empty = emptyData()
    const emptyStr = JSON.stringify(empty)

    // Локальные копии и всё, из чего данные можно было бы «воскресить».
    dataDirty.current = true
    setData(empty)
    setCursor(cursorFromData(empty))
    sset(KEY, emptyStr)
    srem(KEY + '-snap') // автоснимок начала дня
    srem(KEY + '-bak') // копия испорченной записи, если была
    setProfileState({ name: '', avatar: '' })
    srem(PKEY)
    profileDirty.current = true
    setDataGuard(null)

    // Отметка «база авторитетна» остаётся включённой намеренно: именно по ней
    // syncCloud отличает «историю ещё не перенесли» от «всё удалено» и
    // принимает пустой ответ базы, а не возвращает старый кэш.
    sset(MKEY, '1')

    if (hasCloud) {
      // Предохранитель «не затирать непустое пустым» снимаем: это и есть
      // намеренное стирание, а не сбой чтения.
      cloudHadData.current = false
      cloudRowsApplied.current = false
      await Promise.all([
        bigSet('data', emptyStr),
        bigSet('profile', JSON.stringify({ name: '', avatar: '' })),
        cloudSet('cloudrows', '1'),
      ])
    }

    setCloud(authedRef.current ? 'synced' : 'off')
    return { ok: true, deleted }
  }, [])

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
    Promise.all([
      bigGet('data'),
      cloudGet('theme'),
      bigGet('profile'),
      cloudGet('chartstyle'),
      cloudGet('cloudrows'),
    ])
      .catch((e) => {
        // Чтение не удалось — предохранитель остаётся включённым, писать нельзя.
        setDataGuard(
          'Could not read your Telegram data. Saving is paused so nothing gets overwritten. Check the connection and reopen the app.',
        )
        throw e
      })
      .then(
      ([dataStr, th, profStr, cs, rowsMark]) => {
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
        // Копию из CloudStorage применяем ТОЛЬКО если база ещё не отдала свои
        // операции (медленная сеть, офлайн, пустая база до переноса) — тогда это
        // полезный кэш, а иногда и единственная копия истории. Если операции из
        // D1 уже применены, кэш молчит: иначе он вернул бы удалённые записи.
        // Правки пользователя, сделанные за время загрузки, тоже главнее кэша.
        if (dataStr && !dataDirty.current && !cloudRowsApplied.current) {
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
        // Отметка «база уже отдавала операции» нашлась в облаке, а localStorage
        // о ней не знал (новое устройство, очищенное хранилище). Значит база
        // авторитетна — перечитываем её: только так принимается пустой ответ,
        // когда все записи удалены с другого устройства.
        if (rowsMark === '1') {
          sset(MKEY, '1')
          if (!cloudRowsApplied.current) syncCloud()
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

  // Обновление при возврате к приложению. Telegram не перезагружает страницу,
  // когда её свернули и открыли снова, — без этого удаление, сделанное на
  // сайте, оставалось видимым на телефоне до полного перезапуска.
  // Троттлинг: не чаще раза в 5 секунд, чтобы переключение окон не устроило
  // поток запросов.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!authedRef.current) return
      const now = Date.now()
      if (now - lastSyncAt.current < 5000) return
      lastSyncAt.current = now
      syncCloud()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [syncCloud])

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
