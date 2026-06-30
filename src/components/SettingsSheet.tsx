import { useRef, useState } from 'react'
import { Copy, Download, Moon, Sun, Trash2, Upload } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { Textarea } from './ui/input'
import { useStore } from '@/store/StoreContext'
import { hasCloud, tgUserId } from '@/lib/telegram'
import { cn } from '@/lib/utils'

export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { theme, setTheme, download, copy, restore, loadDemo, clearAll, toast } = useStore()
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function restoreFromText() {
    try {
      restore(JSON.parse(text || 'null'))
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
        restore(JSON.parse(String(r.result)))
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
    </Sheet>
  )
}
