import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold transition-[background,transform,filter,border-color] active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  },
)
Button.displayName = 'Button'

export { buttonVariants }
