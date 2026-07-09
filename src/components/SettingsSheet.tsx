import { useMemo, useRef, useState } from 'react'
import { BarChart3, Copy, Download, FileSpreadsheet, History, Moon, Sun, Target, TrendingUp, Trash2, Upload } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Textarea } from './ui/input'
import { useStore } from '@/store/StoreContext'
import { useGoals } from '@/store/GoalsContext'
import { hasCloud, tgUserId } from '@/lib/telegram'
import { today } from '@/lib/format'
import { fmtDateLong } from '@/lib/format'
import { downloadText, goalsCsv, invCsv, txCsv } from '@/lib/csv'
import { GKEY, KEY, readSnapshot } from '@/lib/storage'
import { cn } from '@/lib/utils'

export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, theme, setTheme, chartStyle, setChartStyle, restore, restoreSnapshot, loadDemo, clearAll, toast } =
    useStore()
  const goals = useGoals()
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Дата самого свежего автоснимка (финансы/цели) — пересчитываем при открытии.
  const snapDate = useMemo(() => {
    if (!open) return null
    const a = readSnapshot(KEY)?.d ?? null
    const b = readSnapshot(GKEY)?.d ?? null
    return a && b ? (a > b ? a : b) : a || b
  }, [open])

  function exportTxCsv() {
    const ok = downloadText('transactions-' + today() + '.csv', txCsv(data.transactions))
    if (ok && data.investments.length) {
      // отдельным файлом, с паузой — иначе браузер может проглотить второй клик
      setTimeout(() => downloadText('investments-' + today() + '.csv', invCsv(data.investments)), 400)
    }
    toast(ok ? 'CSV downloaded' : 'Could not download')
  }

  function exportGoalsCsv() {
    const ok = downloadText('goals-' + today() + '.csv', goalsCsv(goals.data))
    toast(ok ? 'CSV downloaded' : 'Could not download')
  }

  async function restoreFromSnapshot() {
    if (!window.confirm('Roll back to the auto-snapshot? Changes made since then will be lost.')) return
    const okFin = restoreSnapshot()
    const okGoals = await goals.restoreGoalsSnapshot()
    toast(okFin || okGoals ? 'Snapshot restored' : 'No snapshot yet')
  }

  // Бэкап включает и финансы, и цели — один файл спасает всё.
  // Старые файлы (без ключа goals) восстанавливаются как раньше.
  function exportStr(pretty: boolean): string {
    const full = { ...data, goals: goals.data }
    return JSON.stringify(full, null, pretty ? 2 : undefined)
  }

  function restoreAll(obj: unknown) {
    restore(obj) // финансы (строгий sanitize внутри)
    if (obj && typeof obj === 'object' && 'goals' in obj) {
      goals.restoreGoals((obj as { goals: unknown }).goals)
    }
  }

  function download() {
    try {
      const blob = new Blob([exportStr(true)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dengi-backup-' + today() + '.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('File downloaded')
    } catch {
      toast('Could not download')
    }
  }

  function copy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(exportStr(false)).then(
        () => toast('Copied'),
        () => toast('Could not copy'),
      )
    } else {
      toast('Clipboard unavailable')
    }
  }

  function restoreFromText() {
    try {
      restoreAll(JSON.parse(text || 'null'))
      onOpenChange(false)
    } catch {
      toast('Could not read')
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        restoreAll(JSON.parse(String(r.result)))
        onOpenChange(false)
      } catch {
        toast('Invalid file')
      }
    }
    r.readAsText(f)
    e.target.value = ''
  }

  const cap = 'text-xs font-semibold uppercase tracking-wide text-faint'

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Settings & backup">
      <div className={cn(cap, 'mb-2')}>Theme</div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button
          variant={theme === 'light' ? 'ink' : 'soft'}
          onClick={() => setTheme('light')}
        >
          <Sun size={15} /> Light
        </Button>
        <Button
          variant={theme === 'dark' ? 'accent' : 'soft'}
          onClick={() => setTheme('dark')}
        >
          <Moon size={15} /> Dark
        </Button>
      </div>

      <div className={cn(cap, 'mb-2')}>Chart style</div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button
          variant={chartStyle === 'classic' ? 'accent' : 'soft'}
          onClick={() => setChartStyle('classic')}
        >
          <BarChart3 size={15} /> Classic
        </Button>
        <Button
          variant={chartStyle === 'studio' ? 'accent' : 'soft'}
          onClick={() => setChartStyle('studio')}
        >
          <TrendingUp size={15} /> Studio
        </Button>
      </div>

      {hasCloud ? (
        <>
          <div className={cn(cap, 'mb-2')}>Telegram sync</div>
          <p className="mb-4 text-[13px] leading-relaxed text-sub">
            Your data syncs with Telegram automatically — visible only to you and instantly on every
            device.
            <br />
            Your ID: <b className="text-ink">{tgUserId ?? '—'}</b>
          </p>
        </>
      ) : (
        <p className="mb-4 text-[13px] leading-relaxed text-sub">
          Data is stored on this device. To move it to a phone/PC — download a backup and load it on the
          other device.
        </p>
      )}

      <div className={cn(cap, 'mb-2')}>Backup</div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={download}>
          <Download size={15} /> Download file
        </Button>
        <Button variant="soft" onClick={copy}>
          <Copy size={15} /> Copy
        </Button>
      </div>

      <div className={cn(cap, 'mb-2')}>Export to Excel (CSV)</div>
      <p className="mb-2 text-[13px] leading-relaxed text-sub">
        Opens in Excel / Google Sheets as a ready table — sort, filter, build charts.
      </p>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={exportTxCsv}>
          <FileSpreadsheet size={15} /> Transactions
        </Button>
        <Button variant="soft" onClick={exportGoalsCsv}>
          <Target size={15} /> Goals
        </Button>
      </div>

      {snapDate && (
        <>
          <div className={cn(cap, 'mb-2')}>Auto-snapshot</div>
          <p className="mb-2 text-[13px] leading-relaxed text-sub">
            A local safety copy is kept automatically before the first change of each day.
          </p>
          <Button variant="soft" className="mb-5 w-full" onClick={restoreFromSnapshot}>
            <History size={15} /> Roll back to {fmtDateLong(snapDate)}
          </Button>
        </>
      )}

      <div className={cn(cap, 'mb-2')}>Restore</div>
      <Button variant="soft" className="mb-2 w-full" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Upload file
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <Textarea
        rows={3}
        placeholder="…or paste copied text here"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button variant="accent" className="mt-2 w-full" onClick={restoreFromText}>
        Restore from text
      </Button>

      <div className="my-5 h-px bg-line/10" />
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="soft"
          onClick={() => {
            loadDemo()
            onOpenChange(false)
          }}
        >
          Fill with example
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm('Delete all transactions?')) {
              clearAll()
              onOpenChange(false)
            }
          }}
        >
          <Trash2 size={15} /> Clear all
        </Button>
      </div>

      {/* Версия сборки: сверяй с последним коммитом на GitHub, чтобы понять,
          подтянулось ли обновление (кэш Telegram/Pages живёт до ~10 минут). */}
      <div className="mono mt-4 text-center text-[11px] text-faint">Version {__APP_VERSION__}</div>
    </Sheet>
  )
}
