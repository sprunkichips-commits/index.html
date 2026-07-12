// ===== Модель данных, категории, валидация, агрегаты =====
// Формат обратно совместим с исходным приложением — старые записи открываются как есть.

export type TxType = 'Доход' | 'Расход'

export interface Tx {
  id: string
  date: string // YYYY-MM-DD
  type: TxType
  category: string
  amount: number
  note: string
  createdAt?: number // epoch ms — когда операция была добавлена (опц., для старых записей нет)
}

export interface Inv {
  id: string
  name: string
  type: string
  invested: number
  current: number
}

export interface AppData {
  transactions: Tx[]
  investments: Inv[]
}

export interface Cursor {
  y: number
  m: number
}

/** Профиль пользователя: отображаемый ник и аватар (data-URL картинки). */
export interface Profile {
  name: string
  avatar: string
}

// Названия категорий — ДОСЛОВНО как в исходнике (иначе старые операции не сопоставятся).
export const INCOME: string[] = ['YouTube', 'Реклама', 'Офлайн-работа', 'Близкие', 'Прочий доход']

export const EXPENSE: string[] = [
  'Жильё',
  'Продукты',
  'Кафе и рестораны',
  'Транспорт',
  'Интернет и связь',
  'Подписки и сервисы',
  'Оборудование',
  'Софт и инструменты',
  'Реклама и продвижение',
  'Здоровье',
  'Образование',
  'Развлечения',
  'Подарки',
  'Одежда',
  'Налоги',
  'Прочие расходы',
]

// Цвета категорий — ДОСЛОВНО как в исходнике.
export const COL: Record<string, string> = {
  Жильё: '#E1574C',
  Продукты: '#E58A3B',
  'Кафе и рестораны': '#E0B23A',
  Транспорт: '#7FB069',
  'Интернет и связь': '#3FA796',
  'Подписки и сервисы': '#4F86C6',
  Оборудование: '#6C6CD1',
  'Софт и инструменты': '#9B6CCB',
  'Реклама и продвижение': '#C264A0',
  Здоровье: '#D98AA8',
  Образование: '#4EA8DE',
  Развлечения: '#8C7B6B',
  Подарки: '#6B8E9E',
  Одежда: '#A0A65B',
  Налоги: '#C77B58',
  'Прочие расходы': '#9AA0A6',
}

export function cc(c: string): string {
  return COL[c] || '#9AA0A6'
}

// Английские подписи категорий/типов для отображения. Сами значения в данных
// остаются прежними (рус.) — это лишь слой перевода для UI, данные не ломаются.
export const CAT_EN: Record<string, string> = {
  // доходные
  YouTube: 'YouTube',
  Реклама: 'Sponsorships',
  'Офлайн-работа': 'Day job',
  Близкие: 'Family',
  'Прочий доход': 'Other income',
  // расходные
  Жильё: 'Housing',
  Продукты: 'Groceries',
  'Кафе и рестораны': 'Dining out',
  Транспорт: 'Transport',
  'Интернет и связь': 'Internet & phone',
  'Подписки и сервисы': 'Subscriptions',
  Оборудование: 'Equipment',
  'Софт и инструменты': 'Software & tools',
  'Реклама и продвижение': 'Ads & promo',
  Здоровье: 'Health',
  Образование: 'Education',
  Развлечения: 'Entertainment',
  Подарки: 'Gifts',
  Одежда: 'Clothing',
  Налоги: 'Taxes',
  'Прочие расходы': 'Other',
}

export function catLabel(c: string): string {
  return CAT_EN[c] || c
}

export function typeLabel(t: TxType): string {
  return t === 'Доход' ? 'Income' : 'Expense'
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const TYPES = ['Акции', 'ETF', 'Облигации', 'Крипта', 'Депозит', 'Недвижимость', 'Прочее']

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function emptyData(): AppData {
  return { transactions: [], investments: [] }
}

// Потолок размера аватара (длина data-URL). После уменьшения до ~240px аватар
// обычно < 30 000 символов; лимит защищает CloudStorage и хранилище от мусора.
export const AVATAR_MAX = 600_000

export function emptyProfile(): Profile {
  return { name: '', avatar: '' }
}

/**
 * Принимаем аватар ТОЛЬКО как data-URL картинки и в пределах лимита; всё прочее
 * (внешние ссылки http(s):, javascript:, мусор, переразмер) — отбрасываем в ''.
 * Применяется и на чтении, и на записи (защита в глубину).
 */
export function cleanAvatar(av: unknown): string {
  return typeof av === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(av) && av.length <= AVATAR_MAX
    ? av
    : ''
}

/**
 * Разбор/нормализация профиля из строки. Ник — по длине NAME_MAX, аватар — через
 * cleanAvatar. Возвращает пустой профиль при любой ошибке/некорректных данных.
 */
export function parseProfile(raw: string | null): Profile {
  if (!raw) return emptyProfile()
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return emptyProfile()
    const o = p as Record<string, unknown>
    return { name: clampStr(o.name, NAME_MAX), avatar: cleanAvatar(o.avatar) }
  } catch {
    return emptyProfile()
  }
}

