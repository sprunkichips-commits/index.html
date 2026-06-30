import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Flame, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useGoals } from '@/store/GoalsContext'
import { type DailyTask, type Goal, daysLeft, localDateStr, percentForDay, trendSeries } from '@/lib/goals'
import { fmtDateLong } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export function Goals() {
  const g = useGoals()
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null })
  const [tasksOpen, setTasksOpen] = useState(false)

  const todayLog = g.data.logs[g.todayKey]
  const doneCount = todayLog?.done.length || 0
  const total = g.data.tasks.length
  const todayPct = percentForDay(todayLog ? { done: todayLog.done, total } : undefined)
  const trend = useMemo(() => trendSeries(g.data.logs, g.todayKey, 30), [g.data.logs, g.todayKey])

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

      {/* График выполнения */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Daily completion</div>
        {trend.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-faint">
            Check tasks each evening — your % trend will show up here.
          </div>
        ) : (
          <TrendLine data={trend} />
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
    </div>
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
