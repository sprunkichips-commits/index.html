import { Trash2 } from 'lucide-react'
import { type Tx } from '@/lib/data'
import { rub } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CategoryIcon } from './CategoryIcon'

export function TxRow({ tx, onDelete }: { tx: Tx; onDelete: (id: string) => void }) {
  const inc = tx.type === 'Доход'
  const d = new Date(tx.date + 'T00:00:00')
  const dl = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return (
    <div className="group flex items-center gap-3 py-2.5">
      <CategoryIcon category={tx.category} income={inc} />
      <div className="min-w-0 flex-1">
        {/* React экранирует пользовательский текст автоматически */}
        <div className="truncate text-sm font-medium text-ink">{tx.category}</div>
        <div className="truncate text-xs text-faint">
          {dl}
          {tx.note ? ' · ' + tx.note : ''}
        </div>
      </div>
      <div className={cn('mono whitespace-nowrap text-sm font-semibold', inc ? 'text-pos' : 'text-ink')}>
        {inc ? '+' : '−'}
        {rub(tx.amount)}
      </div>
      <button
        onClick={() => onDelete(tx.id)}
        aria-label="Удалить"
        className="grid h-11 w-11 flex-none place-items-center rounded-xl text-faint transition hover:bg-neg/15 hover:text-neg active:scale-95"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
