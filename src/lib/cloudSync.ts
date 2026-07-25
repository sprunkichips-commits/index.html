// ===== Мост между форматом облака и форматом приложения =====
// В базе категории — латинские id ('groceries'), в приложении — исторические
// ключи ('Продукты'), на которых завязаны иконки, цвета и подписи. Меняем
// формат данных, а не весь интерфейс: перевод идёт в обе стороны.

import type { ApiTransaction, NewTransaction } from './api'
import type { Tx, TxType } from './data'

/** Ключ приложения -> id в облаке. */
export const TO_CLOUD: Record<string, string> = {
  YouTube: 'youtube',
  Реклама: 'ads',
  'Офлайн-работа': 'day-job',
  Близкие: 'family',
  'Прочий доход': 'other-income',
  Жильё: 'housing',
  Продукты: 'groceries',
  'Кафе и рестораны': 'dining',
  Транспорт: 'transport',
  'Интернет и связь': 'internet',
  'Подписки и сервисы': 'subscriptions',
  Оборудование: 'equipment',
  'Софт и инструменты': 'software',
  'Реклама и продвижение': 'promo',
  Здоровье: 'health',
  Образование: 'education',
  Развлечения: 'entertainment',
  Подарки: 'gifts',
  Одежда: 'clothing',
  Налоги: 'taxes',
  'Прочие расходы': 'other-expense',
}

/** id в облаке -> ключ приложения (обратный словарь, строится один раз). */
export const FROM_CLOUD: Record<string, string> = Object.fromEntries(
  Object.entries(TO_CLOUD).map(([local, cloud]) => [cloud, local]),
)

/** Операция из облака -> операция в формате приложения. */
export function toLocalTx(t: ApiTransaction): Tx {
  const type: TxType = t.type === 'income' ? 'Доход' : 'Расход'
  const category = FROM_CLOUD[t.categoryId] ?? (type === 'Доход' ? 'Прочий доход' : 'Прочие расходы')
  return {
    id: t.id,
    date: t.date,
    type,
    category,
    ...(t.subCategoryId ? { subCategory: t.subCategoryId } : {}),
    ...(t.transit ? { transit: true } : {}),
    ...(t.payer ? { payer: t.payer } : {}),
    // amountCents — источник истины: целые копейки не «плывут» при делении.
    amount: Math.round(t.amountCents) / 100,
    note: t.note ?? '',
    createdAt: t.createdAt,
  }
}

/** Новая операция приложения -> тело запроса к облаку. */
export function toCloudPayload(input: {
  type: TxType
  amount: number
  category: string
  subCategory?: string
  transit?: boolean
  payer?: string
  date: string
  note: string
}): NewTransaction {
  const type = input.type === 'Доход' ? 'income' : 'expense'
  return {
    date: input.date,
    type,
    categoryId: TO_CLOUD[input.category] ?? (type === 'income' ? 'other-income' : 'other-expense'),
    subCategoryId: input.subCategory || null,
    amount: input.amount,
    transit: !!input.transit,
    payer: input.payer || undefined,
    note: input.note || undefined,
  }
}

/** Широкий период выгрузки: облако — источник правды за всю историю. */
export function fullRange(): { from: string; to: string } {
  const now = new Date()
  const from = `${now.getFullYear() - 5}-01-01`
  const to = `${now.getFullYear() + 1}-12-31`
  return { from, to }
}
