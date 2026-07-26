import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

/**
 * Сама сетка календаря, вынесенная в отдельный модуль ради ленивой загрузки:
 * при старте приложения календарь не нужен, он приезжает при первом открытии
 * (см. DatePicker). Для Mini App это заметно — трафик мобильный, и лишние
 * килобайты задерживают первый экран.
 */
export default function CalendarBody({
  selected,
  onPick,
}: {
  selected: Date | undefined
  onPick: (d: Date | undefined) => void
}) {
  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onPick}
      defaultMonth={selected}
      weekStartsOn={1}
      showOutsideDays
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft size={17} /> : <ChevronRight size={17} />,
      }}
      className="text-sm"
      classNames={DP}
    />
  )
}

/** Классы react-day-picker под тёмную тему приложения. */
const DP = {
  root: 'w-full',
  months: 'w-full',
  month: 'w-full',
  month_caption: 'flex h-9 items-center justify-center',
  caption_label: 'text-sm font-semibold text-ink',
  nav: 'absolute inset-x-0 top-3 flex items-center justify-between px-1',
  button_previous:
    'grid h-8 w-8 place-items-center rounded-lg text-sub transition-colors hover:bg-line/[0.08] hover:text-ink disabled:opacity-30',
  button_next:
    'grid h-8 w-8 place-items-center rounded-lg text-sub transition-colors hover:bg-line/[0.08] hover:text-ink disabled:opacity-30',
  month_grid: 'w-full border-collapse',
  weekdays: 'grid grid-cols-7',
  weekday: 'pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-faint',
  weeks: '',
  week: 'grid grid-cols-7',
  day: 'p-0.5 text-center',
  day_button:
    'mx-auto grid h-9 w-9 place-items-center rounded-xl text-sm text-ink transition-colors hover:bg-line/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
  // Подсветка «сегодня» — только пока этот день НЕ выбран. Иначе два правила
  // задают цвет текста с одинаковой специфичностью, и победитель зависит от
  // порядка в собранном CSS: получался зелёный текст на красном фоне.
  today: '[&:not([data-selected])_button]:font-bold [&:not([data-selected])_button]:text-accent',
  selected:
    '[&_button]:bg-[var(--dp-accent)] [&_button]:text-[var(--dp-ink)] [&_button]:font-semibold [&_button:hover]:bg-[var(--dp-accent)] [&_button:hover]:brightness-110',
  outside: '[&_button]:text-faint [&_button]:opacity-45',
  disabled: '[&_button]:opacity-30 [&_button]:pointer-events-none',
  hidden: 'invisible',
}
