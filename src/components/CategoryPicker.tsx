import { useMemo, useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { catLabel, type Tx, type TxType } from '@/lib/data'
import { tgImpact } from '@/lib/telegram'
import { CategoryIcon } from './CategoryIcon'
import { cn } from '@/lib/utils'

const VISIBLE = 8

/**
 * Выбор категории сеткой кнопок вместо выпадающего списка.
 *
 * Список закрывал клавиатуру и менял высоту шторки: при тапе интерфейс на миг
 * распадался и собирался обратно. Сетка живёт прямо в форме — выбор одним
 * касанием, ничего не открывается и не закрывается.
 *
 * Порядок — по тому, как часто категория встречается в собственных операциях
 * пользователя: то, чем он пользуется каждый день, оказывается в первом ряду.
 * Остальные прячутся за «More» и раскрываются на месте.
 */
export function CategoryPicker({
  value,
  onChange,
  options,
  type,
  transactions,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  type: TxType
  /** Свои операции — по ним считается частота. */
  transactions: Tx[]
  /** Подсветить: пользователь пытался сохранить, не выбрав категорию. */
  invalid?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const still = useReducedMotion()

  // Поле, в котором пользователь печатал до тапа по категории.
  // preventDefault на mousedown удерживает фокус только при работе мышью; на
  // касании браузер всё равно переводит фокус на кнопку, и клавиатура уезжает.
  // Поэтому запоминаем поле и возвращаем фокус сразу после выбора — в том же
  // жесте, так что клавиатура не успевает закрыться.
  const lastField = useRef<HTMLElement | null>(null)

  function rememberField() {
    const el = document.activeElement
    lastField.current = el instanceof HTMLInputElement ? el : null
  }

  function restoreField() {
    const el = lastField.current
    lastField.current = null
    el?.focus({ preventScroll: true })
  }

  const ordered = useMemo(() => {
    const freq = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== type) continue
      freq.set(t.category, (freq.get(t.category) || 0) + 1)
    }
    // Стабильность важнее: при равной частоте порядок остаётся исходным,
    // иначе кнопки прыгали бы местами между открытиями формы.
    return options
      .map((name, i) => ({ name, n: freq.get(name) || 0, i }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .map((x) => x.name)
  }, [options, transactions, type])

  // Выбранная категория всегда на виду, даже если по частоте она в «хвосте»:
  // иначе после сворачивания списка выбор пропадал бы с экрана.
  const shown = (() => {
    if (expanded) return ordered
    const head = ordered.slice(0, VISIBLE)
    if (!value || head.includes(value)) return head
    return [...head.slice(0, VISIBLE - 1), value]
  })()
  const rest = ordered.length - VISIBLE

  return (
    <div>
      <div
        className={cn(
          'grid grid-cols-4 gap-1.5 rounded-2xl p-1.5 transition-colors',
          invalid ? 'bg-neg/10 ring-1 ring-neg/50' : 'bg-line/[0.03]',
        )}
      >
        {shown.map((name) => {
          const active = name === value
          return (
            <m.button
              key={name}
              type="button"
              data-category={name}
              onMouseDown={(e) => {
                e.preventDefault() // мышь: фокус вообще не уходит
                rememberField()
              }}
              onTouchStart={rememberField} // касание: preventDefault отменил бы тап
              onClick={() => {
                if (name !== value) tgImpact('light')
                onChange(name)
                restoreField()
              }}
              aria-pressed={active}
              whileTap={still ? undefined : { scale: 0.94 }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors',
                active ? 'bg-accent/15 ring-1 ring-accent/60' : 'hover:bg-line/[0.06]',
              )}
            >
              <CategoryIcon category={name} income={type === 'Доход'} />
              <span
                className={cn(
                  'w-full truncate text-center text-[10px] leading-tight',
                  active ? 'font-semibold text-ink' : 'text-sub',
                )}
              >
                {catLabel(name)}
              </span>
            </m.button>
          )
        })}
      </div>

      {rest > 0 && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            rememberField()
          }}
          onTouchStart={rememberField}
          onClick={() => {
            setExpanded((v) => !v)
            restoreField()
          }}
          className="mt-1.5 flex w-full items-center justify-center gap-1 py-1 text-xs font-medium text-sub transition-colors hover:text-ink"
        >
          {expanded ? 'Less' : `More (${rest})`}
          <ChevronDown
            size={13}
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      )}
    </div>
  )
}
