// ===== Агрегация доходов/расходов с зачётом «транзита» =====
// Транзит (is_transit) — деньги, которые проходят «насквозь»: тебе дали 5000,
// 2700 ты передал дальше, 2300 оставил себе. Обе операции записываются ради
// корректного баланса кошелька, НО в разбивке по категориям и в итогах дохода
// они не должны раздувать суммы — учитывается только чистый остаток (2300).
//
// Ключевое свойство: чистый итог за период (доход − расход) сохраняется в
// точности при любом зачёте, поэтому баланс кошелька никогда не «плывёт».
import { type Tx } from './data'
import { toCents } from './format'

/** Пропорционально разносит сумму delta по элементам (последнему — остаток,
 *  чтобы копейки при делении не терялись и сумма совпала ровно). */
function distribute(byCat: Record<string, number>, parts: { c: string; a: number }[], delta: number, base: number) {
  let done = 0
  parts.forEach((p, i) => {
    const share = i === parts.length - 1 ? toCents(delta - done) : toCents(delta * (p.a / base))
    done = toCents(done + share)
    byCat[p.c] = toCents((byCat[p.c] || 0) + share)
  })
}

/** Итог прихода/расхода за период с зачётом транзита. Транзит сворачивается в
 *  чистую разницу: net>0 → добавляется к доходу, net<0 → к расходу. */
export function periodTotals(txs: Tx[]): { income: number; expense: number } {
  let income = 0
  let expense = 0
  let tIn = 0
  let tEx = 0
  for (const t of txs) {
    const inc = t.type === 'Доход'
    if (t.transit) inc ? (tIn += t.amount) : (tEx += t.amount)
    else inc ? (income += t.amount) : (expense += t.amount)
  }
  const net = tIn - tEx
  return {
    income: toCents(income + Math.max(0, net)),
    expense: toCents(expense + Math.max(0, -net)),
  }
}

/**
 * Доходы по категориям для виджета «Income sources». Обычные доходы группируются
 * как есть; транзит сворачивается в чистый остаток (Σприход − Σрасход) и
 * прибавляется к категории(ям) транзитного дохода — т.е. в «Family»/«Other
 * income», как их пометил пользователь, а не всей суммой в 5000.
 */
export function getIncomeSources(txs: Tx[]): Record<string, number> {
  const byCat: Record<string, number> = {}
  const transitInc: { c: string; a: number }[] = []
  let tIn = 0
  let tEx = 0
  for (const t of txs) {
    if (t.type === 'Доход') {
      if (t.transit) {
        transitInc.push({ c: t.category, a: t.amount })
        tIn += t.amount
      } else {
        byCat[t.category] = toCents((byCat[t.category] || 0) + t.amount)
      }
    } else if (t.transit) {
      tEx += t.amount
    }
  }
  const net = toCents(tIn - tEx)
  if (net > 0 && tIn > 0) distribute(byCat, transitInc, net, tIn)
  return byCat
}

/**
 * Расходы по категориям для «Where money goes». Транзитный расход (передача
 * денег дальше) исключается — это не твоя трата. Если транзитом ушло больше,
 * чем пришло, разница — реальная трата и разносится по категориям транзитного
 * расхода (симметрично доходам).
 */
export function getExpenseSources(txs: Tx[]): Record<string, number> {
  const byCat: Record<string, number> = {}
  const transitExp: { c: string; a: number }[] = []
  let tIn = 0
  let tEx = 0
  for (const t of txs) {
    if (t.type === 'Расход') {
      if (t.transit) {
        transitExp.push({ c: t.category, a: t.amount })
        tEx += t.amount
      } else {
        byCat[t.category] = toCents((byCat[t.category] || 0) + t.amount)
      }
    } else if (t.transit) {
      tIn += t.amount
    }
  }
  const overspend = toCents(tEx - tIn)
  if (overspend > 0 && tEx > 0) distribute(byCat, transitExp, overspend, tEx)
  return byCat
}

/**
 * Итоги прихода/расхода по произвольным «корзинам» (день/неделя/месяц/год) с
 * зачётом транзита внутри каждой корзины. keyOf возвращает ключ корзины или null
 * (операцию пропустить). Используется столбчатыми графиками статистики.
 */
export function bucketTotals<K extends string | number>(
  txs: Tx[],
  keyOf: (t: Tx) => K | null,
): Map<K, { income: number; expense: number }> {
  const raw = new Map<K, { i: number; e: number; ti: number; te: number }>()
  for (const t of txs) {
    const k = keyOf(t)
    if (k == null) continue
    let b = raw.get(k)
    if (!b) {
      b = { i: 0, e: 0, ti: 0, te: 0 }
      raw.set(k, b)
    }
    const inc = t.type === 'Доход'
    if (t.transit) inc ? (b.ti += t.amount) : (b.te += t.amount)
    else inc ? (b.i += t.amount) : (b.e += t.amount)
  }
  const out = new Map<K, { income: number; expense: number }>()
  for (const [k, b] of raw) {
    const net = b.ti - b.te
    out.set(k, { income: toCents(b.i + Math.max(0, net)), expense: toCents(b.e + Math.max(0, -net)) })
  }
  return out
}
