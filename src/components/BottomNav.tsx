import { Plus } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { NAV } from './navItems'
import { cn } from '@/lib/utils'

/** Нижняя навигация (моб.): по 2 раздела по бокам + центральная приподнятая FAB. */
export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const { tab, setTab } = useStore()
  const left = NAV.slice(0, 2)
  const right = NAV.slice(2)

  const Item = (n: (typeof NAV)[number]) => {
    const active = tab === n.tab
    const Icon = n.icon
    return (
      <button
        key={n.tab}
        onClick={() => setTab(n.tab)}
        className={cn(
          'flex h-full min-h-[44px] flex-1 flex-col items-center justify-center gap-1 transition active:scale-95',
          active ? 'text-accent' : 'text-faint',
        )}
      >
        <Icon size={21} />
        <span className="text-[10px] font-medium">{n.label}</span>
      </button>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="glass relative mx-auto flex h-[64px] max-w-[560px] items-stretch border-t border-line/10">
        {left.map(Item)}
        <div className="flex w-16 flex-none items-start justify-center">
          <button
            onClick={onAdd}
            aria-label="Добавить операцию"
            className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-fab ring-4 ring-bg transition active:scale-95 [@media(hover:hover)]:hover:brightness-110"
          >
            <Plus size={26} />
          </button>
        </div>
        {right.map(Item)}
      </div>
    </nav>
  )
}
