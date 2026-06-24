import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useStore, type Filter } from '@/store/StoreContext'
import { rubS } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { TxRow } from '@/components/TxRow'
import { cn } from '@/lib/utils'
import type { Tx, TxType } from '@/lib/data'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'Все', label: 'Все' },
  { value: 'Доход', label: 'Доходы' },
  { value: 'Расход', label: 'Расходы' },
]

export function Transactions({ openAdd }: { openAdd: (type: TxType) => void }) {
  const { data, filter, setFilter, delTx } = useStore()

  const groups = useMemo(() => {
    let list = data.transactions.slice()
    if (filter !== 'Все') list = list.filter((t) => t.type === filter)
    list.sort((a, b) => (a.date < b.date ? 1 : -1))
    const map: Record<string, Tx[]> = {}
    const order: string[] = []
    list.forEach((t) => {
      if (!map[t.date]) {
        map[t.date] = []
        order.push(t.date)
      }
      map[t.date].push(t)
    })
    return order.map((date) => {
      const items = map[date]
      const sum = items.reduce((s, t) => s + (t.type === 'Доход' ? t.amount : -t.amount), 0)
      return { date, items, sum }
    })
  }, [data.transactions, filter])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.value
          const tone = f.value === 'Доход' ? 'bg-pos' : f.value === 'Расход' ? 'bg-neg' : 'bg-accent'
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'h-11 rounded-full text-[13px] font-semibold transition active:scale-[.97]',
                active
                  ? cn(tone, 'text-white shadow-fab')
                  : 'glass border-line/10 text-sub [@media(hover:hover)]:hover:text-ink',
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <Card className="p-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <p className="text-[13px] text-faint">Здесь появятся твои операции</p>
            <button
              onClick={() => openAdd('Расход')}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-ink shadow-fab transition active:scale-95"
            >
              <Plus size={16} /> Добавить
            </button>
          </div>
        ) : (
          groups.map((g) => {
            const dt = new Date(g.date + 'T00:00:00')
            return (
              <div key={g.date} className="mb-1">
                <div className="flex items-center justify-between border-b border-line/10 py-1.5">
                  <span className="text-xs font-semibold capitalize text-sub">
                    {dt.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </span>
                  <span className={cn('mono text-xs font-semibold', g.sum >= 0 ? 'text-pos' : 'text-ink')}>
                    {rubS(g.sum)}
                  </span>
                </div>
                {g.items.map((t, i) => (
                  <div key={t.id} className={i ? 'border-t border-line/8' : ''}>
                    <TxRow tx={t} onDelete={delTx} />
                  </div>
                ))}
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
