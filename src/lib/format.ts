const NF0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Округление до копеек (2 знака) с защитой от дрейфа float: 0.1+0.2 → 0.3. */
export function toCents(n: number): number {
  return Math.round((n || 0) * 100) / 100
}

/** Сумма с разрядами и ₽; копейки показываются, только если они есть: 12,345 ₽ / 100.50 ₽ */
export function rub(n: number): string {
  const c = toCents(n)
  return (c % 1 ? NF2 : NF0).format(c) + ' ₽'
}

/** Сумма со знаком: +12,345 ₽ / −100.50 ₽ */
export function rubS(n: number): string {
  const c = toCents(n)
  const a = Math.abs(c)
  return (c > 0 ? '+' : c < 0 ? '−' : '') + (a % 1 ? NF2 : NF0).format(a) + ' ₽'
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

/**
 * Ввод суммы с нативной decimal-клавиатуры: цифры + один разделитель (запятая
 * или точка) + до 2 знаков после него. Разряды группируются ПРОБЕЛАМИ (как все
 * суммы в приложении), поэтому запятая/точка всегда однозначно читается как
 * десятичный разделитель: «1500,5» → «1 500,5».
 */
export function grpAmount(raw: string): string {
  const s = (raw || '').replace(/[^\d.,]/g, '') // пробелы-разряды и мусор отпадают
  const sep = s.search(/[.,]/)
  const int = (sep >= 0 ? s.slice(0, sep) : s).replace(/\D/g, '').slice(0, 13)
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  if (sep < 0) return intFmt
  const frac = s.slice(sep + 1).replace(/\D/g, '').slice(0, 2)
  return (intFmt || '0') + ',' + frac
}

/** Число из строки grpAmount: «1 500,5» → 1500.5 (0 — если пусто/мусор). */
export function parseAmount(s: string): number {
  const m = (s || '').replace(/[^\d.,]/g, '').match(/^(\d*)(?:[.,](\d*))?/)
  if (!m || (!m[1] && !m[2])) return 0
  const v = Number(m[1] || 0) + Number('0.' + (m[2] || 0))
  return isFinite(v) ? v : 0
}
