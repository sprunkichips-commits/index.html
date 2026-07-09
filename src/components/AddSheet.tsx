import { useEffect, useState } from 'react'
import { Delete } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { useStore } from '@/store/StoreContext'
import { tgHaptic } from '@/lib/telegram'
import { EXPENSE, INCOME, NOTE_MAX, catLabel, typeLabel, type TxType } from '@/lib/data'
import { grp, today } from '@/lib/format'
import { cn } from '@/lib/utils'

const AMOUNT_MAX_DIGITS = 13

// Встроенная цифровая панель вместо системной клавиатуры: в Telegram WebView
// экранная клавиатура сжимала лист и «съедала» первый тап по другим полям
// (категория открывалась со второго раза). Свой numpad ничего не сдвигает —
// категория, дата и кнопки всегда доступны с первого касания.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const

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
  const [digits, setDigits] = useState('') // сумма — только цифры, без форматирования
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')

  // сброс при каждом открытии + установка типа
  useEffect(() => {
    if (open) {
      setType(initialType)
      setDigits('')
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

  function press(k: (typeof KEYS)[number]) {
    tgHaptic()
    setDigits((d) => {
      if (k === 'del') return d.slice(0, -1)
      return (d + k).replace(/^0+(?=\d)/, '').slice(0, AMOUNT_MAX_DIGITS)
    })
  }

  function save() {
    const ok = addTx({ type, amount: parseInt(digits) || 0, category, date, note })
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

      {/* Сумма: дисплей без <input> — системная клавиатура не открывается вовсе */}
      <div
        role="status"
        aria-label="Amount"
        className="mb-2 flex h-14 items-baseline justify-center gap-1.5 rounded-xl border border-line/12 bg-line/[0.04] px-3"
      >
        <span className={cn('mono self-center text-3xl font-bold leading-none', digits ? accent : 'text-faint')}>
          {digits ? grp(digits) : '0'}
        </span>
        <span className="self-center text-xl font-semibold text-faint">₽</span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Backspace' : k}
            className={cn(
              'mono grid h-12 place-items-center rounded-xl text-lg font-semibold transition active:scale-95 active:bg-line/[0.12]',
              k === 'del' ? 'text-sub' : 'bg-line/[0.05] text-ink',
            )}
          >
            {k === 'del' ? <Delete size={20} /> : k}
          </button>
        ))}
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
