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
      toast('Не получилось прочитать')
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
        toast('Файл не подходит')
      }
    }
    r.readAsText(f)
    e.target.value = ''
  }

  const cap = 'text-xs font-semibold uppercase tracking-wide text-faint'

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Настройки и копия">
      <div className={cn(cap, 'mb-2')}>Тема</div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button
          variant={theme === 'light' ? 'ink' : 'soft'}
          onClick={() => setTheme('light')}
        >
          <Sun size={15} /> Светлая
        </Button>
        <Button
          variant={theme === 'dark' ? 'accent' : 'soft'}
          onClick={() => setTheme('dark')}
        >
          <Moon size={15} /> Тёмная
        </Button>
      </div>

      {hasCloud ? (
        <>
          <div className={cn(cap, 'mb-2')}>Синхронизация Telegram</div>
          <p className="mb-4 text-[13px] leading-relaxed text-sub">
            Данные синхронизируются с твоим Telegram автоматически — видны только тебе и сразу на всех
            устройствах.
            <br />
            Твой ID: <b className="text-ink">{tgUserId ?? '—'}</b>
          </p>
        </>
      ) : (
        <p className="mb-4 text-[13px] leading-relaxed text-sub">
          Данные хранятся на этом устройстве. Чтобы перенести на телефон/ПК — скачай копию и загрузи на
          другом устройстве.
        </p>
      )}

      <div className={cn(cap, 'mb-2')}>Сделать копию</div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={download}>
          <Download size={15} /> Скачать файл
        </Button>
        <Button variant="soft" onClick={copy}>
          <Copy size={15} /> Скопировать
        </Button>
      </div>

      <div className={cn(cap, 'mb-2')}>Восстановить</div>
      <Button variant="soft" className="mb-2 w-full" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Загрузить файл
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <Textarea
        rows={3}
        placeholder="…или вставь скопированный текст сюда"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button variant="accent" className="mt-2 w-full" onClick={restoreFromText}>
        Восстановить из текста
      </Button>

      <div className="my-5 h-px bg-line/10" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={loadDemo}>
          Заполнить примером
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm('Удалить все операции и инвестиции?')) clearAll()
          }}
        >
          <Trash2 size={15} /> Очистить всё
        </Button>
      </div>
    </Sheet>
  )
}
