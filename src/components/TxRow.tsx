import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { type Tx, catLabel, typeLabel } from '@/lib/data'
import { rub } from '@/lib/format'
import { tgConfirm } from '@/lib/telegram'
import { cn } from '@/lib/utils'
import { CategoryIcon } from './CategoryIcon'

export function TxRow({
  tx,
  onDelete,
  onOpen,
}: {
  tx: Tx
  onDelete: (id: string) => void
  onOpen?: (tx: Tx) => void
}) {
  const inc = tx.type === 'Доход'
  const d = new Date(tx.date + 'T00:00:00')
  const dl = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })

  async function confirmDelete() {
    const ok = await tgConfirm(
      `Delete this ${typeLabel(tx.type).toLowerCase()}?\n${catLabel(tx.category)} · ${inc ? '+' : '−'}${rub(tx.amount)}`,
    )
    if (ok) onDelete(tx.id)
  }
  return (
    <div className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => onOpen?.(tx)}
        className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2.5 text-left transition active:scale-[.99] [@media(hover:hover)]:hover:bg-line/[0.04]"
      >
        <CategoryIcon category={tx.category} income={inc} />
        <div className="min-w-0 flex-1">
          {/* React экранирует пользовательский текст автоматически */}
          <div className="flex items-center gap-1 truncate text-sm font-medium text-ink">
            {catLabel(tx.category)}
            {tx.transit && <ArrowLeftRight size={12} className="flex-none text-faint" aria-label="Transit" />}
          </div>
          <div className="truncate text-xs text-faint">
            {dl}
            {tx.note ? ' · ' + tx.note : ''}
          </div>
        </div>
        <div className={cn('mono whitespace-nowrap text-sm font-semibold', inc ? 'text-pos' : 'text-ink')}>
          {inc ? '+' : '−'}
          {rub(tx.amount)}
        </div>
      </button>
      <button
        onClick={confirmDelete}
        aria-label="Delete"
        className="grid h-11 w-11 flex-none place-items-center rounded-xl text-faint transition hover:bg-neg/15 hover:text-neg active:scale-95"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
