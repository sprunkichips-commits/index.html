import { useMemo, useRef, useState } from 'react'
import { BarChart3, CloudUpload, Copy, Download, FileSpreadsheet, History, Loader2, Moon, Sun, Target, TrendingUp, Trash2, Upload } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Textarea } from './ui/input'
import { useStore } from '@/store/StoreContext'
import { useGoals } from '@/store/GoalsContext'
import { api, ApiError, type ImportReport } from '@/lib/api'
import { hasCloud, tgAlert, tgConfirm, tgUserId } from '@/lib/telegram'
import { today } from '@/lib/format'
import { fmtDateLong } from '@/lib/format'
import { downloadText, goalsCsv, invCsv, txCsv } from '@/lib/csv'
import { GKEY, KEY, readSnapshot } from '@/lib/storage'
import { cn } from '@/lib/utils'

export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, theme, setTheme, chartStyle, setChartStyle, restore, restoreSnapshot, loadDemo, clearAll, toast, cloud, auth, profile, setProfile } =
    useStore()
  const goals = useGoals()
  const [text, setText] = useState('')
  const [wiping, setWiping] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cloudFileRef = useRef<HTMLInputElement>(null)
  // Состояние переноса в облако: idle → sending → отчёт или ошибка.
  const [upload, setUpload] = useState<{ busy: boolean; report: ImportReport | null; error: string | null }>({
    busy: false,
    report: null,
    error: null,
  })

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

  /** Отправка набора данных в облако + разбор ошибки понятным текстом. */
  async function sendToCloud(payload: unknown) {
    setUpload({ busy: true, report: null, error: null })
    try {
      const report = await api.importBackup(payload)
      setUpload({ busy: false, report, error: null })
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 503
          ? 'Database is not connected on the server yet'
          : e instanceof ApiError
            ? e.message
            : 'Something went wrong'
      setUpload({ busy: false, report: null, error: msg })
    }
  }

  /**
   * Перенос данных в облако. Отправляет тот же набор, что и файл бэкапа,
   * прямо из приложения — подпись Telegram уже есть, руками ничего доставать
   * не нужно. Локальные данные остаются на месте: это копирование, не переезд.
   */
  function uploadToCloud() {
    // Цели расшифровываются асинхронно. Если отправить раньше готовности,
    // они уйдут пустыми, а отчёт покажет «Goals: 0» — будто их нет вовсе.
    if (goals.status !== 'ready') return
    void sendToCloud({ ...data, goals: goals.data, profile })
  }

  /**
   * Перенос из файла бэкапа сразу в облако, минуя состояние приложения.
   * Нужен там, где данных на устройстве ещё нет: сайт или свежая версия
   * в Телеграме. Одно действие вместо «сначала восстановить, потом отправить»,
   * и локальная копия не подменяется — её перезапишет обычная загрузка из облака.
   */
  function onCloudFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        void sendToCloud(JSON.parse(String(r.result)))
      } catch {
        setUpload({ busy: false, report: null, error: 'This file is not a «Деньги» backup — expected the .json saved by «Download file».' })
      }
    }
    r.onerror = () => setUpload({ busy: false, report: null, error: 'Could not read the file' })
    r.readAsText(f)
  }

  /**
   * Полное стирание по кнопке «Clear all».
   *
   * Порядок важен: сначала облако (пока записи в базе, локальная очистка живёт
   * до первой синхронизации), затем локальные копии и Telegram. Если облако не
   * ответило — честно показываем причину и НЕ говорим «удалено».
   *
   * Подтверждение — через tgConfirm: внутри Telegram window.confirm не
   * показывается вовсе, и кнопка молча ничего не делала бы.
   */
  async function wipeEverything() {
    const ok = await tgConfirm(
      'Delete everything?\n\nAll transactions, goals, habits and your profile will be permanently deleted — in the cloud and on this device. This cannot be undone.\n\nDownload a backup first if you might need the data.',
    )
    if (!ok) return
    setWiping(true)
    try {
      const res = await clearAll()
      if (!res.ok) {
        tgAlert(`Nothing was deleted.\n\n${res.error ?? 'Unknown error'}`)
        toast('Could not delete')
        return
      }
      await goals.wipeGoals()
      const n = res.deleted?.transactions ?? 0
      toast(n ? `Deleted everything (${n} records)` : 'Deleted everything')
      // Диагностика схемы: если в базе не хватает таблиц, об этом лучше знать —
      // тот же перенос целей из бэкапа в такую базу тоже не сохранится.
      if (res.missing?.length) {
        tgAlert(
          `Deleted everything.\n\nNote: your database has no ${res.missing.join(', ')} table(s). Nothing was lost now, but re-applying worker/schema.sql would fix future imports.`,
        )
      }
      onOpenChange(false)
    } finally {
      setWiping(false)
    }
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
    const full = { ...data, goals: goals.data, profile }
    return JSON.stringify(full, null, pretty ? 2 : undefined)
  }

  function restoreAll(obj: unknown) {
    restore(obj) // финансы (строгий sanitize внутри)
    if (obj && typeof obj === 'object' && 'goals' in obj) {
      goals.restoreGoals((obj as { goals: unknown }).goals)
    }
    // Профиль лежит в бэкапе отдельным блоком — восстанавливаем и его.
    if (obj && typeof obj === 'object' && 'profile' in obj) {
      const p = (obj as { profile?: { name?: string; avatar?: string } }).profile
      if (p && typeof p === 'object') setProfile({ name: p.name ?? '', avatar: p.avatar ?? '' })
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

      {/* Перенос в облако Cloudflare. Виден только в Telegram: без подписи
          сервер откажет в доступе. Копирует данные, локальные не трогает. */}
      {auth === 'authed' && (
        <>
          <div className={cn(cap, 'mb-2')}>Cloud storage</div>
          <div
            className={cn(
              'mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px]',
              cloud === 'synced' && 'border-pos/30 bg-pos/10 text-pos',
              cloud === 'offline' && 'border-line/15 bg-line/[0.05] text-sub',
              cloud === 'syncing' && 'border-line/15 bg-line/[0.05] text-sub',
            )}
          >
            {cloud === 'syncing' && <Loader2 size={14} className="animate-spin" />}
            {cloud === 'synced' && 'Synced with the cloud — same data on every device'}
            {cloud === 'syncing' && 'Loading from the cloud…'}
            {cloud === 'offline' && 'No connection — showing the last saved copy'}
          </div>
          <p className="mb-2 text-[13px] leading-relaxed text-sub">
            The cloud is the source of truth. A copy stays on this device so the app opens and
            works without a connection; new entries need a connection to be saved.
          </p>
          <Button
            variant="soft"
            className="w-full"
            onClick={uploadToCloud}
            disabled={upload.busy || goals.status !== 'ready'}
          >
            {upload.busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Uploading…
              </>
            ) : goals.status !== 'ready' ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Preparing…
              </>
            ) : (
              <>
                <CloudUpload size={15} /> Upload to cloud
              </>
            )}
          </Button>

          <Button
            variant="soft"
            className="mt-2 w-full"
            onClick={() => cloudFileRef.current?.click()}
            disabled={upload.busy}
          >
            <Upload size={15} /> Load backup file into cloud
          </Button>
          <input
            ref={cloudFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onCloudFile}
          />
          <p className="mt-2 text-[13px] leading-relaxed text-sub">
            Use this on the website or on a fresh install: pick the .json saved by «Download file» in
            the old app. Sending the same file twice is safe — nothing gets duplicated.
          </p>

          {upload.error && (
            <div className="mt-2 rounded-xl border border-neg/30 bg-neg/10 px-3 py-2 text-[13px] text-neg">
              {upload.error}
            </div>
          )}

          {upload.report && (
            <div className="mt-2 rounded-xl border border-line/12 bg-line/[0.04] px-3 py-2.5 text-[13px]">
              <div className="font-semibold text-pos">Uploaded</div>
              <div className="mt-1 space-y-0.5 text-sub">
                {(
                  [
                    ['Transactions', upload.report.transactions],
                    ['Goals', upload.report.goals],
                    ['Daily tasks', upload.report.tasks],
                    ['Check-ins', upload.report.taskLog],
                  ] as const
                ).map(([label, c]) => (
                  <div key={label}>
                    {label}: {c.imported} new
                    {c.duplicates > 0 && `, ${c.duplicates} already there`}
                    {c.skipped > 0 && `, ${c.skipped} skipped`}
                  </div>
                ))}
                {/* Профиль — не счётчик, а факт: перенёсся ник с аватаром или нет. */}
                <div>Profile: {upload.report.profile ? 'transferred' : 'nothing to transfer'}</div>
              </div>
              {upload.report.warnings.length > 0 && (
                <ul className="mt-1.5 list-inside list-disc text-xs text-faint">
                  {upload.report.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="my-5 h-px bg-line/10" />
        </>
      )}

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
        <Button variant="danger" disabled={wiping} onClick={wipeEverything}>
          {wiping ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          {wiping ? 'Deleting…' : 'Clear all'}
        </Button>
      </div>
      {/* Кнопка необратимая — говорим об этом до нажатия, а не только в попапе. */}
      <p className="mt-2 text-[12px] leading-relaxed text-faint">
        «Clear all» deletes everything — transactions, goals, habits and profile — in the cloud and on
        this device. This cannot be undone.
      </p>

      {/* Версия сборки и адрес, с которого открыто приложение. Адрес важен:
          со старого хостинга облачное сохранение не работает (там только файлы). */}
      <div className="mono mt-4 text-center text-[11px] leading-relaxed text-faint">
        Version {__APP_VERSION__}
        <br />
        {typeof location !== 'undefined' ? location.host : ''}
      </div>
    </Sheet>
  )
}
