const NF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** Сумма с разделением разрядов и знаком валюты: 12 345 ₽ */
export function rub(n: number): string {
  return NF.format(Math.round(n || 0)) + ' ₽'
}

/** Сумма со знаком: +12 345 ₽ / −12 345 ₽ */
export function rubS(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + NF.format(Math.abs(Math.round(n || 0))) + ' ₽'
}

/** Один знак после запятой без хвостового нуля, RU-запятая: 4.5 → «4,5», 9 → «9» */
function trim1(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',')
}

/**
 * Компактный формат для осей графиков: 120к / 16,5к / 1,2М.
 * Один знак после запятой — иначе тики вроде 4500/13500 округлялись до 5к/14к и
 * шкала выглядела «съехавшей» (неравные подписи при равных шагах).
 */
export function fmtCompact(n: number): string {
  n = Math.round(n || 0)
  const a = Math.abs(n)
  if (a >= 1e6) return trim1(n / 1e6) + 'М'
  if (a >= 1e3) return trim1(n / 1e3) + 'к'
  return String(n)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Группировка вводимой суммы по разрядам (для полей ввода) */
export function grp(s: string): string {
  const d = (s || '').replace(/\D/g, '')
  return d ? Number(d).toLocaleString('ru-RU') : ''
}
