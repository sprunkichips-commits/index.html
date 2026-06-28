import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, Bell, Search, Wallet } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { computeStats } from '@/lib/data'
import { rub, rubS } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { TxRow } from '@/components/TxRow'
import { cn } from '@/lib/utils'
import type { TxType } from '@/lib/data'

export function Dashboard({ openAdd }: { openAdd: (type: TxType) => void }) {
  const { data, cursor, firstName, setTab, delTx } = useStore()
  const D = useMemo(() => computeStats(data, cursor), [data, cursor])
  const recent = useMemo(
    () =>
      data.transactions
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8),
    [data.transactions],
  )
  const ioT = D.income + D.expense || 1
  const initial = (firstName || 'Я').slice(0, 1).toUpperCase()

  const actions = [
    { label: 'Расход', icon: ArrowDownRight, cls: 'text-neg', onClick: () => openAdd('Расход') },
    { label: 'Доход', icon: ArrowUpRight, cls: 'text-pos', onClick: () => openAdd('Доход') },
    { label: 'Статистика', icon: BarChart3, cls: 'text-accent', onClick: () => setTab('stats') },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Приветствие */}
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-full bg-accent/20 text-base font-bold text-accent">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-faint">Привет,</div>
          <div className="truncate text-base font-bold">{firstName || 'друг'} 👋</div>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full text-sub transition hover:bg-line/[0.07] hover:text-ink" aria-label="Поиск">
          <Search size={18} />
        </button>
        <button className="grid h-10 w-10 place-items-center rounded-full text-sub transition hover:bg-line/[0.07] hover:text-ink" aria-label="Уведомления">
          <Bell size={18} />
        </button>
      </div>

      {/* Баланс за месяц */}
      <Card hover className="overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-faint">Остаток за месяц</div>
            <div className={cn('mono mt-1 text-[34px] font-bold leading-none', D.net >= 0 ? 'text-pos' : 'text-neg')}>
              {rubS(D.net)}
            </div>
          </div>
          <span
            className={cn(
              'mono rounded-full px-2.5 py-1 text-xs font-semibold',
              D.net >= 0 ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg',
            )}
          >
            {D.rate >= 0 ? '+' : ''}
            {Math.round(D.rate)}%
          </span>
        </div>

        <div className="mt-5 flex gap-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-pos/15 text-pos">
              <ArrowUpRight size={16} />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-faint">Доход</div>
              <div className="mono text-sm font-semibold">{rub(D.income)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-neg/15 text-neg">
              <ArrowDownRight size={16} />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-faint">Расход</div>
              <div className="mono text-sm font-semibold">{rub(D.expense)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-line/10">
          <div className="bg-pos" style={{ width: (D.income / ioT) * 100 + '%' }} />
          <div className="bg-neg" style={{ width: (D.expense / ioT) * 100 + '%' }} />
        </div>
      </Card>

      {/* Быстрые действия */}
      <div className="grid grid-cols-3 gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.label}
              onClick={a.onClick}
              className="glass flex flex-col items-center gap-2 rounded-2xl border-line/10 py-3.5 transition active:scale-95 [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              <Icon size={20} className={a.cls} />
              <span className="text-[11px] font-medium text-sub">{a.label}</span>
            </button>
          )
        })}
      </div>

      {/* Последние операции */}
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">Последние операции</div>
          <button onClick={() => setTab('tx')} className="text-xs font-medium text-accent transition hover:opacity-80">
            Все →
          </button>
        </div>
        {recent.length === 0 ? (
          <Empty onAdd={() => openAdd('Расход')} />
        ) : (
          recent.map((t, i) => (
            <div key={t.id} className={i ? 'border-t border-line/8' : ''}>
              <TxRow tx={t} onDelete={delTx} />
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-line/[0.06] text-faint">
        <Wallet size={26} />
      </div>
      <div className="mt-3 text-base font-semibold">Пока пусто</div>
      <p className="mt-1 max-w-[260px] text-[13px] text-sub">
        Запиши первый доход или расход — всё посчитается и сохранится автоматически.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-ink shadow-fab transition active:scale-95"
      >
        Добавить операцию
      </button>
    </div>
  )
}
