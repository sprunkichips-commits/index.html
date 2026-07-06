import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Flame, Pencil, Plus, Target, Trash2, X } from 'lucide-react'
import { useGoals } from '@/store/GoalsContext'
import {
  type DailyTask,
  type Goal,
  RANGE_MAX_DAYS,
  daysLeft,
  localDateStr,
  percentForDay,
  rangeSeries,
  shiftDate,
  taskStats,
} from '@/lib/goals'
import { fmtDateLong } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Sheet } from '@/components/ui/sheet'
import { TrendLine } from '@/components/charts/TrendLine'
import { cn } from '@/lib/utils'

function dayWord(n: number): string {
  return Math.abs(n) === 1 ? 'day' : 'days'
}

function countdown(target: string): { big: string; sub: string; over: boolean; small: boolean } {
  const dl = daysLeft(target)
  if (dl > 0) return { big: `${dl}d`, sub: 'left', over: false, small: false }
  if (dl === 0) return { big: 'Today', sub: '', over: false, small: true }
  return { big: 'Overdue', sub: `${Math.abs(dl)}d ago`, over: true, small: true }
}

function defaultTarget(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return localDateStr(d)
}

type Period = '7' | '14' | '28' | 'custom'

const PERIODS: { value: Period; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '28', label: '28d' },
  { value: 'custom', label: 'Custom' },
]

const DT_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function fmtShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return isNaN(d.getTime()) ? dateStr : DT_SHORT.format(d)
}

