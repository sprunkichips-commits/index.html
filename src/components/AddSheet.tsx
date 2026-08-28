import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ArrowLeftRight, Check } from 'lucide-react'
import { AdaptiveDialog } from './ui/adaptive-dialog'
import { Button } from './ui/button'
import { Collapse } from './ui/collapse'
import { Input } from './ui/input'
import { CalendarPanel, CategoryGrid, CategoryTile, DateTile, type EntryPanel } from './EntryTiles'
import { useStore } from '@/store/StoreContext'
import { EXPENSE, INCOME, NOTE_MAX, PAYER_MAX, catLabel, typeLabel, type TxType } from '@/lib/data'
import { subCategoriesOf, subCategoryLabel } from '@/lib/categories'
import { grpAmount, parseAmount, today } from '@/lib/format'
import { tgImpact, tgNotify } from '@/lib/telegram'
import { scrollIntoViewOnFocus } from '@/lib/viewport'
import { cn } from '@/lib/utils'

const FORM_ID = 'add-tx-form'

export function AddSheet({
  open,
  onOpenChange,
  initialType = 'Расход',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialType?: TxType
}) {
  const { addTx, toast, data } = useStore()
  const [type, setType] = useState<TxType>(initialType)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [transit, setTransit] = useState(false)
  const [payer, setPayer] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  // Подсветку включаем только после попытки сохранить — краснеть заранее
  // на форме, которую ещё не заполняли, незачем.
  const [showErrors, setShowErrors] = useState(false)
  // Раскрыта либо категория, либо дата, либо ничего. Одна панель за раз —
  // высота формы остаётся предсказуемой, и вторая не выталкивает первую.
  const [panel, setPanel] = useState<EntryPanel>(null)
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
      setPayer('')
      setDate(today())
      setNote('')
      setShowErrors(false)
      setPanel(null)
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

  const still = useReducedMotion()
  const accent = type === 'Доход' ? 'text-pos' : 'text-neg'
  const list = type === 'Доход' ? INCOME : EXPENSE
  const subs = subCategoriesOf(category)

  const amountValue = parseAmount(amount)
  const amountBad = amountValue <= 0
  const categoryBad = !category

  /**
   * Подтверждение. Вызывается и по кнопке, и по return с клавиатуры (через
   * onSubmit формы — на iOS это единственный надёжный способ поймать return).
   * Пустая сумма или невыбранная категория шторку НЕ закрывают: подсвечиваем
   * то, чего не хватает, и оставляем всё как есть.
   */
  function save(e?: React.FormEvent) {
    e?.preventDefault()
    if (amountBad || categoryBad) {
      setShowErrors(true)
      // Отклик здесь, а не в addTx: до него дело не доходит, а без вибрации
      // отказ на телефоне легко не заметить.
      tgNotify('error')
      // Фокус возвращаем на сумму, только если проблема именно в ней: иначе
      // клавиатура закроется и раскладка поедет ради ничего.
      if (amountBad) amountRef.current?.focus()
      toast(amountBad ? 'Enter an amount' : 'Pick a category')
      return
    }
    const ok = addTx({ type, amount: amountValue, category, subCategory, transit, payer, date, note })
    if (!ok) {
      setShowErrors(true)
      toast('Could not save')
      return
    }
    onOpenChange(false)
  }

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New transaction"
      footer={
        // Запасной путь: когда клавиатура открыта, подтверждают через return, и
        // кнопка только занимала бы место. Класс kb-only-closed прячет её по
        // атрибуту на <html> — без участия React, то есть без перерисовки.
        <div className="kb-only-closed">
          <Button type="submit" form={FORM_ID} variant="accent" className="w-full">
            Save
          </Button>
        </div>
      }
    >
      {/* Форма нужна ради return: на iOS нажатие «done» шлёт submit, и это
          единственный надёжный способ его поймать. id связывает её с кнопкой,
          которая живёт в закреплённой панели снизу, вне самой формы. */}
      <form id={FORM_ID} onSubmit={save}>
      {/* Переключатель типа: подложка не перекрашивается, а переезжает под
          выбранную половину — движение показывает, что это одна вещь в двух
          положениях, а не две отдельные кнопки. layoutId делает это одной
          анимацией, без ручного расчёта смещений. */}
      <div className="relative mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-line/10 bg-line/[0.04] p-1">
        {(['Расход', 'Доход'] as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              if (t !== type) tgImpact('light')
              setType(t)
            }}
            aria-pressed={t === type}
            className="relative h-11 rounded-xl text-sm font-semibold"
          >
            {t === type && (
              <m.span
                layoutId="txTypePill"
                // Без shadow-fab: эта тень окрашена в акцентный лайм и под
                // зелёной половиной выглядела чужим ореолом. Выделения хватает
                // цветом самой подложки.
                className={cn('absolute inset-0 rounded-xl', t === 'Доход' ? 'bg-pos' : 'bg-neg')}
                transition={
                  still ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.6 }
                }
              />
            )}
            <span className={cn('relative transition-colors', t === type ? 'text-white' : 'text-sub')}>
              {typeLabel(t)}
            </span>
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-xs font-medium text-sub">Amount</label>
      <div
        className={cn(
          'mb-3 flex items-center gap-2 rounded-xl border bg-line/[0.04] px-3 transition-colors',
          showErrors && amountBad ? 'border-neg/60 ring-1 ring-neg/40' : 'border-line/12',
        )}
      >
        <input
          ref={amountRef}
          // autoFocus и data-autofocus работают в паре: React ставит фокус при
          // монтировании, а onOpenAutoFocus в AdaptiveDialog отбирает его у
          // кнопки закрытия, которую иначе сфокусировал бы Radix.
          autoFocus
          data-autofocus
          type="text"
          // inputMode НЕ задаём намеренно: с numeric/decimal на iOS исчезает
          // кнопка return, а подтверждение у нас именно на ней. Цифры набираются
          // переключателем «123» обычной клавиатуры.
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="0"
          value={amount}
          onChange={onAmountChange}
          // Клавиатура закрывает нижнюю половину экрана — подводим поле в
          // видимую часть, иначе набирать приходится вслепую.
          onFocus={() => scrollIntoViewOnFocus(amountRef.current)}
          className={cn('mono h-12 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-faint', accent)}
        />
        <span className="text-lg font-semibold text-faint">₽</span>
      </div>

      {/* Категория и дата одной строкой плитками. Панель выбора раскрывается
          под ними и только одна за раз. */}
      <div className="mb-2 flex gap-2">
        <CategoryTile
          value={category}
          type={type}
          open={panel === 'category'}
          invalid={showErrors && categoryBad}
          onToggle={() => setPanel((p) => (p === 'category' ? null : 'category'))}
        />
        <DateTile
          value={date}
          open={panel === 'date'}
          onToggle={() => setPanel((p) => (p === 'date' ? null : 'date'))}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {panel === 'category' && (
          <CategoryGrid
            key="cat"
            value={category}
            onChange={(v) => {
              setCategory(v)
              setPanel(null) // выбрал — панель закрылась, лишнего действия нет
            }}
            options={list}
            type={type}
            transactions={data.transactions}
          />
        )}
        {panel === 'date' && (
          <CalendarPanel
            key="date"
            value={date}
            onChange={(v) => {
              setDate(v)
              setPanel(null)
            }}
            accent={type === 'Доход' ? 'pos' : 'neg'}
          />
        )}
      </AnimatePresence>

      <div className="h-1" />

      {/* Подкатегория — только для категорий с детализацией (напр. Groceries).
          Тоже кнопками, а не списком: выпадашка так же уводила фокус. */}
      <Collapse show={subs.length > 0}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {subs.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSubCategory(subCategory === sub.id ? '' : sub.id)
                amountRef.current?.focus({ preventScroll: true })
              }}
              aria-pressed={subCategory === sub.id}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                subCategory === sub.id
                  ? 'bg-accent/15 text-ink ring-1 ring-accent/60'
                  : 'bg-line/[0.06] text-sub hover:text-ink',
              )}
            >
              {subCategoryLabel(sub.id)}
            </button>
          ))}
        </div>
      </Collapse>

      {/* «От кого» — свободный текст, только для дохода. Виден в детализации источника. */}
      <Collapse show={type === 'Доход'}>
        <label className="mb-1.5 block text-xs font-medium text-sub">
          From whom <span className="text-faint">(optional)</span>
        </label>
        <Input
          type="text"
          enterKeyHint="done"
          maxLength={PAYER_MAX}
          placeholder="e.g. Mom, employer, client"
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
          className="mb-3"
        />
      </Collapse>

      <label className="mb-1.5 block text-xs font-medium text-sub">
        Note <span className="text-faint">(optional)</span>
      </label>
      <Input
        type="text"
        enterKeyHint="done"
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

      </form>
    </AdaptiveDialog>
  )
}