// ----- Лимиты ввода/импорта: защита от мусора и переполнения чанков CloudStorage -----
export const NOTE_MAX = 140
export const NAME_MAX = 40
export const TYPE_MAX = 24
export const CAT_MAX = 40
export const AMT_MAX = 1e12
// Потолки восстановления из бэкапа. 20 000 операций — это ~13 лет по 4 в день;
// раньше было 5000 (могло молча отрезать историю многолетнего пользователя).
const MAX_TX = 20_000
const MAX_INV = 500
// Разумный диапазон epoch-ms (2010…2100) — для валидации времени добавления.
const MS_2010 = 1262304000000
const MS_2100 = 4102444800000

export function clampStr(s: unknown, max: number): string {
  return String(s == null ? '' : s).slice(0, max)
}
export function clampAmt(n: unknown): number {
  const v = Number(n)
  if (!isFinite(v) || v < 0) return 0
  return Math.round(Math.min(v, AMT_MAX))
}
function safeId(id: unknown): string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(id) ? id : uid()
}
export function validDate(d: unknown): string | null {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/**
 * Время добавления операции (epoch ms) или null. Берём из createdAt; для старых
 * записей пытаемся достать из id — uid() начинается с Date.now().toString(36)
 * (+5 случайных символов). Если не получилось/вне диапазона — null.
 */
export function addedAt(tx: Tx): number | null {
  if (typeof tx.createdAt === 'number' && tx.createdAt > MS_2010 && tx.createdAt < MS_2100) {
    return tx.createdAt
  }
  const id = tx.id
  if (typeof id === 'string' && id.length >= 8) {
    const ms = parseInt(id.slice(0, id.length - 5), 36)
    if (isFinite(ms) && ms > MS_2010 && ms < MS_2100) return ms
  }
  return null
}

/**
 * Строгая нормализация импортируемого JSON: только ожидаемые поля, числа через
 * Number с клампом, строки — по длине, мусор отбрасывается. Битый ввод не должен
 * ломать приложение или хранилище. Возвращает null, если структура не подходит.
 */
export function sanitize(o: unknown): AppData | null {
  if (!o || typeof o !== 'object') return null
  const obj = o as Record<string, unknown>
  if (!Array.isArray(obj.transactions)) return null

  const transactions: Tx[] = (obj.transactions as unknown[])
    .slice(0, MAX_TX)
    .map((raw): Tx | null => {
      if (!raw || typeof raw !== 'object') return null
      const t = raw as Record<string, unknown>
      const dt = validDate(t.date)
      if (!dt || t.amount == null) return null
      const ca =
        typeof t.createdAt === 'number' && t.createdAt > MS_2010 && t.createdAt < MS_2100
          ? t.createdAt
          : undefined
      return {
        id: safeId(t.id),
        date: dt,
        type: t.type === 'Доход' ? 'Доход' : 'Расход',
        category: clampStr(t.category || 'Прочие расходы', CAT_MAX),
        amount: clampAmt(t.amount),
        note: clampStr(t.note || '', NOTE_MAX),
        ...(ca ? { createdAt: ca } : {}),
      }
    })
    .filter((x): x is Tx => x !== null)

  const investments: Inv[] = Array.isArray(obj.investments)
    ? (obj.investments as unknown[])
        .slice(0, MAX_INV)
        .map((raw): Inv | null => {
          if (!raw || typeof raw !== 'object') return null
          const i = raw as Record<string, unknown>
          return {
            id: safeId(i.id),
            name: clampStr(i.name || 'Актив', NAME_MAX),
            type: clampStr(i.type || 'Прочее', TYPE_MAX),
            invested: clampAmt(i.invested),
            current: clampAmt(i.current),
          }
        })
        .filter((x): x is Inv => x !== null)
    : []

  return { transactions, investments }
}

/**
 * Загрузка из строки localStorage БЕЗ sanitize — как в исходнике, чтобы старые
 * данные открывались 1:1 (обратная совместимость). sanitize применяется только
 * на пути импорта/восстановления.
 */
export function parseStored(raw: string | null): AppData | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    return p && Array.isArray(p.transactions) ? (p as AppData) : null
  } catch {
    return null
  }
}

