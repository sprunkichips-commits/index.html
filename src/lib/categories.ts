// ===== Иерархия категорий: Категория → Подкатегория + чистая агрегация =====
// Слой данных (model). Верхний уровень категории — это стабильный ключ
// Tx.category (напр. 'Продукты'), он же Category.id: так сохраняется обратная
// совместимость со всеми старыми записями и хранилищем. Подкатегория —
// НОВОЕ необязательное поле Tx.subCategory, привязанное к SubCategory.id.
import { type Tx, catLabel, cc } from './data'

export interface Category {
  id: string // = Tx.category (стабильный ключ, напр. 'Продукты')
  name: string // отображаемое имя, напр. 'Groceries'
  color: string // hex для иконки/прогресс-бара
}

export interface SubCategory {
  id: string // стабильный id, напр. 'groc-meat'
  parentId: string // ссылка на Category.id
  name: string // отображаемое имя, напр. 'Meat'
}

// Реестр подкатегорий. Иконка верхней категории берётся из categoryIcon()
// (Lucide-компонент) — единый источник, поэтому строкой её здесь не дублируем.
export const SUBCATEGORIES: SubCategory[] = [
  { id: 'groc-meat', parentId: 'Продукты', name: 'Meat' },
  { id: 'groc-water', parentId: 'Продукты', name: 'Water & drinks' },
  { id: 'groc-veg', parentId: 'Продукты', name: 'Vegetables & fruit' },
  { id: 'groc-snacks', parentId: 'Продукты', name: 'Snacks' },
]

// Бакет для операций родительской категории без выбранной подкатегории.
export const SUB_NONE = ''
const SUB_NONE_LABEL = 'Other / unsorted'

const SUB_BY_ID: Record<string, SubCategory> = Object.fromEntries(SUBCATEGORIES.map((s) => [s.id, s]))

/** Категория как типизированный объект (имя и цвет — из общих справочников). */
export function getCategory(id: string): Category {
  return { id, name: catLabel(id), color: cc(id) }
}

/** Подкатегории конкретной родительской категории (пустой массив — если нет). */
export function subCategoriesOf(parentId: string): SubCategory[] {
  return SUBCATEGORIES.filter((s) => s.parentId === parentId)
}

/** Есть ли у категории детализация по подкатегориям. */
export function hasSubCategories(parentId: string): boolean {
  return SUBCATEGORIES.some((s) => s.parentId === parentId)
}

/** Отображаемое имя подкатегории по её id ('' → «Other / unsorted»). */
export function subCategoryLabel(id: string): string {
  return id === SUB_NONE ? SUB_NONE_LABEL : SUB_BY_ID[id]?.name || id
}

// ---------- Бизнес-логика: чистые агрегаторы (reduce) ----------

export interface CategoryStat {
  categoryId: string
  total: number
}

/**
 * Сумма по каждой categoryId. Подкатегории (Meat, Water) сворачиваются в общий
 * пул родителя (Groceries), т.к. они лишь уточняют одну и ту же Tx.category.
 * Чистая функция: тип операций не фильтрует — это делает вызывающий код.
 */
export function getTopLevelStats(txs: Tx[]): CategoryStat[] {
  const byId = txs.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount
    return acc
  }, {})
  return Object.entries(byId)
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
}

export interface SubCategoryStat {
  id: string
  name: string
  total: number
  percent: number // доля от суммы родительской категории, 0…100
}

export interface SubCategoryBreakdown {
  parentId: string
  total: number // общая сумма трат родителя (== сумма всех подкатегорий)
  items: SubCategoryStat[] // отсортированы по убыванию суммы
}

/**
 * Детализация одной родительской категории: общая сумма и разбивка по
 * подкатегориям с процентом от неё (напр. Meat — 40%, Water — 10%).
 * Композиция поверх getTopLevelStats — обе функции чистые.
 */
export function getSubCategoryStats(txs: Tx[], parentCategoryId: string): SubCategoryBreakdown {
  const total = getTopLevelStats(txs).find((s) => s.categoryId === parentCategoryId)?.total ?? 0

  const bySub = txs.reduce<Record<string, number>>((acc, t) => {
    if (t.category !== parentCategoryId) return acc
    const key = t.subCategory || SUB_NONE
    acc[key] = (acc[key] || 0) + t.amount
    return acc
  }, {})

  const items: SubCategoryStat[] = Object.entries(bySub)
    .map(([id, sum]) => ({
      id,
      name: subCategoryLabel(id),
      total: sum,
      percent: total > 0 ? Math.round((sum / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return { parentId: parentCategoryId, total, items }
}
