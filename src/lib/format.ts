const NF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** Сумма с разделением разрядов и знаком валюты: 12 345 ₽ */
export function rub(n: number): string {
  return NF.format(Math.round(n || 0)) + ' ₽'
}

/** Сумма со знаком: +12 345 ₽ / −12 345 ₽ */
export function rubS(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + NF.format(Math.abs(Math.round(n || 0))) + ' ₽'
}

/** Компактный формат для осей графиков: 120к / 1.2М */
export function fmtCompact(n: number): string {
  n = Math.round(n || 0)
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toFixed(a % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'М'
  if (a >= 1e3) return Math.round(n / 1e3) + 'к'
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
