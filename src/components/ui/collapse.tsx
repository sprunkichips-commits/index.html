import * as React from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'

/**
 * Плавное появление и исчезновение блока в потоке. Нужен для полей, которые
 * зависят от других: подкатегория появляется только у категорий с детализацией,
 * «от кого» — только у дохода. Без анимации форма скачет, и глаз теряет место,
 * на котором остановился.
 *
 * height: auto анимируется корректно только когда содержимое обрезано
 * (overflow-hidden), иначе оно вылезает за пределы во время движения.
 */
export function Collapse({ show, children }: { show: boolean; children: React.ReactNode }) {
  const still = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          className="overflow-hidden"
          initial={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={still ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}
