// ===== Хук загрузки данных с сервера: loading / error / data =====
// Отменяет запрос при размонтировании и при смене параметров, поэтому поздний
// ответ старого запроса не перезапишет свежие данные (гонка при быстром
// переключении месяцев).

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export interface ApiResource<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Повторить запрос (например, по кнопке «Retry»). */
  reload: () => void
}

/**
 * @param fetcher функция запроса; получает AbortSignal
 * @param deps    зависимости — при их изменении запрос перезапускается
 */
export function useApiResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // fetcher меняется каждый рендер (стрелочная функция) — держим в ref,
  // чтобы перезапуск шёл строго по deps, а не на каждый рендер.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    setLoading(true)
    setError(null)

    fetcherRef
      .current(ctrl.signal)
      .then((res) => {
        if (!alive) return
        setData(res)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive || ctrl.signal.aborted) return
        setError(e instanceof ApiError ? e.message : 'Something went wrong')
        setLoading(false)
      })

    return () => {
      alive = false
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}
