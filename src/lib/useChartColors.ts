import { useMemo } from 'react'

export interface ChartColors {
  accent: string
  muted: string
  pos: string
  neg: string
  sub: string
  faint: string
  grid: string
}

/** Читает CSS-переменные темы в конкретные цветовые строки для Recharts (SVG fill не понимает var()). */
export function useChartColors(themeKey: string): ChartColors {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    const v = (n: string) => `hsl(${cs.getPropertyValue(n).trim()})`
    const va = (n: string, a: number) => `hsl(${cs.getPropertyValue(n).trim()} / ${a})`
    return {
      accent: v('--accent'),
      muted: va('--line', 0.22),
      pos: v('--pos'),
      neg: v('--neg'),
      sub: v('--sub'),
      faint: v('--faint'),
      grid: va('--line', 0.1),
    }
    // themeKey в зависимостях — пересчёт при смене темы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey])
}
