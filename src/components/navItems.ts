import { BarChart3, Briefcase, LayoutGrid, ReceiptText, Target, type LucideIcon } from 'lucide-react'
import type { Tab } from '@/store/StoreContext'

export const NAV: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'dash', label: 'Дашборд', icon: LayoutGrid },
  { tab: 'tx', label: 'Операции', icon: ReceiptText },
  { tab: 'stats', label: 'Статистика', icon: BarChart3 },
  { tab: 'inv', label: 'Инвестиции', icon: Briefcase },
  { tab: 'goals', label: 'Цели', icon: Target },
]
