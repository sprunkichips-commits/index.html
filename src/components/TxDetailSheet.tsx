import { useEffect, useState } from 'react'
import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { CategoryIcon } from './CategoryIcon'
import { useStore } from '@/store/StoreContext'
import { addedAt, catLabel, typeLabel, type Tx } from '@/lib/data'
import { subCategoryLabel } from '@/lib/categories'
import { fmtDateLong, fmtDateTime, rub } from '@/lib/format'
import { cn } from '@/lib/utils'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="flex-none text-[13px] text-faint">{label}</span>
      <span className="text-right text-[13px] font-medium text-ink">{value}</span>
    </div>
  )
}

/** Подробности операции: сумма, категория, дата операции и когда её добавили. */
export function TxDetailSheet({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const { delTx } = useStore()
  // Сохраняем последний tx, чтобы контент не пропадал во время анимации закрытия.
  const [shown, setShown] = useState<Tx | null>(tx)
  useEffect(() => {
    if (tx) setShown(tx)
  }, [tx])

  const t = tx ?? shown
  const inc = t?.type === 'Доход'
  const ms = t ? addedAt(t) : null

  return (
    <Sheet
      open={!!tx}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Transaction"
    >
      {t && (
        <>
          <div className="mb-5 flex flex-col items-center text-center">
            <CategoryIcon category={t.category} income={inc} size={26} box="h-16 w-16" />
            <div className="mt-3 text-base font-semibold">{catLabel(t.category)}</div>
            {t.subCategory ? (
              <div className="mt-0.5 text-[13px] text-sub">{subCategoryLabel(t.subCategory)}</div>
            ) : null}
            <span
              className={cn(
                'mt-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                inc ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg',
              )}
            >
              {typeLabel(t.type)}
            </span>
            {t.transit ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-line/[0.08] px-2.5 py-0.5 text-xs font-semibold text-sub">
                <ArrowLeftRight size={12} /> Transit — net only in stats
              </span>
            ) : null}
            <div className={cn('mono mt-3 text-3xl font-bold', inc ? 'text-pos' : 'text-ink')}>
              {inc ? '+' : '−'}
              {rub(t.amount)}
            </div>
          </div>

          <div className="divide-y divide-line/8 rounded-2xl border border-line/10 bg-line/[0.03] px-4">
            <Row label="Transaction date" value={fmtDateLong(t.date)} />
            {ms != null && <Row label="Added" value={fmtDateTime(ms)} />}
            {t.note ? (
              <div className="flex flex-col gap-1 py-2.5">
                <span className="text-[13px] text-faint">Note</span>
                {/* React экранирует пользовательский текст автоматически */}
                <span className="whitespace-pre-wrap break-words text-[13px] text-ink">{t.note}</span>
              </div>
            ) : null}
          </div>

          <Button
            variant="danger"
            className="mt-4 w-full"
            onClick={() => {
              delTx(t.id)
              onClose()
            }}
          >
            <Trash2 size={15} /> Delete transaction
          </Button>
        </>
      )}
    </Sheet>
  )
}
