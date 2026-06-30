import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, Check, Flame, KeyRound, Lock, Pencil, Plus, ShieldCheck, Target, Trash2, Unlock,
} from 'lucide-react'
import { useGoals } from '@/store/GoalsContext'
import {
  type DailyTask, type Goal,
  daysLeft, localDateStr, percentForDay, PIN_MIN, trendSeries, validPin,
} from '@/lib/goals'
import { fmtDateLong } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { TrendLine } from '@/components/charts/TrendLine'
import { cn } from '@/lib/utils'

function plDays(n: number): string {
  const a = Math.abs(n)
  const d10 = a % 10
  const d100 = a % 100
  if (d10 === 1 && d100 !== 11) return 'день'
  if (d10 >= 2 && d10 <= 4 && (d100 < 10 || d100 >= 20)) return 'дня'
  return 'дней'
}

function countdownLabel(target: string): { text: string; sub: string } {
  const dl = daysLeft(target)
  if (dl > 0) return { text: `${dl}`, sub: plDays(dl) }
  if (dl === 0) return { text: 'Сегодня', sub: 'день настал' }
  return { text: 'Просрочено', sub: `${Math.abs(dl)} ${plDays(dl)} назад` }
}

function defaultTarget(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return localDateStr(d)
}

export function Goals() {
  const g = useGoals()
  if (g.status === 'locked') return <UnlockScreen />
  return <GoalsContent />
}

// ---------- Экран разблокировки ----------
function UnlockScreen() {
  const { unlock, unlockError } = useGoals()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    if (!pin || busy) return
    setBusy(true)
    await unlock(pin)
    setBusy(false)
    setPin('')
  }

  return (
    <div className="flex flex-col items-center pt-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-accent/15 text-accent">
        <Lock size={28} />
      </div>
      <div className="mt-4 text-lg font-bold">Цели защищены</div>
      <p className="mt-1 max-w-[280px] text-[13px] text-sub">
        Данные зашифрованы. Введи PIN-код, чтобы открыть.
      </p>
      <div className="mt-5 w-full max-w-[300px]">
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="PIN-код"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          className="text-center text-lg tracking-widest"
        />
        {unlockError && <div className="mt-2 text-xs font-medium text-neg">{unlockError}</div>}
        <Button variant="accent" className="mt-3 w-full" onClick={go} disabled={busy || !pin}>
          <Unlock size={16} /> Разблокировать
        </Button>
      </div>
    </div>
  )
}

