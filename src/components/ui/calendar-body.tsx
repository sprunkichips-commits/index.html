import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

/**
 * Сетка календаря в манере системного iOS: месяц с годом крупно слева, стрелки
 * справа, дни в кружках, одна буква на день недели. Прежний вид был плотным и
 * «табличным»; по крупному кружку ещё и попадать пальцем проще.
 *
 * Вынесено в отдельный модуль ради ленивой загрузки: при старте приложения
 * календарь не нужен, он приезжает при первом открытии (см. CalendarPanel в EntryTiles).
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
      // Одна буква на день недели, как в системном календаре.
      formatters={{ formatWeekdayName: (d) => WEEKDAYS[d.getDay()] }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />,
      }}
      classNames={DP}
    />
  )
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Классы react-day-picker под тёмную тему приложения. */
const DP = {
  root: 'w-full',
  // relative именно здесь: стрелки навигации — потомок months и позиционируются
  // absolute. Без точки отсчёта они уезжали к ближайшему позиционированному
  // родителю, то есть в шапку шторки, к кнопке закрытия. На month ставить
  // бесполезно — nav ему не потомок, а сосед.
  months: 'relative w-full',
  month: 'w-full',
  // Подпись месяца прижата влево, стрелки — вправо: как в системном календаре.
  month_caption: 'flex h-10 items-center pl-1',
  caption_label: 'text-[17px] font-bold text-ink',
  nav: 'absolute right-0 top-1 flex items-center gap-1',
  button_previous:
    'grid h-9 w-9 place-items-center rounded-full text-accent transition-colors hover:bg-line/[0.08] disabled:opacity-30',
  button_next:
    'grid h-9 w-9 place-items-center rounded-full text-accent transition-colors hover:bg-line/[0.08] disabled:opacity-30',
  month_grid: 'w-full border-collapse',
  weekdays: 'grid grid-cols-7',
  weekday: 'pb-1.5 pt-1 text-center text-[12px] font-semibold text-faint',
  weeks: '',
  week: 'grid grid-cols-7',
  day: 'p-0 text-center',
  // Круглая ячейка во всю ширину колонки — палец попадает без прицеливания.
  day_button:
    'mx-auto grid aspect-square w-full max-w-[40px] place-items-center rounded-full text-[17px] text-ink transition-colors hover:bg-line/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
  // Подсветка «сегодня» — только пока этот день НЕ выбран. Иначе два правила
  // задают цвет текста с одинаковой специфичностью, и победитель зависит от
  // порядка в собранном CSS: получался цветной текст на цветном фоне.
  today: '[&:not([data-selected])_button]:font-bold [&:not([data-selected])_button]:text-accent',
  selected:
    '[&_button]:bg-[var(--dp-accent)] [&_button]:text-[var(--dp-ink)] [&_button]:font-semibold [&_button:hover]:bg-[var(--dp-accent)] [&_button:hover]:brightness-110',
  outside: '[&_button]:text-faint [&_button]:opacity-40',
  disabled: '[&_button]:opacity-30 [&_button]:pointer-events-none',
  hidden: 'invisible',
}
