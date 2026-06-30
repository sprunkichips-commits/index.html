import { BarChart3, LayoutGrid, ReceiptText, Target, type LucideIcon } from 'lucide-react'
import type { Tab } from '@/store/StoreContext'

export const NAV: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'dash', label: 'Home', icon: LayoutGrid },
  { tab: 'tx', label: 'Transactions', icon: ReceiptText },
  { tab: 'stats', label: 'Stats', icon: BarChart3 },
  { tab: 'goals', label: 'Goals', icon: Target },
]
