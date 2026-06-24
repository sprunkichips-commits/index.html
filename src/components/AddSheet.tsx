import { useEffect, useState } from 'react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { useStore } from '@/store/StoreContext'
import { EXPENSE, INCOME, NOTE_MAX, type TxType } from '@/lib/data'
import { grp, today } from '@/lib/format'
import { cn } from '@/lib/utils'

export function AddSheet({
  open,
  onOpenChange,
  initialType = 'Расход',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialType?: TxType
}) {
  const { addTx, toast } = useStore()
  const [type, setType] = useState<TxType>(initialType)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')

  // сброс при каждом открытии + установка типа
  useEffect(() => {
    if (open) {
      setType(initialType)
      setAmount('')
      setCategory('')
      setDate(today())
      setNote('')
    }
  }, [open, initialType])

  // при смене типа сбросить категорию, если её нет в новом списке
  useEffect(() => {
    setCategory((c) => {
      const list = type === 'Доход' ? INCOME : EXPENSE
      return list.includes(c) ? c : ''
    })
  }, [type])

  const accent = type === 'Доход' ? 'text-pos' : 'text-neg'
  const list = type === 'Доход' ? INCOME : EXPENSE

  function save() {
    const num = parseInt(amount.replace(/\D/g, '').slice(0, 13)) || 0
    const ok = addTx({ type, amount: num, category, date, note })
    if (!ok) {
      toast('Заполни сумму и категорию')
      return
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Новая операция">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-line/10 bg-line/[0.04] p-1">
        {(['Расход', 'Доход'] as TxType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              'h-11 rounded-xl text-sm font-semibold transition active:scale-[.97]',
              t === type
                ? t === 'Доход'
                  ? 'bg-pos text-white shadow-fab'
                  : 'bg-neg text-white'
                : 'text-sub hover:text-ink',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Сумма</label>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-line/12 bg-line/[0.04] px-3">
        <input
          autoFocus
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(grp(e.target.value.slice(0, 17)))}
          className={cn('mono h-12 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-faint', accent)}
        />
        <span className="text-lg font-semibold text-faint">₽</span>
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Категория</label>
      <div className="mb-3">
        <Select
          value={category}
          onValueChange={setCategory}
          placeholder="Выбери категорию…"
          options={list}
          ariaLabel="Категория"
        />
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Дата</label>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3" />

      <label className="mb-1.5 block text-xs font-medium text-sub">
        Заметка <span className="text-faint">(необязательно)</span>
      </label>
      <Input
        type="text"
        maxLength={NOTE_MAX}
        placeholder="Например: магазин у дома"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button variant="accent" onClick={save}>
          Добавить
        </Button>
      </div>
    </Sheet>
  )
}
