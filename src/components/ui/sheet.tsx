import * as React from 'react'
import { AdaptiveDialog } from './adaptive-dialog'

/**
 * Прежний интерфейс листа-модалки, оставленный ради вызывающего кода: экраны
 * настроек, деталей операции, профиля и остальные используют именно его.
 * Поведение теперь задаёт AdaptiveDialog — шторка снизу на телефоне со свайпом
 * для закрытия, модальное окно по центру на ПК.
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
    <AdaptiveDialog open={open} onOpenChange={onOpenChange} title={title}>
      {children}
    </AdaptiveDialog>
  )
}