function dim(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

/** Месяц самой свежей операции, иначе текущий месяц. */
export function cursorFromData(data: AppData): Cursor {
  const ts = data.transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const n = new Date()
  if (ts) {
    const d = new Date(ts.date + 'T00:00:00')
    return { y: d.getFullYear(), m: d.getMonth() }
  }
  return { y: n.getFullYear(), m: n.getMonth() }
}

export interface CatSlice {
  name: string
  value: number
  color: string
}
export interface MonthPoint {
  label: string
  in: number
  ex: number
}
export interface DayPoint {
  day: number
  v: number
}
export interface Stats {
  income: number
  expense: number
  net: number
  rate: number
  monthly: MonthPoint[]
  byCat: CatSlice[]
  daily: DayPoint[]
  avgDay: number
  top: CatSlice | null
  invested: number
  current: number
  invPL: number
  invRet: number
}

/** Агрегаты за выбранный месяц (перенос compute() из исходника). */
export function computeStats(data: AppData, cursor: Cursor): Stats {
  const y = cursor.y
  const m = cursor.m
  const tx = data.transactions
  const inM = (t: Tx) => {
    const d = new Date(t.date + 'T00:00:00')
    return d.getFullYear() === y && d.getMonth() === m
  }
  const mt = tx.filter(inM)
  let income = 0
  let expense = 0
  mt.forEach((t) => {
    if (t.type === 'Доход') income += t.amount
    else expense += t.amount
  })
  const net = income - expense
  const rate = income > 0 ? (net / income) * 100 : 0

  const monthly: MonthPoint[] = MS.map((label, mm) => {
    let inc = 0
    let exp = 0
    tx.forEach((t) => {
      const d = new Date(t.date + 'T00:00:00')
      if (d.getFullYear() === y && d.getMonth() === mm) {
        if (t.type === 'Доход') inc += t.amount
        else exp += t.amount
      }
    })
    return { label, in: inc, ex: exp }
  })

  const cm: Record<string, number> = {}
  mt.forEach((t) => {
    if (t.type === 'Расход') cm[t.category] = (cm[t.category] || 0) + t.amount
  })
  const byCat: CatSlice[] = Object.keys(cm)
    .map((k) => ({ name: k, value: cm[k], color: cc(k) }))
    .sort((a, b) => b.value - a.value)

  const nd = dim(y, m)
  const daily: DayPoint[] = []
  for (let i = 0; i < nd; i++) daily.push({ day: i + 1, v: 0 })
  const adset: Record<number, number> = {}
  let ad = 0
  mt.forEach((t) => {
    if (t.type === 'Расход') {
      const dd = new Date(t.date + 'T00:00:00').getDate()
      daily[dd - 1].v += t.amount
      if (!adset[dd]) {
        adset[dd] = 1
        ad++
      }
    }
  })
  const avgDay = ad ? expense / ad : 0
  const top = byCat[0] || null

  let invested = 0
  let current = 0
  data.investments.forEach((x) => {
    invested += x.invested || 0
    current += x.current || 0
  })
  const invPL = current - invested
  const invRet = invested > 0 ? (invPL / invested) * 100 : 0

  return { income, expense, net, rate, monthly, byCat, daily, avgDay, top, invested, current, invPL, invRet }
}

export const DEMO: AppData = {
  transactions: [
    { id: uid(), date: '2026-06-01', type: 'Доход', category: 'Офлайн-работа', amount: 120000, note: 'Salary' },
    { id: uid(), date: '2026-06-05', type: 'Доход', category: 'YouTube', amount: 45000, note: 'AdSense' },
    { id: uid(), date: '2026-06-10', type: 'Доход', category: 'Реклама', amount: 80000, note: 'Integration' },
    { id: uid(), date: '2026-06-03', type: 'Расход', category: 'Жильё', amount: 35000, note: 'Rent' },
    { id: uid(), date: '2026-06-03', type: 'Расход', category: 'Транспорт', amount: 600, note: 'Metro' },
    { id: uid(), date: '2026-06-08', type: 'Расход', category: 'Подписки и сервисы', amount: 4500, note: 'Adobe' },
    { id: uid(), date: '2026-06-12', type: 'Расход', category: 'Оборудование', amount: 60000, note: 'Microphone' },
    { id: uid(), date: '2026-06-14', type: 'Расход', category: 'Подарки', amount: 5000, note: "Friend's birthday" },
    { id: uid(), date: '2026-06-22', type: 'Расход', category: 'Продукты', amount: 3100, note: 'Grocery store' },
  ],
  investments: [],
}
