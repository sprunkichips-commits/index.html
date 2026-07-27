import * as React from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { CalendarDays, ChevronDown, Loader2 } from 'lucide-react'
import { catLabel, type Tx, type TxType } from '@/lib/data'
import { tgImpact } from '@/lib/telegram'
import { CategoryIcon } from './CategoryIcon'
import { cn } from '@/lib/utils'

// Сетка календаря приезжает по требованию — при старте она не нужна.
const CalendarBody = React.lazy(() => import('./ui/calendar-body'))

/**
 * Категория и дата одной строкой: слева плитка категории (иконка + название),
 * справа квадрат даты. Обе раскрывают свою панель НА МЕСТЕ, ниже строки, и
 * только по одной за раз — так высота формы предсказуема, а вторая панель не
 * выталкивает первую.
 *
 * Раскрытие анимируется масштабом и прозрачностью. Высоту не анимируем: её
 * анимация пересчитывает раскладку каждый кадр и даёт рывок, особенно когда
 * рядом выезжает клавиатура.
 */

/** Что сейчас раскрыто под строкой плиток. */
export type EntryPanel = 'category' | 'date' | null

// ---------- Плитки ----------

const TILE =
  'flex items-center gap-2.5 rounded-2xl border bg-line/[0.04] px-3 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'

/**
 * Фокус нужно сохранить: тап по плитке не должен закрывать клавиатуру.
 * preventDefault на mousedown спасает только мышь — на касании браузер всё
 * равно переводит фокус на кнопку, поэтому поле запоминается и фокус
 * возвращается в том же жесте.
 */
function useKeepFocus() {
  const field = React.useRef<HTMLInputElement | null>(null)
  const remember = () => {
    const el = document.activeElement
    field.current = el instanceof HTMLInputElement ? el : null
  }
  const restore = () => {
    const el = field.current
    field.current = null
    el?.focus({ preventScroll: true })
  }
  return { remember, restore }
}

