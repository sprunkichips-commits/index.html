import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, User } from 'lucide-react'
import { Sheet } from './ui/sheet'
import { Button } from './ui/button'
import { useStore } from '@/store/StoreContext'
import { AVATAR_MAX, NAME_MAX } from '@/lib/data'

/**
 * Уменьшает выбранную картинку до квадрата ≤ max пикселей и возвращает data-URL
 * (JPEG). Делается локально на canvas — без сети. Так аватар компактно влезает в
 * localStorage и CloudStorage Telegram.
 */
function fileToAvatar(file: File, max = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Not an image'))
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('read'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode'))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const size = Math.max(1, Math.min(max, side))
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('ctx'))
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        } catch (e) {
          reject(e as Error)
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function ProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { profile, firstName, setProfile, toast } = useStore()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Подхватываем текущий профиль при каждом открытии.
  useEffect(() => {
    if (open) {
      setName(profile.name)
      setAvatar(profile.avatar)
      setBusy(false)
    }
  }, [open, profile.name, profile.avatar])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const url = await fileToAvatar(f)
      if (url.length > AVATAR_MAX) {
        toast('Image is too large')
      } else {
        setAvatar(url)
      }
    } catch {
      toast('Could not open the photo')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    setProfile({ name, avatar })
    toast('Profile saved')
    onOpenChange(false)
  }

  const initial = (name || firstName || 'U').trim().slice(0, 1).toUpperCase()

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Profile">
      <div className="mb-5 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Choose avatar"
          className="group relative h-24 w-24 overflow-hidden rounded-full border border-line/12 bg-accent/15 transition active:scale-95"
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-3xl font-bold text-accent">
              {initial}
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
            <Camera size={12} /> {busy ? '…' : 'Photo'}
          </span>
        </button>
        {avatar && (
          <button
            type="button"
            onClick={() => setAvatar('')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neg transition hover:opacity-80"
          >
            <Trash2 size={13} /> Remove photo
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

      <label className="mb-1.5 block text-xs font-medium text-sub">Nickname</label>
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-line/12 bg-line/[0.04] px-3">
        <User size={16} className="flex-none text-faint" />
        <input
          maxLength={NAME_MAX}
          placeholder={firstName || 'Your name'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full bg-transparent text-base text-ink outline-none placeholder:text-faint"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="accent" onClick={save}>
          Save
        </Button>
      </div>
    </Sheet>
  )
}
