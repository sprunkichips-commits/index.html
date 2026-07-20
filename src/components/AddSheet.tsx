import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { useStore } from '@/store/StoreContext'
import { EXPENSE, INCOME, NOTE_MAX, catLabel, typeLabel, type TxType } from '@/lib/data'
import { subCategoriesOf, subCategoryLabel } from '@/lib/categories'
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
  const [subCategory, setSubCategory] = useState('')
  const [transit, setTransit] = useState(false)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
  const caretSig = useRef<number | null>(null) // позиция курсора в «значащих» символах

  // Плавный ввод суммы: переформатирование (пробелы разрядов, нормализация
  // запятой/точки) меняет строку — React сбросил бы курсор в конец. Запоминаем,
  // сколько ЗНАЧАЩИХ символов (цифр и разделителей) было слева от курсора, и
  // после ре-рендера ставим курсор за тем же количеством значащих символов.
  function onAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target
    const caret = el.selectionStart ?? el.value.length
    caretSig.current = (el.value.slice(0, caret).match(/[\d.,]/g) || []).length
    setAmount(grpAmount(el.value))
  }

  useLayoutEffect(() => {
    const el = amountRef.current
    const sig = caretSig.current
    if (!el || sig == null) return
    caretSig.current = null
    let pos = 0
    let seen = 0
    while (pos < el.value.length && seen < sig) {
      if (/[\d.,]/.test(el.value[pos])) seen++
      pos++
    }
    el.setSelectionRange(pos, pos)
  }, [amount])

  // сброс при каждом открытии + установка типа
  useEffect(() => {
    if (open) {
      setType(initialType)
      setAmount('')
      setCategory('')
      setSubCategory('')
      setTransit(false)
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

  // подкатегория действительна только внутри своей категории — сбрасываем при смене
  useEffect(() => {
    setSubCategory('')
  }, [category])

  const accent = type === 'Доход' ? 'text-pos' : 'text-neg'
  const list = type === 'Доход' ? INCOME : EXPENSE
  const subs = subCategoriesOf(category)

  function save() {
    const ok = addTx({ type, amount: parseAmount(amount), category, subCategory, transit, date, note })
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
          ref={amountRef}
          autoFocus
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={onAmountChange}
          className={cn('mono h-12 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-faint', accent)}
        />
        <span className="text-lg font-semibold text-faint">₽</span>
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Category</label>
      <div className={cn(subs.length ? 'mb-2' : 'mb-3')}>
        <Select
          value={category}
          onValueChange={setCategory}
          placeholder="Pick a category…"
          options={list}
          labelFor={catLabel}
          ariaLabel="Category"
        />
      </div>

      {/* Подкатегория — только для категорий с детализацией (напр. Groceries) */}
      {subs.length > 0 && (
        <div className="mb-3">
          <Select
            value={subCategory}
            onValueChange={setSubCategory}
            placeholder="Subcategory (optional)…"
            options={subs.map((s) => s.id)}
            labelFor={subCategoryLabel}
            ariaLabel="Subcategory"
          />
        </div>
      )}

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
        className="mb-3"
      />

      {/* Транзит: деньги проходят насквозь. Пометь и приход, и передачу дальше —
          в статистике учтётся только остаток, а не вся сумма. */}
      <button
        type="button"
        onClick={() => setTransit((v) => !v)}
        aria-pressed={transit}
        className="mb-4 flex w-full items-center gap-3 rounded-xl border border-line/12 bg-line/[0.04] px-3 py-2.5 text-left transition active:scale-[.99]"
      >
        <span
          className={cn(
            'grid h-6 w-6 flex-none place-items-center rounded-md border transition',
            transit ? 'border-accent bg-accent text-accent-ink' : 'border-line/25 text-transparent',
          )}
        >
          <Check size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <ArrowLeftRight size={14} className="text-faint" /> Transit / pass-through
          </span>
          <span className="mt-0.5 block text-xs text-faint">Only the net remainder counts in stats, not the full amount</span>
        </span>
      </button>

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
