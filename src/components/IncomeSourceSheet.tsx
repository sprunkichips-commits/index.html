import { ArrowLeftRight, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './ui/sheet'
import { useStore } from '@/store/StoreContext'
import { getIncomeSources } from '@/lib/breakdown'
import { catLabel, type Tx } from '@/lib/data'
import { fmtDateLong, rub, toCents } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Row {
  tx: Tx
  effective: number // фактический вклад в итог (для транзита — чистый остаток)
  passedOn: number // сколько из транзита ушло дальше (0 для обычных)
}

/**
 * Детализация источника дохода за выбранный месяц: из каких операций он сложился,
 * с указанием «от кого» (payer). Данные берёт из стора (без prop-drilling).
 * Транзит показываем ЧИСТЫМ остатком (получено − передано), чтобы сумма строк
 * совпадала с итогом сверху и с виджетом «Income sources».
 */
export function IncomeSourceSheet({ categoryId, onClose }: { categoryId: string | null; onClose: () => void }) {
  const { data, cursor } = useStore()
  const [shown, setShown] = useState<string | null>(categoryId)
  useEffect(() => {
    if (categoryId) setShown(categoryId)
  }, [categoryId])
  const id = categoryId ?? shown

  const { rows, total } = useMemo(() => {
    if (!id) return { rows: [] as Row[], total: 0 }
    const monthTx = data.transactions.filter((t) => {
      const d = new Date(t.date + 'T00:00:00')
      return d.getFullYear() === cursor.y && d.getMonth() === cursor.m
    })
    // Пул транзита за месяц: сколько всего пришло транзитом и сколько ушло дальше.
    let transitIn = 0
    let transitOut = 0
    for (const t of monthTx) {
      if (!t.transit) continue
      if (t.type === 'Доход') transitIn += t.amount
      else transitOut += t.amount
    }
    // Чистый остаток и переданное разносим по транзитным приходам пропорционально.
    const netFactor = transitIn > 0 ? Math.max(0, transitIn - transitOut) / transitIn : 0
    const outFactor = transitIn > 0 ? Math.min(transitOut, transitIn) / transitIn : 0

    const rows: Row[] = monthTx
      .filter((t) => t.type === 'Доход' && t.category === id)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount))
      .map((tx) => ({
        tx,
        effective: tx.transit ? toCents(tx.amount * netFactor) : tx.amount,
        passedOn: tx.transit ? toCents(tx.amount * outFactor) : 0,
      }))

    const net = getIncomeSources(monthTx)[id] || 0
    return { rows, total: net }
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

          {rows.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-faint">No income here this month.</div>
          ) : (
            <div className="flex flex-col">
              {rows.map(({ tx, effective, passedOn }, i) => (
                <div key={tx.id} className={cn('flex items-center gap-3 py-2.5', i && 'border-t border-line/8')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {tx.payer || <span className="text-faint">Not specified</span>}
                      {tx.transit && <ArrowLeftRight size={12} className="flex-none text-faint" aria-label="Transit" />}
                    </div>
                    <div className={cn('text-xs text-faint', !tx.transit && 'truncate')}>
                      {fmtDateLong(tx.date)}
                      {tx.transit
                        ? ` · ${rub(tx.amount)} received − ${rub(passedOn)} passed on`
                        : tx.note
                          ? ' · ' + tx.note
                          : ''}
                    </div>
                  </div>
                  <div className="mono flex-none text-sm font-semibold text-pos">+{rub(effective)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
