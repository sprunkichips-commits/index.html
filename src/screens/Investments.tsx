import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Briefcase, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { computeStats, NAME_MAX, TYPES } from '@/lib/data'
import { rub, rubS, grp } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function Investments() {
  const { data, cursor, addInv, delInv, toast } = useStore()
  const D = useMemo(() => computeStats(data, cursor), [data, cursor])
  const [form, setForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('ETF')
  const [amt, setAmt] = useState('')
  const [cur, setCur] = useState('')

  function save() {
    const invested = parseInt(amt.replace(/\D/g, '').slice(0, 13)) || 0
    const current = parseInt(cur.replace(/\D/g, '').slice(0, 13)) || 0
    const ok = addInv({ name, type, invested, current })
    if (!ok) {
      toast('Впиши название и сумму')
      return
    }
    setName('')
    setAmt('')
    setCur('')
    setForm(false)
  }

  const stats = [
    { label: 'Вложено', value: rub(D.invested), icon: PiggyBank, cls: 'bg-accent/15 text-accent' },
    {
      label: 'Прибыль',
      value: rubS(D.invPL),
      icon: D.invPL >= 0 ? ArrowUpRight : ArrowDownRight,
      cls: D.invPL >= 0 ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg',
    },
    {
      label: 'Доходность',
      value: (D.invRet >= 0 ? '+' : '') + D.invRet.toFixed(1) + '%',
      icon: Briefcase,
      cls: D.invRet >= 0 ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg',
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Card hover className="p-5">
        <div className="text-xs uppercase tracking-wide text-faint">Стоимость портфеля</div>
        <div className="mono mt-1 text-[30px] font-bold leading-none">{rub(D.current)}</div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className={cn('grid h-9 w-9 place-items-center rounded-xl', s.cls)}>
                  <Icon size={16} />
                </span>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-faint">{s.label}</div>
                  <div className="mono text-sm font-semibold">{s.value}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Активы</div>
          <button
            onClick={() => setForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:opacity-80"
          >
            <Plus size={14} /> Добавить
          </button>
        </div>

        {form && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-line/10 bg-line/[0.04] p-3">
            <Input
              className="col-span-2"
              maxLength={NAME_MAX}
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="col-span-2">
              <Select value={type} onValueChange={setType} options={TYPES} ariaLabel="Тип актива" />
            </div>
            <Input
              inputMode="numeric"
              placeholder="Вложено, ₽"
              value={amt}
              onChange={(e) => setAmt(grp(e.target.value.slice(0, 17)))}
            />
            <Input
              inputMode="numeric"
              placeholder="Сейчас, ₽"
              value={cur}
              onChange={(e) => setCur(grp(e.target.value.slice(0, 17)))}
            />
            <Button variant="accent" className="col-span-2" onClick={save}>
              Сохранить актив
            </Button>
          </div>
        )}

        {data.investments.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">Активов пока нет</div>
        ) : (
          data.investments.map((iv, idx) => {
            const pl = (iv.current || 0) - (iv.invested || 0)
            const ret = iv.invested ? (pl / iv.invested) * 100 : 0
            const up = pl >= 0
            return (
              <div key={iv.id} className={cn('flex items-center gap-3 py-3', idx && 'border-t border-line/8')}>
                <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-accent/15 text-xs font-bold text-accent">
                  {iv.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{iv.name}</div>
                  <div className="truncate text-xs text-faint">
                    {iv.type} · вложено {rub(iv.invested)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono text-sm font-semibold">{rub(iv.current)}</div>
                  <div className={cn('mono text-xs font-semibold', up ? 'text-pos' : 'text-neg')}>
                    {up ? '+' : ''}
                    {ret.toFixed(1)}%
                  </div>
                </div>
                <button
                  onClick={() => delInv(iv.id)}
                  aria-label="Удалить актив"
                  className="grid h-11 w-11 flex-none place-items-center rounded-xl text-faint transition hover:bg-neg/15 hover:text-neg active:scale-95"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
