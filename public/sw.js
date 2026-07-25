/* Service worker: даёт приложению открываться без сети.
 *
 * Без него офлайн невозможен в принципе — сами файлы приложения грузятся из
 * интернета, и без связи браузер показывает страницу «нет подключения».
 *
 * Стратегии:
 *  - страница (навигация): сначала сеть, при неудаче — сохранённая копия.
 *    Так онлайн всегда открывается свежая версия, а офлайн — последняя рабочая.
 *  - файлы сборки (/assets/*): сначала кэш. Их имена содержат хэш содержимого,
 *    поэтому старый файл никогда не «подменит» новый — при обновлении меняется имя.
 *  - запросы к API (/api/*): только сеть, никакого кэша. Деньги должны быть
 *    настоящими, а не показанными из устаревшего ответа.
 */
const CACHE = 'dengi-v1'
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // данные — всегда из сети

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(SHELL, copy))
          return res
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        }),
    ),
  )
})
