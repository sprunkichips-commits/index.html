import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Лист-модалка: снизу на телефоне, по центру на ПК. На Radix Dialog — фокус-трап,
 * Esc, клик по фону. Контент пользователя React экранирует автоматически.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 left-0 right-0 bottom-0 mx-auto w-full max-w-[460px]',
            'sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2',
            'glass shadow-lift border-line/12',
            'rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto animate-sheet-up',
            'focus:outline-none',
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close
              className="grid place-items-center h-10 w-10 rounded-xl text-sub hover:bg-line/[0.08] hover:text-ink transition"
              aria-label="Close"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
