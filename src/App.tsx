import { useEffect, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, m } from 'framer-motion'
import { Loader2, Plus, Settings, ShieldAlert } from 'lucide-react'
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
import { LoginScreen } from './components/LoginScreen'
import { api, hasInitData } from './lib/api'
import { Button } from './components/ui/button'
import { Dashboard } from './screens/Dashboard'
import { Transactions } from './screens/Transactions'
import { Stats } from './screens/Stats'
import { Goals } from './screens/Goals'
import type { Tx, TxType } from './lib/data'

// Мягкий клиентский UX-замок (не авторизация) — см. lib/telegram.ts
const blocked = !!(OWNER_ID && tgUser && tgUser.id !== OWNER_ID)

const loadMotionFeatures = () => import('./lib/motion-features').then((mod) => mod.default)

export default function App() {
  if (blocked) return <Blocked />
  return (
    // reducedMotion="user": если в системе включено «уменьшить движение»,
    // framer-motion сам выключает перемещения во всём дереве. Отдельные
    // компоненты дополнительно спрашивают useReducedMotion там, где вместо
    // движения нужен другой вид перехода, а не его отсутствие.
    // LazyMotion + m.*: в основную сборку попадают только лёгкие компоненты, а
    // движок анимаций подгружается отдельным файлом после первого экрана.
    // strict запрещает случайно использовать тяжёлый motion.* — иначе весь
    // движок вернулся бы в стартовую загрузку и смысл разделения пропал.
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <StoreProvider>
          <GoalsProvider>
            <Shell />
          </GoalsProvider>
        </StoreProvider>
      </MotionConfig>
    </LazyMotion>
  )
}

function Shell() {
  const { tab, auth } = useStore()
  // Имя бота нужно только для кнопки входа на сайте — тянем лениво.
  const [botName, setBotName] = useState('')
  useEffect(() => {
    if (auth === 'anon' && !hasInitData()) {
      api.config().then((c) => setBotName(c.botUsername)).catch(() => setBotName(''))
    }
  }, [auth])

  // ВАЖНО: все хуки объявлены до ранних return'ов. Иначе при переходе
  // checking → authed их количество между отрисовками меняется, React падает
  // (ошибка #310) и вместо приложения остаётся пустой экран.
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

  // Пока выясняем, авторизованы ли мы, показываем загрузку — а не пустой экран
  // с «Guest» и нулями, который выглядел как «данные пропали».
  if (auth === 'checking') {
    return (
      <>
        <div className="app-bg" />
        <div className="grid min-h-full place-items-center">
          <div className="flex flex-col items-center gap-3 text-sub">
            <Loader2 size={26} className="animate-spin text-accent" />
            <span className="text-[13px]">Loading your data…</span>
          </div>
        </div>
      </>
    )
  }

  // В браузере без входа — экран входа через Telegram.
  if (auth === 'anon' && !hasInitData()) return <LoginScreen botName={botName} />

  return (
    <>
      <div className="app-bg" />
      {/* Раскладка: боковое меню прижато к левому краю, контент центрируется в
          оставшемся пространстве и ограничен по ширине для читаемости. Раньше
          вся оболочка была колонкой 1180px по центру — на широком экране
          (полноэкранный режим на ПК) по краям оставались огромные пустые поля. */}
      <div className="flex min-h-full w-full">
        <Sidebar onSettings={openSettings} />
        <main className="tg-safe-top mx-auto min-w-0 flex-1 px-4 pb-28 pt-5 lg:max-w-[1100px] lg:px-8 lg:pb-10 lg:pt-7">
          <DataGuardBanner />
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

          {/* Смена вкладки: старый экран уходит, новый приезжает снизу.
              mode="wait" — чтобы два экрана не накладывались друг на друга и
              страница не прыгала по высоте во время перехода. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            >
              {tab === 'dash' && <Dashboard openAdd={openAdd} openProfile={openProfile} openDetail={openDetail} />}
              {tab === 'tx' && <Transactions openAdd={openAdd} openDetail={openDetail} />}
              {tab === 'stats' && <Stats />}
              {tab === 'goals' && <Goals />}
            </m.div>
          </AnimatePresence>
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

/**
 * Предупреждение предохранителя. Показывается вверху и не исчезает само:
 * речь о риске потери истории операций, такое нельзя прятать в тост,
 * который пропадает через две секунды.
 */
function DataGuardBanner() {
  const { dataGuard } = useStore()
  if (!dataGuard) return null
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-2xl border border-neg/40 bg-neg/10 px-4 py-3 text-[13px] leading-relaxed text-ink"
    >
      <ShieldAlert size={18} className="mt-0.5 flex-none text-neg" />
      <span>
        <b className="text-neg">Saving paused</b>
        <br />
        {dataGuard}
      </span>
    </div>
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
