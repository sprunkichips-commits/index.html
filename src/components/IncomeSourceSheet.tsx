import { ArrowLeftRight, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './ui/sheet'
import { useStore } from '@/store/StoreContext'
import { getIncomeSources } from '@/lib/breakdown'
import { catLabel, type Tx } from '@/lib/data'
import { fmtDateLong, rub } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Детализация источника дохода за выбранный месяц: из каких операций он сложился,
 * с указанием «от кого» (payer). Данные берёт из стора (без prop-drilling).
 * Итог сверху — чистый вклад категории (с зачётом транзита), как в «Income sources».
 */
export function IncomeSourceSheet({ categoryId, onClose }: { categoryId: string | null; onClose: () => void }) {
  const { data, cursor } = useStore()
  const [shown, setShown] = useState<string | null>(categoryId)
  useEffect(() => {
    if (categoryId) setShown(categoryId)
  }, [categoryId])
  const id = categoryId ?? shown

  const { items, total } = useMemo(() => {
    if (!id) return { items: [] as Tx[], total: 0 }
    const monthTx = data.transactions.filter((t) => {
      const d = new Date(t.date + 'T00:00:00')
      return d.getFullYear() === cursor.y && d.getMonth() === cursor.m
    })
    const list = monthTx
      .filter((t) => t.type === 'Доход' && t.category === id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount))
    // Чистый вклад категории (транзит зачтён) — совпадает с суммой в «Income sources».
    const net = getIncomeSources(monthTx)[id] || 0
    return { items: list, total: net }
  }, [id, data.transactions, cursor.y, cursor.m])

  return (
    <Sheet open={!!categoryId} onOpenChange={(v) => !v && onClose()} title={id ? catLabel(id) : 'Income source'}>
      {id && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-pos/15 text-pos">
              <TrendingUp size={22} />
            </span>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-faint">Received this month</div>
              <div className="mono text-2xl font-bold leading-tight text-pos">{rub(total)}</div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-faint">No income here this month.</div>
          ) : (
            <div className="flex flex-col">
              {items.map((t, i) => (
                <div key={t.id} className={cn('flex items-center gap-3 py-2.5', i && 'border-t border-line/8')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {t.payer || <span className="text-faint">Not specified</span>}
                      {t.transit && <ArrowLeftRight size={12} className="flex-none text-faint" aria-label="Transit" />}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {fmtDateLong(t.date)}
                      {t.note ? ' · ' + t.note : ''}
                      {t.transit ? ' · transit (net counted)' : ''}
                    </div>
                  </div>
                  <div className="mono flex-none text-sm font-semibold text-pos">+{rub(t.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
