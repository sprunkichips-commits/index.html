import * as React from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { CalendarDays, Loader2 } from 'lucide-react'
import { useIsMobileUi } from '@/hooks/useMediaQuery'
import { fmtDateLong, today } from '@/lib/format'
import { cn } from '@/lib/utils'

// Ленивая загрузка: сетка календаря приезжает при первом открытии.
const CalendarBody = React.lazy(() => import('./calendar-body'))

/**
 * Выбор даты своим календарём вместо <input type="date">.
 *
 * Нативное поле в Telegram Webview ведёт себя по-разному на iOS, Android и в
 * настольном клиенте: где-то это колёсики поверх экрана, где-то полноценный
 * системный диалог, а где-то просто текстовое поле с невидимой маской. Свой
 * календарь одинаков везде и красится в тему приложения.
 *
 * Значение — строка YYYY-MM-DD: тот же формат, что хранится в базе, поэтому
 * вызывающий код не занимается преобразованиями.
 */
export function DatePicker({
  value,
  onChange,
  accent = 'accent',
  className,
}: {
  value: string
  onChange: (v: string) => void
  /** Цвет выбранного дня: под тип операции — расход красный, доход зелёный. */
  accent?: 'accent' | 'pos' | 'neg'
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const mobile = useIsMobileUi()
  const still = useReducedMotion()
  const wrap = React.useRef<HTMLDivElement>(null)

  const selected = parseDay(value)

  // Клик мимо календаря закрывает его. Только на ПК: на телефоне календарь
  // раскрывается внутри шторки и закрывается выбором даты или повторным тапом,
  // а перехват касаний мешал бы жесту закрытия самой шторки.
  React.useEffect(() => {
    if (!open || mobile) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // Esc закрывает календарь, а не всю форму
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, mobile])

  function pick(d: Date | undefined) {
    if (!d) return
    onChange(toDayString(d))
    setOpen(false)
  }

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <m.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        whileTap={still ? undefined : { scale: 0.99 }}
        className={cn(
          'flex h-12 w-full items-center gap-2.5 rounded-xl border border-line/12 bg-line/[0.04] px-3 text-left',
          'transition-colors hover:bg-line/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        )}
      >
        <CalendarDays size={16} className="flex-none text-faint" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {value ? fmtDateLong(value) : 'Pick a date'}
        </span>
        {value === today() && <span className="flex-none text-xs text-faint">Today</span>}
      </m.button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            // На телефоне — раскрытие в потоке (внутри шторки), на ПК — поповер
            // поверх содержимого. Разница именно в позиционировании: в шторке
            // всплывающий слой обрезался бы её прокруткой.
            className={cn(
              'z-30 overflow-hidden rounded-2xl border border-line/12 bg-card shadow-lift',
              mobile ? 'relative mt-2' : 'absolute left-0 right-0 top-[calc(100%+8px)]',
              ACCENT_VAR[accent],
            )}
            initial={still ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
            animate={still ? { opacity: 1 } : { opacity: 1, height: 'auto', y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="p-3">
              <React.Suspense fallback={<CalendarSkeleton />}>
                <CalendarBody selected={selected} onPick={pick} />
              </React.Suspense>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Заглушка на время загрузки календаря — размером примерно как он сам,
 *  чтобы шторка не подпрыгнула, когда модуль приедет. */
function CalendarSkeleton() {
  return (
    <div className="grid h-[292px] place-items-center text-faint">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

/**
 * Цвет выбранного дня задаётся переменной, а не тремя наборами классов:
 * так calendar-разметка остаётся одной, а тему задаёт вызывающий.
 */
const ACCENT_VAR: Record<string, string> = {
  accent: '[--dp-accent:hsl(var(--accent))] [--dp-ink:hsl(var(--accent-ink))]',
  pos: '[--dp-accent:hsl(var(--pos))] [--dp-ink:#fff]',
  neg: '[--dp-accent:hsl(var(--neg))] [--dp-ink:#fff]',
}

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
