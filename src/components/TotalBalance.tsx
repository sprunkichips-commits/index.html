import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarClock, Wallet } from 'lucide-react'
import { Card } from './ui/card'
import { useStore } from '@/store/StoreContext'
import { computeBalance } from '@/lib/balance'
import { MS } from '@/lib/data'
import { fmtDateLong, rub, rubS } from '@/lib/format'
import { localDateStr } from '@/lib/goals'
import { cn } from '@/lib/utils'

/**
 * Виджет «Total balance» — сколько денег есть прямо сейчас.
 *
 * Намеренно НЕ зависит от выбранного месяца: карточка ниже показывает итог
 * месяца и переключается стрелками, а эта — накопительный остаток по всей
 * истории. Поэтому она не читает cursor и не перерисовывается при листании
 * месяцев.
 *
 * Считает по тем же данным, что и весь остальной экран (data.transactions), —
 * отдельного запроса к серверу нет, поэтому число не может разойтись со
 * списком операций и обновляется сразу после добавления или удаления.
 */
export function TotalBalance() {
  const { data } = useStore()
  const b = useMemo(() => computeBalance(data.transactions, localDateStr()), [data.transactions])
  const monthShort = MS[new Date().getMonth()]
  const empty = b.count === 0

  return (
    <Card hover className="overflow-hidden p-5">
      {/* Подпись и метка месяца — одной строкой сверху, а сумма отдельной строкой
          во всю ширину: на телефоне иначе не хватало места и «₽» переносился на
          следующую строку. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 whitespace-nowrap text-xs uppercase tracking-wide text-faint">
          <Wallet size={12} /> Total balance
        </div>

        {/* Насколько остаток сдвинулся в текущем календарном месяце. Именно в
            текущем, а не в выбранном стрелками: виджет о «сейчас». */}
        {!empty && (
          <span
            className={cn(
              'mono flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold',
              b.thisMonth > 0
                ? 'bg-pos/15 text-pos'
                : b.thisMonth < 0
                  ? 'bg-neg/15 text-neg'
                  : 'bg-line/10 text-sub',
            )}
          >
            {rubS(b.thisMonth)} · {monthShort}
          </span>
        )}
      </div>

      <div
        className={cn(
          // clamp вместо брейкпоинта: сумма не переносится и не вылезает за
          // карточку ни на узком телефоне, ни при семизначном остатке.
          'mono mt-2 whitespace-nowrap text-[clamp(28px,8.2vw,38px)] font-bold leading-none',
          // Нейтральный цвет для положительного остатка намеренно: это факт, а
          // не оценка «хорошо/плохо». Лаймовый акцент на светлой теме давал
          // контраст около 2:1 — самый бледный текст на экране, а тут главное
          // число. Минус остаётся красным: это уже сигнал.
          empty ? 'text-faint' : b.total >= 0 ? 'text-ink' : 'text-neg',
        )}
      >
        {rub(b.total)}
      </div>
      <div className="mt-2 text-[11px] leading-snug text-faint">
        {empty ? 'No records yet' : 'Everything you have on hand today — all months together'}
      </div>

      {!empty && (
        <>
          {/* Телефон — две колонки, широкий экран — в строку: на десктопе
              колонки растягивались на всю карточку и «Spent» уезжал к правому краю. */}
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line/10 pt-4 sm:flex sm:gap-8">
            <Line
              icon={<ArrowUpRight size={16} />}
              tone="pos"
              label="Earned"
              value={rub(b.income)}
            />
            <Line
              icon={<ArrowDownRight size={16} />}
              tone="neg"
              label="Spent"
              value={rub(b.expense)}
            />
          </div>

          <div className="mt-3 text-[11px] text-faint">
            All time · {b.count} {b.count === 1 ? 'record' : 'records'}
            {b.firstDate && <> · since {fmtDateLong(b.firstDate)}</>}
          </div>

          {/* Записи будущей датой существуют, но денег на руках ещё не меняли —
              говорим об этом прямо, чтобы разница с суммой списка не выглядела
              ошибкой. */}
          {b.planned !== 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
              <CalendarClock size={12} className="flex-none" />
              {rubS(b.planned)} dated later — not counted yet
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function Line({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode
  tone: 'pos' | 'neg'
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          'grid h-9 w-9 flex-none place-items-center rounded-xl',
          tone === 'pos' ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
        <div className="mono truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  )
}
