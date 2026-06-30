const NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Сумма с разделением разрядов и знаком валюты: 12 345 ₽ */
export function rub(n: number): string {
  return NF.format(Math.round(n || 0)) + ' ₽'
}

/** Сумма со знаком: +12 345 ₽ / −12 345 ₽ */
export function rubS(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + NF.format(Math.abs(Math.round(n || 0))) + ' ₽'
}

/** Один знак после запятой без хвостового нуля: 4.5 → «4.5», 9 → «9» */
function trim1(v: number): string {
  return (Math.round(v * 10) / 10).toString()
}

/**
 * Компактный формат для осей графиков: 120k / 16.5k / 1.2M.
 * Один знак после точки — иначе тики вроде 4500/13500 округлялись до 5k/14k и
 * шкала выглядела «съехавшей» (неравные подписи при равных шагах).
 */
export function fmtCompact(n: number): string {
  n = Math.round(n || 0)
  const a = Math.abs(n)
  if (a >= 1e6) return trim1(n / 1e6) + 'M'
  if (a >= 1e3) return trim1(n / 1e3) + 'k'
  return String(n)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const DT_DATE = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
const DT_DATETIME = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Дата операции по строке YYYY-MM-DD: «June 29, 2026» */
export function fmtDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return isNaN(d.getTime()) ? dateStr : DT_DATE.format(d)
}

/** Дата и время по epoch-ms: «June 29, 2026, 02:32 PM» */
export function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  return isNaN(d.getTime()) ? '—' : DT_DATETIME.format(d)
}

/** Группировка вводимой суммы по разрядам (для полей ввода) */
export function grp(s: string): string {
  const d = (s || '').replace(/\D/g, '')
  return d ? Number(d).toLocaleString('en-US') : ''
}
