import {
  Home, ShoppingCart, UtensilsCrossed, Bus, Wifi, CreditCard, Cpu, Wrench,
  Megaphone, HeartPulse, GraduationCap, Gamepad2, Gift, Shirt, Landmark, MoreHorizontal,
  Clapperboard, Briefcase, Users, Wallet, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { cc } from '@/lib/data'
import { cn } from '@/lib/utils'

const ICON: Record<string, LucideIcon> = {
  // расходные
  'Жильё': Home,
  'Продукты': ShoppingCart,
  'Кафе и рестораны': UtensilsCrossed,
  'Транспорт': Bus,
  'Интернет и связь': Wifi,
  'Подписки и сервисы': CreditCard,
  'Оборудование': Cpu,
  'Софт и инструменты': Wrench,
  'Реклама и продвижение': Megaphone,
  'Здоровье': HeartPulse,
  'Образование': GraduationCap,
  'Развлечения': Gamepad2,
  'Подарки': Gift,
  'Одежда': Shirt,
  'Налоги': Landmark,
  'Прочие расходы': MoreHorizontal,
  // доходные
  'YouTube': Clapperboard,
  'Реклама': Megaphone,
  'Офлайн-работа': Briefcase,
  'Близкие': Users,
  'Прочий доход': Wallet,
}

export function categoryIcon(category: string): LucideIcon {
  return ICON[category] || Wallet
}

export function CategoryIcon({
  category,
  income,
  size = 18,
  box = 'h-10 w-10',
}: {
  category: string
  income?: boolean
  size?: number
  box?: string
}) {
  const Icon = income ? TrendingUp : categoryIcon(category)
  if (income) {
    return (
      <span className={cn('grid place-items-center rounded-2xl flex-none bg-pos/15 text-pos', box)}>
        <Icon size={size} />
      </span>
    )
  }
  const color = cc(category)
  return (
    <span
      className={cn('grid place-items-center rounded-2xl flex-none', box)}
      style={{ background: color + '22', color }}
    >
      <Icon size={size} />
    </span>
  )
}
