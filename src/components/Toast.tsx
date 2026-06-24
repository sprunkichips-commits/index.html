import { useStore } from '@/store/StoreContext'

export function Toast() {
  const { notice } = useStore()
  if (!notice) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 lg:bottom-8">
      <div className="glass animate-fade-in rounded-2xl border-line/12 px-4 py-2.5 text-[13px] font-semibold text-ink shadow-lift">
        {notice}
      </div>
    </div>
  )
}