export function CategoryTile({
  value,
  type,
  open,
  invalid,
  onToggle,
}: {
  value: string
  type: TxType
  open: boolean
  invalid?: boolean
  onToggle: () => void
}) {
  const { remember, restore } = useKeepFocus()
  return (
    <button
      type="button"
      data-tile="category"
      aria-expanded={open}
      onMouseDown={(e) => {
        e.preventDefault()
        remember()
      }}
      onTouchStart={remember}
      onClick={() => {
        onToggle()
        restore()
      }}
      className={cn(
        TILE,
        'h-[58px] min-w-0 flex-1 text-left',
        invalid ? 'border-neg/60 ring-1 ring-neg/40' : open ? 'border-accent/60' : 'border-line/12',
      )}
    >
      {value ? (
        <CategoryIcon category={value} income={type === 'Доход'} />
      ) : (
        <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-line/[0.07] text-faint">
          <ChevronDown size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wide text-faint">Category</span>
        <span
          className={cn(
            'block truncate text-sm font-semibold',
            value ? 'text-ink' : 'text-faint',
          )}
        >
          {value ? catLabel(value) : 'Choose'}
        </span>
      </span>
      <ChevronDown
        size={15}
        className={cn('flex-none text-faint transition-transform', open && 'rotate-180')}
      />
    </button>
  )
}

export function DateTile({
  value,
  open,
  onToggle,
}: {
  /** YYYY-MM-DD */
  value: string
  open: boolean
  onToggle: () => void
}) {
  const { remember, restore } = useKeepFocus()
  const d = parseDay(value)
  return (
    <button
      type="button"
      data-tile="date"
      aria-expanded={open}
      onMouseDown={(e) => {
        e.preventDefault()
        remember()
      }}
      onTouchStart={remember}
      onClick={() => {
        onToggle()
        restore()
      }}
      className={cn(
        TILE,
        'h-[58px] w-[76px] flex-none flex-col justify-center gap-0 px-2',
        open ? 'border-accent/60' : 'border-line/12',
      )}
    >
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
        <CalendarDays size={11} />
        {d ? MONTHS_SHORT[d.getMonth()] : '—'}
      </span>
      <span className="mono text-lg font-bold leading-tight text-ink">
        {d ? d.getDate() : '—'}
      </span>
    </button>
  )
}

// ---------- Панели ----------

/** Общая обёртка панели: выплывает масштабом и прозрачностью, без height. */
function Panel({ children }: { children: React.ReactNode }) {
  const still = useReducedMotion()
  return (
    <m.div
      initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
      animate={still ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: 'top center' }}
      className="mt-2 rounded-2xl border border-line/12 bg-line/[0.03] p-2"
    >
      {children}
    </m.div>
  )
}

/**
 * Сетка иконок категорий. Порядок — по частоте в собственных операциях
 * пользователя: то, чем он пользуется каждый день, стоит первым. При равной
 * частоте позиции сохраняются, иначе кнопки прыгали бы между открытиями.
 */
export function CategoryGrid({
  value,
  onChange,
  options,
  type,
  transactions,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  type: TxType
  transactions: Tx[]
}) {
  const still = useReducedMotion()
  const { remember, restore } = useKeepFocus()

  const ordered = React.useMemo(() => {
    const freq = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== type) continue
      freq.set(t.category, (freq.get(t.category) || 0) + 1)
    }
    return options
      .map((name, i) => ({ name, n: freq.get(name) || 0, i }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .map((x) => x.name)
  }, [options, transactions, type])

  return (
    <Panel>
      <div className="grid grid-cols-4 gap-1">
        {ordered.map((name, i) => (
          <m.button
            key={name}
            type="button"
            data-category={name}
            // Иконки появляются волной: каждая следующая на 12 мс позже.
            // Задержка обрезана сверху, чтобы последние не отставали заметно.
            initial={still ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.14, delay: still ? 0 : Math.min(i, 8) * 0.012 }}
            whileTap={still ? undefined : { scale: 0.93 }}
            onMouseDown={(e) => {
              e.preventDefault()
              remember()
            }}
            onTouchStart={remember}
            onClick={() => {
              if (name !== value) tgImpact('light')
              onChange(name)
              restore()
            }}
            aria-pressed={name === value}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors',
              name === value ? 'bg-accent/15 ring-1 ring-accent/60' : 'hover:bg-line/[0.06]',
            )}
          >
            <CategoryIcon category={name} income={type === 'Доход'} />
            <span
              className={cn(
                'w-full truncate text-center text-[10px] leading-tight',
                name === value ? 'font-semibold text-ink' : 'text-sub',
              )}
            >
              {catLabel(name)}
            </span>
          </m.button>
        ))}
      </div>
    </Panel>
  )
}

/** Панель календаря. Цвет выбранного дня — под тип операции. */
export function CalendarPanel({
  value,
  onChange,
  accent = 'accent',
}: {
  value: string
  onChange: (v: string) => void
  accent?: 'accent' | 'pos' | 'neg'
}) {
  const { remember, restore } = useKeepFocus()
  return (
    <Panel>
      <div
        className={cn('px-1 pb-1', ACCENT_VAR[accent])}
        onMouseDown={(e) => {
          // Тап по календарю не должен уводить фокус с поля суммы: иначе
          // клавиатура закроется и вся раскладка придёт в движение.
          e.preventDefault()
          remember()
        }}
        onTouchStart={remember}
      >
        <React.Suspense fallback={<CalendarSkeleton />}>
          <CalendarBody
            selected={parseDay(value)}
            onPick={(d) => {
              if (!d) return
              tgImpact('light')
              onChange(toDayString(d))
              restore()
            }}
          />
        </React.Suspense>
      </div>
    </Panel>
  )
}

function CalendarSkeleton() {
  return (
    <div className="grid h-[300px] place-items-center text-faint">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

const ACCENT_VAR: Record<string, string> = {
  accent: '[--dp-accent:hsl(var(--accent))] [--dp-ink:hsl(var(--accent-ink))]',
  pos: '[--dp-accent:hsl(var(--pos))] [--dp-ink:#fff]',
  neg: '[--dp-accent:hsl(var(--neg))] [--dp-ink:#fff]',
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** YYYY-MM-DD → Date в местном времени (без сдвига на часовой пояс). */
function parseDay(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? undefined : d
}

/**
 * Date → YYYY-MM-DD по местному календарю. Через toISOString нельзя: он
 * переводит в UTC, и вечером в положительном часовом поясе дата уезжала бы
 * на день вперёд — операция попадала не в тот день.
 */
function toDayString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
