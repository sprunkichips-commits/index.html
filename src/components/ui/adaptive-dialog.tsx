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
  /**
   * Панель действий, закреплённая внизу. Отдельным пропсом, а не частью
   * children: только так кнопка сохранения остаётся видимой, когда содержимое
   * прокручивается или клавиатура съедает половину экрана.
   */
  footer?: React.ReactNode
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
export function AdaptiveDialog({ open, onOpenChange, title, bare, footer, children }: AdaptiveDialogProps) {
  const mobile = useIsMobileUi()
  const Impl = mobile ? MobileSheet : DesktopModal
  return (
    <Impl open={open} onOpenChange={onOpenChange} title={title} bare={bare} footer={footer}>
      {children}
    </Impl>
  )
}

const PANEL = 'glass border-line/12 shadow-lift focus:outline-none'

/**
 * Фокус на поле с data-autofocus в момент открытия — синхронно, внутри того же
 * действия пользователя. iOS показывает клавиатуру только на focus() из
 * пользовательского жеста, поэтому setTimeout здесь не годится; и именно
 * благодаря синхронности шторка и клавиатура выезжают ОДНОЙ анимацией, а не
 * одна за другой. Без обработчика Radix увёл бы фокус на кнопку закрытия.
 */
function focusFirstField(e: Event) {
  const root = e.currentTarget as HTMLElement | null
  const field = root?.querySelector<HTMLElement>('[data-autofocus]')
  if (!field) return
  e.preventDefault()
  field.focus({ preventScroll: true })
}

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

function MobileSheet({ open, onOpenChange, title, bare, footer, children }: AdaptiveDialogProps) {
  return (
    // repositionInputs={false} — намеренно. Своя подстройка vaul под клавиатуру
    // сдвигает всю шторку вверх, и внутри Telegram на iOS это давало сразу три
    // беды: заголовок уезжал под шапку Telegram, низ обрезался, а между шторкой
    // и клавиатурой оставалась тёмная полоса.
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        {/* Обёртка поднимает шторку над клавиатурой одним transform (см. .kb-lift
            в index.css). Раньше здесь менялся bottom — это пересчёт раскладки на
            каждый кадр выезда клавиатуры, то есть ровно тот рывок, от которого
            уходим. pointer-events-none, чтобы обёртка не перехватывала касания
            по затемнению. */}
        <div className="kb-lift pointer-events-none fixed inset-0 z-50">
          <Drawer.Content
            onOpenAutoFocus={focusFirstField}
            style={{
              // Выше шапки Telegram не поднимаемся; 12px — воздух, чтобы верхний
              // край не прилипал вплотную.
              maxHeight: 'calc(var(--app-vh, 100dvh) - var(--tg-top, 0px) - 12px)',
            }}
            className={cn(
              PANEL,
              'pointer-events-auto fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-[520px] flex-col',
              'rounded-t-[26px] border-t',
            )}
          >
            {/* Полоска-ручка: показывает, что шторку можно потянуть, и служит
                удобной областью захвата для жеста закрытия. */}
            <div className="sheet-handle mx-auto mt-3 h-1.5 w-10 flex-none rounded-full bg-line/25" />

            {/* Шапка закреплена: не уезжает вместе с содержимым. */}
            {bare ? (
              <Drawer.Title className="sr-only">{title}</Drawer.Title>
            ) : (
              <div className="sheet-head flex flex-none items-center justify-between px-5 pb-3 pt-4">
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

            {/* Прокручивается только середина. min-h-0 обязателен: без него
                flex-элемент не даёт себя сжать, и прокрутка не появляется вовсе —
                содержимое просто вылезает за пределы шторки. */}
            <div
              data-scroll-area
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5',
                bare && 'pt-4',
                footer ? 'pb-2' : 'pb-[max(20px,env(safe-area-inset-bottom))]',
              )}
            >
              {children}
            </div>

            {footer && (
              <div className="flex-none border-t border-line/10 px-5 pb-[max(16px,calc(env(safe-area-inset-bottom)+var(--tg-bottom,0px)))] pt-3">
                {footer}
              </div>
            )}
          </Drawer.Content>
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ---------- ПК: модальное окно по центру ----------

function DesktopModal({ open, onOpenChange, title, bare, footer, children }: AdaptiveDialogProps) {
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
            <Dialog.Content asChild forceMount onOpenAutoFocus={focusFirstField}>
              <m.div
                style={{ maxHeight: 'calc(var(--app-vh, 100dvh) - 4rem)' }}
                className={cn(
                  PANEL,
                  // 100dvw вместо 100vw: при видимой полосе прокрутки vw шире
                  // окна, и окно вылезало за правый край.
                  'fixed left-1/2 top-1/2 z-50 flex w-[min(520px,calc(100dvw-2rem))] flex-col',
                  'overflow-hidden rounded-3xl border',
                )}
                initial={{ opacity: 0, scale: 0.97, x: '-50%', y: '-48%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.97, x: '-50%', y: '-48%' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
              >
                {bare ? (
                  <Dialog.Title className="sr-only">{title}</Dialog.Title>
                ) : (
                  <div className="flex flex-none items-center justify-between px-5 pb-3 pt-5">
                    <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
                    <CloseButton />
                  </div>
                )}
                <div
                  data-scroll-area
                  className={cn('min-h-0 flex-1 overflow-y-auto px-5', bare && 'pt-5', footer ? 'pb-3' : 'pb-5')}
                >
                  {children}
                </div>
                {footer && <div className="flex-none border-t border-line/10 px-5 pb-5 pt-3">{footer}</div>}
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