export function Goals() {
  const g = useGoals()
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null })
  const [tasksOpen, setTasksOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('7')
  const [custom, setCustom] = useState(() => ({ from: shiftDate(localDateStr(), -27), to: localDateStr() }))
  const [rangeOpen, setRangeOpen] = useState(false)
  const [selDay, setSelDay] = useState(g.todayKey)

  const todayLog = g.data.logs[g.todayKey]
  const doneCount = todayLog?.done.length || 0
  const total = g.data.tasks.length
  const todayPct = percentForDay(todayLog ? { done: todayLog.done, total } : undefined)

  // Диапазон графика: пресеты — всегда ровно последние N дней до сегодня
  // (как в YouTube Studio), кастом — как выбрал пользователь. Дни без записей
  // рисуются нулями — переключение периода всегда меняет окно.
  const range = useMemo(() => {
    if (period === 'custom') {
      return { from: custom.from, to: custom.to > g.todayKey ? g.todayKey : custom.to }
    }
    const n = Number(period)
    return { from: shiftDate(g.todayKey, -(n - 1)), to: g.todayKey }
  }, [period, custom, g.todayKey])

  const trend = useMemo(() => rangeSeries(g.data.logs, range.from, range.to), [g.data.logs, range])
  const stats = useMemo(
    () => taskStats(g.data.logs, g.data.tasks, range.from, range.to),
    [g.data.logs, g.data.tasks, range],
  )

  // Выбранный день всегда внутри диапазона; по умолчанию — последний (сегодня).
  useEffect(() => {
    if (trend.length && !trend.some((p) => p.date === selDay)) setSelDay(trend[trend.length - 1].date)
  }, [trend, selDay])

  const selLog = g.data.logs[selDay]
  const selDone = g.data.tasks.filter((t) => !!selLog?.done.includes(t.id)).length

  if (g.status === 'loading') {
    return <div className="py-16 text-center text-sm text-faint">Loading…</div>
  }

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
              <span className="text-sm text-sub">{dayWord(g.streak)} streak</span>
            </div>
            <div className="mt-1 text-xs text-faint">
              {total > 0
                ? `Today ${Math.min(doneCount, total)} of ${total} done · ${todayPct}%`
                : 'Keep your streak by closing at least one task a day'}
            </div>
          </div>
        </div>
      </Card>

      {/* Цели со сроком */}
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold">Goals & deadlines</div>
          <button
            onClick={() => setGoalSheet({ open: true, goal: null })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:opacity-80"
          >
            <Plus size={14} /> Goal
          </button>
        </div>
        {g.data.goals.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-faint">
            Add a goal and a date — I'll show how many days are left.
          </div>
        ) : (
          g.data.goals
            .slice()
            .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1))
            .map((goal, i) => {
              const c = countdown(goal.targetDate)
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
                  <div className="flex flex-none flex-col items-end gap-1">
                    <div className="flex items-baseline gap-1 leading-none">
                      <span className={cn('font-extrabold', c.small ? 'text-lg' : 'text-2xl', c.over ? 'text-neg' : 'text-accent')}>
                        {c.big}
                      </span>
                      {c.sub && <span className="text-[11px] text-faint">{c.sub}</span>}
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => setGoalSheet({ open: true, goal })}
                        aria-label="Edit"
                        className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-line/10 hover:text-ink"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => g.delGoal(goal.id)}
                        aria-label="Delete"
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

      {/* Ежедневные цели — без разделительных полосок */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Today's goals</div>
          <button
            onClick={() => setTasksOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:opacity-80"
          >
            <Pencil size={13} /> Edit
          </button>
        </div>
        {total === 0 ? (
          <div className="py-6 text-center text-[13px] text-faint">
            Add daily goals you want to close every day.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {g.data.tasks.map((task) => {
              const checked = !!todayLog?.done.includes(task.id)
              return (
                <button
                  key={task.id}
                  onClick={() => g.toggleToday(task.id)}
                  className="flex w-full items-center gap-3 rounded-xl py-2 text-left transition active:scale-[.99] [@media(hover:hover)]:hover:bg-line/[0.04]"
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
            })}
          </div>
        )}
      </Card>

      {/* График выполнения: период → линия → детали дня → разбивка по задачам */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Daily completion</div>
        <Segmented
          value={period}
          onChange={(v) => (v === 'custom' ? setRangeOpen(true) : setPeriod(v))}
          options={PERIODS}
          className="mb-1"
        />
        {period === 'custom' && (
          <div className="mb-1 mt-1 text-center text-[11px] text-faint">
            {fmtShort(range.from)} – {fmtShort(range.to)}
          </div>
        )}
        {Object.keys(g.data.logs).length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">
            Check tasks each evening — your % trend will show up here.
          </div>
        ) : trend.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">No days in this range.</div>
        ) : (
          <>
            <div className="mt-2">
              <TrendLine data={trend} selected={selDay} onSelect={setSelDay} />
            </div>

            {/* Что сделано в выбранный день (тап по графику) */}
            {total > 0 && trend.some((p) => p.date === selDay) && (
              <div className="mt-3 border-t border-line/8 pt-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-[13px] font-semibold">{fmtDateLong(selDay)}</div>
                  <div className="text-xs text-faint">
                    {selDone} of {total} · {total ? Math.round((selDone / total) * 100) : 0}%
                  </div>
                </div>
                <div className="mt-1.5 flex flex-col">
                  {g.data.tasks.map((task) => {
                    const done = !!selLog?.done.includes(task.id)
                    return (
                      <div key={task.id} className="flex items-center gap-2.5 py-1.5">
                        <span
                          className={cn(
                            'grid h-5 w-5 flex-none place-items-center rounded-md border',
                            done ? 'border-accent bg-accent text-accent-ink' : 'border-line/20 text-faint',
                          )}
                        >
                          {done ? <Check size={13} /> : <X size={12} />}
                        </span>
                        <span className={cn('min-w-0 flex-1 truncate text-[13px]', done ? 'text-ink' : 'text-faint')}>
                          {task.title}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Разбивка по задачам за период: что делаю чаще, что реже */}
            {stats.length > 0 && (
              <div className="mt-3 border-t border-line/8 pt-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-[13px] font-semibold">By task</div>
                  <div className="text-[11px] text-faint">% of days done</div>
                </div>
                <div className="flex flex-col gap-2.5">
                  {stats.map((s) => (
                    <div key={s.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px]">{s.title}</span>
                        <span className="flex flex-none items-baseline gap-1.5">
                          <span className="text-[11px] text-faint">
                            {s.doneDays}/{s.days}
                          </span>
                          <span className="mono w-9 text-right text-[13px] font-bold">{s.pct}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line/10">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {g.data.goals.length || g.data.tasks.length || Object.keys(g.data.logs).length ? (
        <button
          onClick={() => {
            if (window.confirm('Delete all goals, daily tasks and history?')) g.clearAllGoals()
          }}
          className="mx-auto inline-flex items-center gap-1.5 py-1 text-xs font-medium text-faint transition hover:text-neg"
        >
          <Trash2 size={13} /> Clear all
        </button>
      ) : null}

      <GoalSheet
        open={goalSheet.open}
        goal={goalSheet.goal}
        onClose={() => setGoalSheet({ open: false, goal: null })}
      />
      <TasksSheet open={tasksOpen} onClose={() => setTasksOpen(false)} />
      <RangeSheet
        open={rangeOpen}
        from={custom.from}
        to={custom.to}
        todayKey={g.todayKey}
        onApply={(from, to) => {
          setCustom({ from, to })
          setPeriod('custom')
          setRangeOpen(false)
        }}
        onClose={() => setRangeOpen(false)}
      />
    </div>
  )
}

// ---------- Лист: кастомный период (как в YouTube Studio) ----------
function RangeSheet({
  open,
  from,
  to,
  todayKey,
  onApply,
  onClose,
}: {
  open: boolean
  from: string
  to: string
  todayKey: string
  onApply: (from: string, to: string) => void
  onClose: () => void
}) {
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)

  useEffect(() => {
    if (open) {
      setF(from)
      setT(to)
    }
  }, [open, from, to])

  const spanDays = f && t && f <= t ? daysLeft(t, f) + 1 : 0
  const err =
    !f || !t
      ? 'Pick both dates'
      : f > t
        ? 'Start date is after end date'
        : f > todayKey
          ? 'Start date is in the future'
          : spanDays > RANGE_MAX_DAYS
            ? `Max range is ${RANGE_MAX_DAYS} days`
            : null

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="Custom range">
      <label className="mb-1.5 block text-xs font-medium text-sub">From</label>
      <Input type="date" value={f} max={todayKey} onChange={(e) => setF(e.target.value)} className="mb-3" />
      <label className="mb-1.5 block text-xs font-medium text-sub">To</label>
      <Input type="date" value={t} max={todayKey} onChange={(e) => setT(e.target.value)} className="mb-2" />
      <div className={cn('mb-4 min-h-[18px] text-xs', err ? 'text-neg' : 'text-faint')}>
        {err || `${spanDays} ${dayWord(spanDays)}`}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" disabled={!!err} onClick={() => onApply(f, t > todayKey ? todayKey : t)}>
          Apply
        </Button>
      </div>
    </Sheet>
  )
}

// ---------- Лист: цель ----------
function GoalSheet({ open, goal, onClose }: { open: boolean; goal: Goal | null; onClose: () => void }) {
  const { addGoal, editGoal } = useGoals()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultTarget())

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
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title={goal ? 'Goal' : 'New goal'}>
      <label className="mb-1.5 block text-xs font-medium text-sub">What's the goal</label>
      <Input
        autoFocus
        maxLength={80}
        placeholder="e.g. launch a channel"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3"
      />
      <label className="mb-1.5 block text-xs font-medium text-sub">Target date</label>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-4" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" onClick={save} disabled={!title.trim()}>
          Save
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
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="Daily goals">
      <p className="mb-3 text-[13px] text-sub">Tasks you want to close every day.</p>
      <div className="mb-4 flex flex-col gap-2">
        {data.tasks.length === 0 && <div className="text-[13px] text-faint">Empty — add your first below.</div>}
        {data.tasks.map((task) => (
          <TaskEditRow key={task.id} task={task} onRename={editTask} onDelete={delTask} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          maxLength={80}
          placeholder="New daily goal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="accent" onClick={add} disabled={!draft.trim()} className="flex-none px-3">
          <Plus size={18} />
        </Button>
      </div>
      <Button variant="soft" className="mt-4 w-full" onClick={onClose}>
        Done
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
        aria-label="Delete"
        className="grid h-11 w-11 flex-none place-items-center rounded-xl text-faint transition hover:bg-neg/15 hover:text-neg"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
