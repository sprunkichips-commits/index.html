import { useEffect, useState } from 'react'
import { hasInitData } from '@/lib/api'

/**
 * Подписка на CSS media query. Значение известно уже при первом рендере —
 * иначе интерфейс на мгновение показывал бы «десктопный» вариант и только
 * потом переключался на мобильный, а такой скачок особенно заметен внутри
 * Telegram, где приложение открывается поверх чата.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    setMatches(mql.matches) // query мог измениться между рендерами
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Порог «мобильный интерфейс». Совпадает с брейкпоинтом sm в Tailwind. */
export const MOBILE_QUERY = '(max-width: 768px)'

/**
 * Показывать мобильный вариант интерфейса? Внутри Telegram — всегда, даже на
 * широком экране в десктопном клиенте: там приложение живёт в узком окне,
 * которое пользователь не может ни развернуть, ни перетащить, и шторка снизу
 * ведёт себя предсказуемее модалки по центру.
 */
export function useIsMobileUi(): boolean {
  const narrow = useMediaQuery(MOBILE_QUERY)
  const coarse = useMediaQuery('(pointer: coarse)')
  // hasInitData() истинно только когда приложение открыто из Telegram —
  // на сайте в браузере подпись не приходит, поэтому там решает ширина экрана.
  return hasInitData() || narrow || coarse
}
