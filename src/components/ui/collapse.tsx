import * as React from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'

/**
 * Плавное появление и исчезновение блока в потоке. Нужен для полей, которые
 * зависят от других: подкатегория появляется только у категорий с детализацией,
 * «от кого» — только у дохода. Без анимации форма скачет, и глаз теряет место,
 * на котором остановился.
 *
 * Анимируются ТОЛЬКО opacity и transform. Высоту не трогаем намеренно: её
 * анимация заставляет браузер пересчитывать раскладку каждый кадр, и на
 * телефоне это видно как рывок — ровно то, от чего уходим на экране ввода.
 */
export function Collapse({ show, children }: { show: boolean; children: React.ReactNode }) {
  const still = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={still ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}
