import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { MONTHS } from '@/lib/data'

export function MonthSelector() {
  const { cursor, shiftMonth } = useStore()
  return (
    <div className="flex flex-none items-center gap-0.5 rounded-2xl glass border-line/10 p-1">
      <button
        onClick={() => shiftMonth(-1)}
        aria-label="Предыдущий месяц"
        className="grid h-10 w-10 place-items-center rounded-xl text-sub transition hover:bg-line/[0.08] hover:text-ink active:scale-95"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-[112px] truncate text-center text-sm font-semibold capitalize sm:min-w-[128px]">
        {MONTHS[cursor.m]} {cursor.y}
      </span>
      <button
        onClick={() => shiftMonth(1)}
        aria-label="Следующий месяц"
        className="grid h-10 w-10 place-items-center rounded-xl text-sub transition hover:bg-line/[0.08] hover:text-ink active:scale-95"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