// ---------- Основной контент ----------
function GoalsContent() {
  const g = useGoals()
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null })
  const [tasksOpen, setTasksOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)

  const todayLog = g.data.logs[g.todayKey]
  const doneCount = todayLog?.done.length || 0
  const total = g.data.tasks.length
  const todayPct = percentForDay(todayLog ? { done: todayLog.done, total } : undefined)
  const trend = useMemo(() => trendSeries(g.data.logs, g.todayKey, 30), [g.data.logs, g.todayKey])

  return (
    <div className="flex flex-col gap-5">
      {/* Серия + сегодня */}
      <Card className="overflow-hidden p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-accent/15 text-accent">
            <Flame size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="mono text-3xl font-bold leading-none">{g.streak}</span>
              <span className="text-sm text-sub">{plDays(g.streak)} подряд</span>
            </div>
            <div className="mt-1 text-xs text-faint">
              {total > 0 ? `Сегодня закрыто ${Math.min(doneCount, total)} из ${total} · ${todayPct}%` : 'Серия растёт, если закрыть хотя бы одну задачу за день'}
            </div>
          </div>
        </div>
      </Card>

      {/* Цели с дедлайном */}
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">Цели и сроки</div>
          <button
            onClick={() => setGoalSheet({ open: true, goal: null })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:opacity-80"
          >
            <Plus size={14} /> Цель
          </button>
        </div>
        {g.data.goals.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-faint">
            Добавь цель и дату — покажу, сколько дней осталось.
          </div>
        ) : (
          g.data.goals
            .slice()
            .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1))
            .map((goal, i) => {
              const c = countdownLabel(goal.targetDate)
              const over = daysLeft(goal.targetDate) < 0
              return (
                <div key={goal.id} className={cn('flex items-center gap-3 py-3', i && 'border-t border-line/8')}>
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-accent/15 text-accent">
                    <Target size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{goal.title}</div>
                    <div className="flex items-center gap-1 text-xs text-faint">
                      <CalendarClock size={12} /> {fmtDateLong(goal.targetDate)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-right leading-none">
                      <div className={cn('mono text-base font-bold', over ? 'text-neg' : 'text-accent')}>{c.text}</div>
                      <div className="text-[10px] text-faint">{c.sub}</div>
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => setGoalSheet({ open: true, goal })}
                        aria-label="Изменить"
                        className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-line/10 hover:text-ink"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => g.delGoal(goal.id)}
                        aria-label="Удалить"
                        className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-neg/15 hover:text-neg"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
        )}
      </Card>

      {/* Ежедневные цели — чек-ин */}
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">Цели на сегодня</div>
          <button
            onClick={() => setTasksOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:opacity-80"
          >
            <Pencil size={13} /> Изменить
          </button>
        </div>
        {total === 0 ? (
          <div className="py-6 text-center text-[13px] text-faint">
            Добавь ежедневные цели, которые важно закрывать каждый день.
          </div>
        ) : (
          g.data.tasks.map((task, i) => {
            const checked = !!todayLog?.done.includes(task.id)
            return (
              <button
                key={task.id}
                onClick={() => g.toggleToday(task.id)}
                className={cn('flex w-full items-center gap-3 py-2.5 text-left', i && 'border-t border-line/8')}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 flex-none place-items-center rounded-lg border transition',
                    checked ? 'border-accent bg-accent text-accent-ink' : 'border-line/25 text-transparent',
                  )}
                >
                  <Check size={15} />
                </span>
                <span className={cn('flex-1 text-sm', checked ? 'text-faint line-through' : 'text-ink')}>
                  {task.title}
                </span>
              </button>
            )
          })
        )}
      </Card>

      {/* График выполнения */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Выполнение по дням</div>
        {trend.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">
            Отмечай задачи по вечерам — здесь появится твоя динамика в %.
          </div>
        ) : (
          <TrendLine data={trend} />
        )}
      </Card>

      <SecurityCard onManage={() => setPinOpen(true)} />

      {!g.streak && g.data.goals.length === 0 && g.data.tasks.length === 0 ? null : (
        <button
          onClick={() => {
            if (window.confirm('Удалить все цели, ежедневные задачи и историю?')) g.clearAllGoals()
          }}
          className="mx-auto inline-flex items-center gap-1.5 py-1 text-xs font-medium text-faint transition hover:text-neg"
        >
          <Trash2 size={13} /> Очистить всё
        </button>
      )}

      <GoalSheet
        open={goalSheet.open}
        goal={goalSheet.goal}
        onClose={() => setGoalSheet({ open: false, goal: null })}
      />
      <TasksSheet open={tasksOpen} onClose={() => setTasksOpen(false)} />
      <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  )
}

// ---------- Безопасность / PIN ----------
function SecurityCard({ onManage }: { onManage: () => void }) {
  const { encrypted, cryptoOk, disablePin } = useGoals()
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 flex-none place-items-center rounded-2xl',
            encrypted ? 'bg-pos/15 text-pos' : 'bg-line/[0.06] text-faint',
          )}
        >
          {encrypted ? <ShieldCheck size={18} /> : <KeyRound size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{encrypted ? 'Цели зашифрованы' : 'Шифрование выключено'}</div>
          <div className="text-xs text-faint">
            {!cryptoOk
              ? 'Этот браузер не поддерживает шифрование'
              : encrypted
                ? 'Данные защищены PIN-кодом (AES-256)'
                : 'Поставь PIN — данные нельзя будет прочитать без него'}
          </div>
        </div>
      </div>
      {cryptoOk && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={onManage}>
            <KeyRound size={15} /> {encrypted ? 'Сменить PIN' : 'Поставить PIN'}
          </Button>
          <Button
            variant="soft"
            disabled={!encrypted}
            onClick={() => {
              if (window.confirm('Убрать PIN? Данные перестанут быть зашифрованными.')) void disablePin()
            }}
          >
            <Unlock size={15} /> Убрать PIN
          </Button>
        </div>
      )}
    </Card>
  )
}

