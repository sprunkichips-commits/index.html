import * as React from 'react'
import * as RS from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Select({
  value,
  onValueChange,
  placeholder,
  options,
  ariaLabel,
  labelFor,
}: {
  value: string
  onValueChange: (v: string) => void
  placeholder?: string
  options: string[]
  ariaLabel?: string
  labelFor?: (v: string) => string
}) {
  const [open, setOpen] = React.useState(false)

  // iOS/Telegram: при открытой экранной клавиатуре первый тап по селекту лишь
  // прятал её (blur сдвигал лист, «отложенный» клик WebKit промахивался мимо
  // уехавшего триггера — список открывался со второго раза). Перехватываем
  // касание на pointerdown — ДО потери фокуса инпутом: сами прячем клавиатуру
  // и мгновенно открываем список; preventDefault гасит паразитный клик.
  // Мышь (десктоп) идёт штатным путём Radix.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    const ae = document.activeElement
    if (ae instanceof HTMLElement && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      e.preventDefault()
      ae.blur()
      setOpen(true)
    }
  }

  return (
    <RS.Root value={value || undefined} onValueChange={onValueChange} open={open} onOpenChange={setOpen}>
      <RS.Trigger
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line/12 bg-line/[0.04] px-3 text-base text-ink outline-none',
          'data-[placeholder]:text-faint focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/25 transition',
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <ChevronDown size={16} className="text-faint" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          className="z-[60] max-h-[300px] min-w-[--radix-select-trigger-width] overflow-hidden rounded-xl glass shadow-lift border-line/12 animate-fade-in"
        >
          <RS.Viewport className="p-1">
            {options.map((opt) => (
              <RS.Item
                key={opt}
                value={opt}
                className={cn(
                  'relative flex h-10 cursor-pointer select-none items-center rounded-lg pl-3 pr-8 text-sm text-ink outline-none',
                  'data-[highlighted]:bg-accent/15 data-[highlighted]:text-ink',
                )}
              >
                <RS.ItemText>{labelFor ? labelFor(opt) : opt}</RS.ItemText>
                <RS.ItemIndicator className="absolute right-2">
                  <Check size={15} className="text-accent" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  )
}
