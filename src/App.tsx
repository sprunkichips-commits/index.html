import { useState } from 'react'
import { Plus, Settings } from 'lucide-react'
import { StoreProvider, useStore } from './store/StoreContext'
import { GoalsProvider } from './store/GoalsContext'
import { OWNER_ID, tgUser } from './lib/telegram'
import { Sidebar } from './components/Sidebar'
import { BottomNav } from './components/BottomNav'
import { MonthSelector } from './components/MonthSelector'
import { Toast } from './components/Toast'
import { AddSheet } from './components/AddSheet'
import { SettingsSheet } from './components/SettingsSheet'
import { ProfileSheet } from './components/ProfileSheet'
import { TxDetailSheet } from './components/TxDetailSheet'
import { Button } from './components/ui/button'
import { Dashboard } from './screens/Dashboard'
import { Transactions } from './screens/Transactions'
import { Stats } from './screens/Stats'
import { Goals } from './screens/Goals'
import type { Tx, TxType } from './lib/data'

// Мягкий клиентский UX-замок (не авторизация) — см. lib/telegram.ts
const blocked = !!(OWNER_ID && tgUser && tgUser.id !== OWNER_ID)

export default function App() {
  if (blocked) return <Blocked />
  return (
    <StoreProvider>
      <GoalsProvider>
        <Shell />
      </GoalsProvider>
    </StoreProvider>
  )
}

function Shell() {
  const { tab } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<TxType>('Расход')
  const [setOpen, setSetOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [detailTx, setDetailTx] = useState<Tx | null>(null)

  const openAdd = (type: TxType) => {
    setAddType(type)
    setAddOpen(true)
  }
  const openSettings = () => setSetOpen(true)
  const openProfile = () => setProfileOpen(true)
  const openDetail = (tx: Tx) => setDetailTx(tx)

  return (
    <>
      <div className="app-bg" />
      <div className="mx-auto flex min-h-full max-w-[1180px]">
        <Sidebar onSettings={openSettings} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-7">
          <header className="mb-5 flex items-center justify-between gap-2">
            {tab === 'goals' ? <div className="text-lg font-bold">Goals & habits</div> : <MonthSelector />}
            <div className="flex items-center gap-2">
              <Button className="hidden lg:inline-flex" onClick={() => openAdd('Расход')}>
                <Plus size={18} /> Add
              </Button>
              <button
                onClick={openSettings}
                aria-label="Settings"
                className="glass grid h-11 w-11 place-items-center rounded-2xl border-line/10 text-sub transition hover:text-ink active:scale-95 lg:hidden"
              >
                <Settings size={18} />
              </button>
            </div>
          </header>

          {tab === 'dash' && <Dashboard openAdd={openAdd} openProfile={openProfile} openDetail={openDetail} />}
          {tab === 'tx' && <Transactions openAdd={openAdd} openDetail={openDetail} />}
          {tab === 'stats' && <Stats />}
          {tab === 'goals' && <Goals />}
        </main>
      </div>

      <BottomNav onAdd={() => openAdd('Расход')} />
      <AddSheet open={addOpen} onOpenChange={setAddOpen} initialType={addType} />
      <SettingsSheet open={setOpen} onOpenChange={setSetOpen} />
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
      <TxDetailSheet tx={detailTx} onClose={() => setDetailTx(null)} />
      <Toast />
    </>
  )
}

function Blocked() {
  return (
    <>
      <div className="app-bg" />
      <div className="grid min-h-full place-items-center p-6 text-center">
        <div className="glass max-w-sm rounded-3xl px-8 py-10">
          <div className="text-lg font-semibold">This is a private app</div>
          <p className="mt-2 text-sm text-sub">Only the owner has access.</p>
        </div>
      </div>
    </>
  )
}
