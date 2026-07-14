import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, MousePointerClick } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { catLabel, computeStats, MONTHS, MS, typeLabel, type TxType } from '@/lib/data'
import { hasSubCategories } from '@/lib/categories'
import { rub } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { BarStat, type BarPoint } from '@/components/charts/BarStat'
import { StudioLine } from '@/components/charts/StudioLine'
import { GroupedMonths } from '@/components/charts/GroupedMonths'
import { CategoryIcon } from '@/components/CategoryIcon'
import { CategoryDetailSheet } from '@/components/CategoryDetailSheet'
import { cn } from '@/lib/utils'

type Mode = 'days' | 'weeks' | 'months' | 'years'

interface CatRow {
  name: string
  value: number
  delta: number | null
}

export function Stats() {
  const { data, cursor, chartStyle } = useStore()
  const D = useMemo(() => computeStats(data, cursor), [data, cursor])
  const [view, setView] = useState<TxType>('Расход')
  const [mode, setMode] = useState<Mode>('months')
  const [sel, setSel] = useState(0)
  const [detailCat, setDetailCat] = useState<string | null>(null)

  // Один проход по операциям выбранного типа: ряды для всех режимов + категории.
  const agg = useMemo(() => {
    const y = cursor.y
    const m = cursor.m
    const nd = new Date(y, m + 1, 0).getDate()
    const prev = new Date(y, m - 1, 1)
    const py = prev.getFullYear()
    const pm = prev.getMonth()

    const months = new Array(12).fill(0)
    const days = new Array(nd).fill(0)
    const byYear: Record<number, number> = {}
    const catNow: Record<string, number> = {}
    const catPrev: Record<string, number> = {}

    data.transactions.forEach((t) => {
      if (t.type !== view) return
      const d = new Date(t.date + 'T00:00:00')
      const ty = d.getFullYear()
      const tm = d.getMonth()
      const td = d.getDate()
      byYear[ty] = (byYear[ty] || 0) + t.amount
      if (ty === y) months[tm] += t.amount
      if (ty === y && tm === m) {
        days[td - 1] += t.amount
        catNow[t.category] = (catNow[t.category] || 0) + t.amount
      }
      if (ty === py && tm === pm) catPrev[t.category] = (catPrev[t.category] || 0) + t.amount
    })

    const years = Object.keys(byYear)
      .map(Number)
      .sort((a, b) => a - b)

    const total = Object.values(catNow).reduce((s, v) => s + v, 0)
    const cats: CatRow[] = Object.keys(catNow)
      .map((name) => {
        const p = catPrev[name] || 0
        return { name, value: catNow[name], delta: p > 0 ? ((catNow[name] - p) / p) * 100 : null }
      })
      .sort((a, b) => b.value - a.value)

    return { months, days, years, byYear, cats, total, nd }
  }, [data.transactions, cursor.y, cursor.m, view])

  // Данные графика по режиму
  const bars: BarPoint[] = useMemo(() => {
    if (mode === 'months') return MS.map((label, i) => ({ label, value: agg.months[i] }))
    if (mode === 'days') return agg.days.map((v, i) => ({ label: String(i + 1), value: v }))
    if (mode === 'years') return agg.years.map((yy) => ({ label: String(yy), value: agg.byYear[yy] }))
    // weeks
    const weeks: BarPoint[] = []
    const ranges: [number, number][] = [
      [1, 7], [8, 14], [15, 21], [22, 28], [29, 31],
    ]
    ranges.forEach(([a, b]) => {
      const slice = agg.days.slice(a - 1, b)
      if (slice.length) weeks.push({ label: `${a}–${Math.min(b, agg.nd)}`, value: slice.reduce((s, v) => s + v, 0) })
    })
    return weeks
  }, [mode, agg])

  // Выбранный по умолчанию
  useEffect(() => {
    if (mode === 'months') {
      setSel(cursor.m)
    } else if (mode === 'years') {
      const i = agg.years.indexOf(cursor.y)
      setSel(i >= 0 ? i : Math.max(0, agg.years.length - 1))
    } else {
      let mi = 0
      bars.forEach((b, i) => {
        if (b.value > (bars[mi]?.value || 0)) mi = i
      })
      setSel(mi)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view, cursor.m, cursor.y, data.transactions.length])

  const word = typeLabel(view)
  const selBar = bars[sel]
  const selLabel =
    mode === 'months'
      ? `${word} · ${MONTHS[sel] ?? ''} ${cursor.y}`
      : mode === 'days'
        ? `${word} · ${MS[cursor.m]} ${selBar?.label ?? ''}`
        : mode === 'years'
          ? `${word} · ${selBar?.label ?? ''}`
          : `${word} · days ${selBar?.label ?? ''}`

  const catTitle = view === 'Доход' ? 'Income sources' : 'Where money goes'
  const shareWord = view === 'Доход' ? 'income' : 'expenses'

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <Segmented
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: 'Доход' as TxType, label: 'Income' },
            { value: 'Расход' as TxType, label: 'Expense' },
          ]}
          className="mb-3"
        />
        <Segmented
          value={mode}
          onChange={(m) => setMode(m)}
          options={[
            { value: 'days' as Mode, label: 'Days' },
            { value: 'weeks' as Mode, label: 'Weeks' },
            { value: 'months' as Mode, label: 'Months' },
            { value: 'years' as Mode, label: 'Years' },
          ]}
          className="mb-4"
        />
        <div className="text-xs uppercase tracking-wide text-faint">{selLabel}</div>
        <div className="mono mt-1 text-3xl font-bold">{rub(selBar?.value || 0)}</div>

        <div className="mt-3">
          {chartStyle === 'studio' ? (
            <StudioLine data={bars} selected={sel} onSelect={setSel} />
          ) : (
            <BarStat data={bars} selected={sel} onSelect={setSel} />
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-faint">
          <MousePointerClick size={13} /> {chartStyle === 'studio' ? 'tap the chart to pick a period' : 'tap a bar to pick a period'}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Income & expenses by month</div>
          <div className="flex gap-3 text-[11px] text-sub">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-pos" /> income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-neg" /> expense
            </span>
          </div>
        </div>
        <GroupedMonths data={D.monthly} />
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">{catTitle}</div>
        {agg.cats.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">
            {view === 'Доход' ? 'No income this month' : 'No expenses this month'}
          </div>
        ) : (
          <div className="flex flex-col">
            {agg.cats.map((c, i) => {
              const arrowUp = c.delta != null && c.delta > 0
              const good = c.delta != null && (view === 'Доход' ? c.delta > 0 : c.delta < 0)
              const share = agg.total > 0 ? (c.value / agg.total) * 100 : 0
              // У расходной категории с подкатегориями строка кликабельна и
              // открывает детализацию (bottom sheet), а не разворачивает аккордеон.
              const drillable = view === 'Расход' && hasSubCategories(c.name)
              const Wrap = drillable ? 'button' : 'div'
              return (
                <Wrap
                  key={c.name}
                  {...(drillable
                    ? { type: 'button' as const, onClick: () => setDetailCat(c.name), 'aria-label': `${catLabel(c.name)} details` }
                    : {})}
                  className={cn(
                    'flex w-full items-center gap-3 py-2.5 text-left',
                    i && 'border-t border-line/8',
                    drillable && 'transition active:scale-[.99]',
                  )}
                >
                  {view === 'Доход' ? (
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-pos/15 text-pos">
                      <ArrowUpRight size={18} />
                    </span>
                  ) : (
                    <CategoryIcon category={c.name} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate text-sm font-medium">
                      {catLabel(c.name)}
                      {drillable && <ChevronRight size={14} className="flex-none text-faint" />}
                    </div>
                    <div className="text-xs text-faint">
                      {Math.round(share)}% of {shareWord}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm font-semibold">{rub(c.value)}</div>
                    {c.delta != null ? (
                      <div
                        className={cn(
                          'mono flex items-center justify-end gap-0.5 text-xs font-semibold',
                          good ? 'text-pos' : 'text-neg',
                        )}
                      >
                        {arrowUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(Math.round(c.delta))}%
                      </div>
                    ) : (
                      <div className="text-xs text-faint">new</div>
                    )}
                  </div>
                </Wrap>
              )
            })}
          </div>
        )}
      </Card>

      <CategoryDetailSheet categoryId={detailCat} onClose={() => setDetailCat(null)} />
    </div>
  )
}
