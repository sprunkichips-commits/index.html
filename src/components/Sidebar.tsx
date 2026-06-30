import { Moon, Settings, Sun, Wallet } from 'lucide-react'
import { useStore } from '@/store/StoreContext'
import { NAV } from './navItems'
import { cn } from '@/lib/utils'

export function Sidebar({ onSettings }: { onSettings: () => void }) {
  const { tab, setTab, theme, toggleTheme } = useStore()
  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col border-r border-line/10 p-4 lg:flex">
      <div className="mb-7 flex items-center gap-3 px-2 pt-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-accent-ink shadow-fab">
          <Wallet size={18} />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">Money</div>
          <div className="text-[11px] text-faint">personal tracker</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = tab === n.tab
          const Icon = n.icon
          return (
            <button
              key={n.tab}
              onClick={() => setTab(n.tab)}
              className={cn(
                'relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
                active ? 'bg-accent/15 text-ink' : 'text-sub hover:bg-line/[0.06] hover:text-ink',
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
              )}
              <Icon size={19} className={active ? 'text-accent' : ''} />
              {n.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-sub transition hover:bg-line/[0.06] hover:text-ink"
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
        <button
          onClick={onSettings}
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-sub transition hover:bg-line/[0.06] hover:text-ink"
        >
          <Settings size={19} />
          Settings & backup
        </button>
      </div>
    </aside>
  )
}
