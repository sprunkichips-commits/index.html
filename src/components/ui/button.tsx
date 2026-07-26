import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { m, useReducedMotion } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// active:scale в CSS больше нет: масштабом управляет framer-motion, иначе два
// преобразования боролись бы за одно и то же свойство transform.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold transition-[background,filter,border-color] disabled:opacity-50 disabled:pointer-events-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
  {
    variants: {
      variant: {
        accent: 'bg-accent text-accent-ink shadow-fab hover:brightness-110',
        soft: 'bg-line/[0.06] text-ink border border-line/10 hover:bg-line/[0.11]',
        ghost: 'text-sub hover:bg-line/[0.07] hover:text-ink',
        outline: 'border border-line/15 text-ink hover:bg-line/[0.06]',
        danger: 'bg-neg/15 text-neg hover:bg-neg/25',
        ink: 'bg-ink text-bg hover:brightness-110',
      },
      size: {
        md: 'h-11 px-4 text-sm',
        sm: 'h-11 px-3 text-[13px]',
        lg: 'h-12 px-5 text-sm',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'accent', size: 'md' },
  },
)

/**
 * Обработчики перетаскивания и CSS-анимаций исключены: у React и framer-motion
 * они описаны несовместимо (DragEvent против PanInfo). Кнопке они не нужны, а
 * молчаливое приведение типов спрятало бы настоящую ошибку в вызывающем коде.
 */
type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
>

export interface ButtonProps extends NativeButtonProps, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

/** Пружина отклика: короткая и жёсткая, иначе кнопка «залипает» под пальцем. */
const TAP_SPRING = { type: 'spring' as const, stiffness: 600, damping: 30, mass: 0.5 }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Уважаем системную настройку «уменьшить анимацию»: у части людей движение
    // интерфейса вызывает укачивание, и ОС об этом сообщает.
    const still = useReducedMotion()

    // asChild нужен, когда кнопкой оформляют ссылку или другой элемент —
    // тогда анимацию не навязываем, разметку задаёт вызывающий.
    if (asChild) {
      return <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    }

    return (
      <m.button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        // Неактивная кнопка не должна отзываться на нажатие — иначе интерфейс
        // обещает действие, которого не будет.
        whileHover={still || props.disabled ? undefined : { scale: 1.02 }}
        whileTap={still || props.disabled ? undefined : { scale: 0.95 }}
        transition={TAP_SPRING}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
