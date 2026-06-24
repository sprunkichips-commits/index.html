import * as React from 'react'
import { cn } from '@/lib/utils'

/** Стеклянная карточка (glassmorphism). hover-подъём — только на устройствах с мышью. */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }
>(({ className, hover, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'glass rounded-3xl shadow-glass transition-[transform,box-shadow]',
      hover && '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-lift',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'
