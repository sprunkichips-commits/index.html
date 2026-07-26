import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Drawer } from 'vaul'
import { AnimatePresence, m } from 'framer-motion'
import { X } from 'lucide-react'
import { useIsMobileUi } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

export interface AdaptiveDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  /** Убрать заголовок с крестиком — когда содержимое рисует свою шапку. */
  bare?: boolean
  children: React.ReactNode
}

/**
 * Диалог, который на телефоне выезжает снизу шторкой, а на ПК открывается
 * модальным окном по центру.
 *
 * Почему две разные реализации, а не одна с медиазапросами в CSS: шторке нужны
 * жест закрытия свайпом, инерция и подстройка под экранную клавиатуру — это
 * поведение, а не оформление. За него отвечает vaul; на ПК ничего этого не
 * нужно, там достаточно Radix Dialog, который даёт фокус-трап, Esc и клик по фону.
 *
 * Оба варианта используют одинаковый набор пропсов, поэтому вызывающий код
 * (и уже существующий Sheet) не знает, какой из них сейчас работает.
 */
export function AdaptiveDialog({ open, onOpenChange, title, bare, children }: AdaptiveDialogProps) {
  const mobile = useIsMobileUi()
  return mobile ? (
    <MobileSheet open={open} onOpenChange={onOpenChange} title={title} bare={bare}>
      {children}
    </MobileSheet>
  ) : (
    <DesktopModal open={open} onOpenChange={onOpenChange} title={title} bare={bare}>
      {children}
    </DesktopModal>
  )
}

const PANEL = 'glass border-line/12 shadow-lift focus:outline-none'

function CloseButton() {
  return (
    <Dialog.Close asChild>
      <m.button
        type="button"
        aria-label="Close"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        className="grid h-10 w-10 place-items-center rounded-xl text-sub transition-colors hover:bg-line/[0.08] hover:text-ink"
      >
        <X size={18} />
      </m.button>
    </Dialog.Close>
  )
}

// ---------- Телефон: шторка снизу ----------

function MobileSheet({ open, onOpenChange, title, bare, children }: AdaptiveDialogProps) {
  return (
    // repositionInputs (по умолчанию) поднимает шторку над экранной клавиатурой —
    // без этого поле ввода суммы оказывалось под ней.
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          className={cn(
            PANEL,
            'fixed bottom-0 left-0 right-0 z-50 mx-auto flex w-full max-w-[520px] flex-col',
            'rounded-t-[26px] border-t',
            // Высота по содержимому, но не выше экрана; прокрутка внутри.
            'max-h-[94svh]',
          )}
        >
          {/* Полоска-ручка: показывает, что шторку можно потянуть, и служит
              удобной областью захвата для жеста закрытия. */}
          <div className="mx-auto mt-3 h-1.5 w-10 flex-none rounded-full bg-line/25" />
          <div className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
            {bare ? null : (
              <div className="mb-4 flex items-center justify-between">
                <Drawer.Title className="text-lg font-bold">{title}</Drawer.Title>
                <Drawer.Close asChild>
                  <m.button
                    type="button"
                    aria-label="Close"
                    whileTap={{ scale: 0.95 }}
                    className="grid h-10 w-10 place-items-center rounded-xl text-sub transition-colors hover:bg-line/[0.08] hover:text-ink"
                  >
                    <X size={18} />
                  </m.button>
                </Drawer.Close>
              </div>
            )}
            {/* Заголовок обязателен для программ чтения с экрана даже в bare-режиме. */}
            {bare && <Drawer.Title className="sr-only">{title}</Drawer.Title>}
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ---------- ПК: модальное окно по центру ----------

function DesktopModal({ open, onOpenChange, title, bare, children }: AdaptiveDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* forceMount + AnimatePresence: без этого Radix убирает содержимое из
          дерева мгновенно, и анимации закрытия не видно вообще. */}
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <m.div
                className={cn(
                  PANEL,
                  'fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-2rem))]',
                  'max-h-[88vh] overflow-y-auto rounded-3xl border p-5',
                )}
                initial={{ opacity: 0, scale: 0.97, x: '-50%', y: '-48%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.97, x: '-50%', y: '-48%' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
              >
                {bare ? (
                  <Dialog.Title className="sr-only">{title}</Dialog.Title>
                ) : (
                  <div className="mb-4 flex items-center justify-between">
                    <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
                    <CloseButton />
                  </div>
                )}
                {children}
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
