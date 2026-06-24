import { cn } from '@/lib/utils'

/** Сегмент-таблетки (фильтры/периоды). Активный — синий акцент. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line/10 bg-line/[0.04] p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-10 rounded-xl text-[13px] font-semibold transition active:scale-[.97]',
              active
                ? 'bg-accent text-accent-ink shadow-fab'
                : 'text-sub hover:text-ink hover:bg-line/[0.06]',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
