import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-line/12 bg-line/[0.04] px-3 text-base text-ink outline-none',
        'placeholder:text-faint focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/25',
        'transition-[border-color,box-shadow]',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-xl border border-line/12 bg-line/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none',
      'placeholder:text-faint focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/25 resize-y',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
