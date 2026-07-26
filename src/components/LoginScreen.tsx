import { useEffect, useRef } from 'react'
import { Wallet } from 'lucide-react'

/**
 * Экран входа для сайта (вне Telegram). Кнопку рисует официальный виджет
 * Telegram: он подгружается скриптом с telegram.org и открывает iframe с
 * oauth.telegram.org — поэтому в CSP нужен frame-src на этот домен.
 *
 * Секретов здесь нет: виджет знает только ИМЯ бота (оно публично), а подпись
 * проверяет сервер токеном, который лежит в секретах Cloudflare.
 */
export function LoginScreen({ botName }: { botName: string }) {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = holder.current
    if (!el || !botName) return
    el.innerHTML = ''
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://telegram.org/js/telegram-widget.js?22'
    s.setAttribute('data-telegram-login', botName)
    s.setAttribute('data-size', 'large')
    s.setAttribute('data-radius', '12')
    s.setAttribute('data-userpic', 'false')
    // Telegram сам отправит подписанные данные на этот адрес, а сервер
    // проверит подпись и выдаст cookie сессии.
    s.setAttribute('data-auth-url', `${location.origin}/api/auth/telegram`)
    s.setAttribute('data-request-access', 'write')
    el.appendChild(s)
  }, [botName])

  return (
    <>
      <div className="app-bg" />
      <div className="grid min-h-full place-items-center p-6">
        <div className="glass w-full max-w-sm rounded-3xl px-7 py-9 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-fab">
            <Wallet size={26} />
          </span>
          <div className="mt-4 text-lg font-bold">Money</div>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">
            Sign in with Telegram to see the same data as in the app. Your records live in the
            cloud and belong to your Telegram account.
          </p>

          <div ref={holder} className="mt-6 flex min-h-[48px] justify-center" />

          {!botName && (
            <p className="mt-3 text-xs text-neg">
              Sign-in is not configured: the bot username is missing on the server.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
