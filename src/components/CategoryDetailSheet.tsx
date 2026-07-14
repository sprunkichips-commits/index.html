import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './ui/sheet'
import { CategoryIcon } from './CategoryIcon'
import { useStore } from '@/store/StoreContext'
import { getCategory, getSubCategoryStats } from '@/lib/categories'
import { catLabel } from '@/lib/data'
import { rub } from '@/lib/format'

/**
 * Детализация одной категории расходов по подкатегориям за выбранный месяц.
 * Данные берёт из стора (без prop-drilling) — снаружи нужен только id категории.
 * Открытие/закрытие — через общий Sheet (нативная iOS/Telegram-анимация снизу).
 */
export function CategoryDetailSheet({ categoryId, onClose }: { categoryId: string | null; onClose: () => void }) {
  const { data, cursor } = useStore()
  // Держим последний id, чтобы контент не мигал во время анимации закрытия.
  const [shown, setShown] = useState<string | null>(categoryId)
  useEffect(() => {
    if (categoryId) setShown(categoryId)
  }, [categoryId])

  const id = categoryId ?? shown

  // Операции выбранного месяца — та же выборка, что в «Where money goes».
  const breakdown = useMemo(() => {
    if (!id) return null
    const monthTx = data.transactions.filter((t) => {
      if (t.type !== 'Расход') return false
      const d = new Date(t.date + 'T00:00:00')
      return d.getFullYear() === cursor.y && d.getMonth() === cursor.m
    })
    return getSubCategoryStats(monthTx, id)
  }, [id, data.transactions, cursor.y, cursor.m])

  const cat = id ? getCategory(id) : null

  return (
    <Sheet open={!!categoryId} onOpenChange={(v) => !v && onClose()} title={cat ? catLabel(cat.id) : 'Category'}>
      {cat && breakdown && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <CategoryIcon category={cat.id} size={22} box="h-12 w-12" />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-faint">Total this month</div>
              <div className="mono text-2xl font-bold leading-tight">{rub(breakdown.total)}</div>
            </div>
          </div>

          {breakdown.items.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-faint">No spending in this category yet.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {breakdown.items.map((s) => (
                <div key={s.id || 'none'}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{s.name}</span>
                    <span className="flex flex-none items-baseline gap-2">
                      <span className="mono text-sm font-semibold">{rub(s.total)}</span>
                      <span className="mono w-9 text-right text-xs text-faint">{s.percent}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${s.percent}%`, background: cat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