// ---------- Лист: цель ----------
function GoalSheet({ open, goal, onClose }: { open: boolean; goal: Goal | null; onClose: () => void }) {
  const { addGoal, editGoal } = useGoals()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultTarget())

  // Подставляем значения при открытии / смене редактируемой цели
  useEffect(() => {
    if (open) {
      setTitle(goal?.title || '')
      setDate(goal?.targetDate || defaultTarget())
    }
  }, [open, goal])

  function save() {
    const ok = goal ? (editGoal(goal.id, title, date), true) : addGoal(title, date)
    if (ok) onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title={goal ? 'Цель' : 'Новая цель'}>
      <label className="mb-1.5 block text-xs font-medium text-sub">Что за цель</label>
      <Input
        autoFocus
        maxLength={80}
        placeholder="Например: запустить канал"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3"
      />
      <label className="mb-1.5 block text-xs font-medium text-sub">Дата, к которой хочу успеть</label>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-4" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="accent" onClick={save} disabled={!title.trim()}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  )
}

// ---------- Лист: ежедневные задачи ----------
function TasksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, addTask, editTask, delTask } = useGoals()
  const [draft, setDraft] = useState('')

  function add() {
    if (addTask(draft)) setDraft('')
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="Ежедневные цели">
      <p className="mb-3 text-[13px] text-sub">Список задач, которые важно закрывать каждый день.</p>
      <div className="mb-4 flex flex-col gap-2">
        {data.tasks.length === 0 && <div className="text-[13px] text-faint">Пока пусто — добавь первую ниже.</div>}
        {data.tasks.map((task) => (
          <TaskEditRow key={task.id} task={task} onRename={editTask} onDelete={delTask} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          maxLength={80}
          placeholder="Новая ежедневная цель"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="accent" onClick={add} disabled={!draft.trim()} className="flex-none px-3">
          <Plus size={18} />
        </Button>
      </div>
      <Button variant="soft" className="mt-4 w-full" onClick={onClose}>
        Готово
      </Button>
    </Sheet>
  )
}

function TaskEditRow({
  task,
  onRename,
  onDelete,
}: {
  task: DailyTask
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  const [text, setText] = useState(task.title)
  return (
    <div className="flex items-center gap-2">
      <Input
        maxLength={80}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim()
          if (t && t !== task.title) onRename(task.id, t)
          else setText(task.title)
        }}
      />
      <button
        onClick={() => onDelete(task.id)}
        aria-label="Удалить"
        className="grid h-11 w-11 flex-none place-items-center rounded-xl text-faint transition hover:bg-neg/15 hover:text-neg"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

// ---------- Лист: PIN ----------
function PinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { encrypted, enablePin, changePin } = useGoals()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPin('')
      setConfirm('')
      setErr('')
    }
  }, [open])

  async function save() {
    if (!validPin(pin)) {
      setErr(`Минимум ${PIN_MIN} символа`)
      return
    }
    if (pin !== confirm) {
      setErr('PIN-коды не совпадают')
      return
    }
    setBusy(true)
    const ok = await (encrypted ? changePin(pin) : enablePin(pin))
    setBusy(false)
    if (ok) onClose()
    else setErr('Не получилось — попробуй ещё раз')
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title={encrypted ? 'Сменить PIN' : 'Поставить PIN'}>
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-line/10 bg-line/[0.04] p-3 text-[12px] text-sub">
        <ShieldCheck size={16} className="mt-0.5 flex-none text-pos" />
        <span>
          Данные целей будут зашифрованы (AES-256). Вводить PIN нужно при каждом открытии.
          <b className="text-ink"> Если забыть PIN — восстановить данные нельзя.</b>
        </span>
      </div>
      <label className="mb-1.5 block text-xs font-medium text-sub">PIN-код</label>
      <Input
        type="password"
        inputMode="numeric"
        autoFocus
        placeholder={`минимум ${PIN_MIN} символа`}
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="mb-3"
      />
      <label className="mb-1.5 block text-xs font-medium text-sub">Повтори PIN</label>
      <Input
        type="password"
        inputMode="numeric"
        placeholder="ещё раз"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="mb-1"
      />
      {err && <div className="mb-2 text-xs font-medium text-neg">{err}</div>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="accent" onClick={save} disabled={busy || !pin || !confirm}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  )
}
