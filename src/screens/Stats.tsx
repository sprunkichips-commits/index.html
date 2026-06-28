import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, MousePointerClick } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { computeStats, MONTHS, MS } from '@/lib/data'
import { rub } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { BarStat, type BarPoint } from '@/components/charts/BarStat'
import { GroupedMonths } from '@/components/charts/GroupedMonths'
import { CategoryIcon } from '@/components/CategoryIcon'
import { cn } from '@/lib/utils'

type Mode = 'days' | 'weeks' | 'months'

export function Stats() {
  const { data, cursor } = useStore()
  const D = useMemo(() => computeStats(data, cursor), [data, cursor])
  const [mode, setMode] = useState<Mode>('months')
  const [sel, setSel] = useState(0)

  // данные графика по режиму
  const bars: BarPoint[] = useMemo(() => {
    if (mode === 'months') return D.monthly.map((m) => ({ label: m.label, value: m.ex }))
    if (mode === 'days') return D.daily.map((d) => ({ label: String(d.day), value: d.v }))
    // weeks
    const weeks: BarPoint[] = []
    const ranges: [number, number][] = [
      [1, 7], [8, 14], [15, 21], [22, 28], [29, 31],
    ]
    ranges.forEach(([a, b]) => {
      const slice = D.daily.filter((d) => d.day >= a && d.day <= b)
      if (slice.length) weeks.push({ label: `${a}–${Math.min(b, D.daily.length)}`, value: slice.reduce((s, d) => s + d.v, 0) })
    })
    return weeks
  }, [mode, D])

  // выбранный по умолчанию: для месяцев — текущий месяц курсора, иначе — макс. столбец
  useEffect(() => {
    if (mode === 'months') {
      setSel(cursor.m)
    } else {
      let mi = 0
      bars.forEach((b, i) => {
        if (b.value > (bars[mi]?.value || 0)) mi = i
      })
      setSel(mi)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cursor.m, cursor.y, data.transactions.length])

  const selBar = bars[sel]
  const selLabel =
    mode === 'months'
      ? `Расход · ${MONTHS[sel] ?? ''} ${cursor.y}`
      : mode === 'days'
        ? `Расход · ${selBar?.label ?? ''} ${MS[cursor.m]}`
        : `Расход · дни ${selBar?.label ?? ''}`

  // изменение по категориям месяц-к-месяцу
  const prevCat = useMemo(() => {
    const prev = new Date(cursor.y, cursor.m - 1, 1)
    const py = prev.getFullYear()
    const pm = prev.getMonth()
    const acc: Record<string, number> = {}
    data.transactions.forEach((t) => {
      if (t.type !== 'Расход') return
      const d = new Date(t.date + 'T00:00:00')
      if (d.getFullYear() === py && d.getMonth() === pm) acc[t.category] = (acc[t.category] || 0) + t.amount
    })
    return acc
  }, [data.transactions, cursor.y, cursor.m])

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <Segmented
          value={mode}
          onChange={(m) => setMode(m)}
          options={[
            { value: 'days', label: 'Дни' },
            { value: 'weeks', label: 'Недели' },
            { value: 'months', label: 'Месяцы' },
          ]}
          className="mb-4"
        />
        <div className="text-xs uppercase tracking-wide text-faint">{selLabel}</div>
        <div className="mono mt-1 text-3xl font-bold">{rub(selBar?.value || 0)}</div>

        <div className="mt-3">
          <BarStat data={bars} selected={sel} onSelect={setSel} />
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-faint">
          <MousePointerClick size={13} /> нажми на столбец, чтобы выбрать период
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Доходы и расходы по месяцам</div>
          <div className="flex gap-3 text-[11px] text-sub">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-pos" /> доход
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-neg" /> расход
            </span>
          </div>
        </div>
        <GroupedMonths data={D.monthly} />
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Куда уходят деньги</div>
        {D.byCat.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">В этом месяце трат нет</div>
        ) : (
          <div className="flex flex-col">
            {D.byCat.map((c, i) => {
              const prev = prevCat[c.name] || 0
              const delta = prev > 0 ? ((c.value - prev) / prev) * 100 : null
              const up = delta != null && delta > 0 // расход вырос — это «хуже» (красный)
              const share = D.expense > 0 ? (c.value / D.expense) * 100 : 0
              return (
                <div key={c.name} className={cn('flex items-center gap-3 py-2.5', i && 'border-t border-line/8')}>
                  <CategoryIcon category={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-faint">{Math.round(share)}% от расходов</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm font-semibold">{rub(c.value)}</div>
                    {delta != null ? (
                      <div
                        className={cn(
                          'mono flex items-center justify-end gap-0.5 text-xs font-semibold',
                          up ? 'text-neg' : 'text-pos',
                        )}
                      >
                        {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(Math.round(delta))}%
                      </div>
                    ) : (
                      <div className="text-xs text-faint">новое</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
