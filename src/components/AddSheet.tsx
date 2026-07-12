import { useEffect, useState } from 'react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { useStore } from '@/store/StoreContext'
import { EXPENSE, INCOME, NOTE_MAX, catLabel, typeLabel, type TxType } from '@/lib/data'
import { grpAmount, parseAmount, today } from '@/lib/format'
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
    const ok = addTx({ type, amount: parseAmount(amount), category, date, note })
    if (!ok) {
      toast('Enter an amount and a category')
      return
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New transaction">
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
            {typeLabel(t)}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Amount</label>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-line/12 bg-line/[0.04] px-3">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(grpAmount(e.target.value))}
          className={cn('mono h-12 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-faint', accent)}
        />
        <span className="text-lg font-semibold text-faint">₽</span>
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Category</label>
      <div className="mb-3">
        <Select
          value={category}
          onValueChange={setCategory}
          placeholder="Pick a category…"
          options={list}
          labelFor={catLabel}
          ariaLabel="Category"
        />
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Date</label>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3" />

      <label className="mb-1.5 block text-xs font-medium text-sub">
        Note <span className="text-faint">(optional)</span>
      </label>
      <Input
        type="text"
        maxLength={NOTE_MAX}
        placeholder="e.g. corner store"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="accent" onClick={save}>
          Add
        </Button>
      </div>
    </Sheet>
  )
}
