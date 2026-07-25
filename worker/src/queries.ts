// ===== SQL-агрегация статистики (считает D1, не клиент) =====
// Все суммы — в копейках (целые). Наружу отдаём и копейки, и рубли числом.
//
// Транзит: операции, помеченные transit=1, — это деньги «насквозь» (дали 5000,
// 2700 передал дальше, 2300 оставил). В статистике учитывается только чистый
// остаток, иначе источник дохода раздувается ложными 5000. Чистый остаток
// разносится по транзитным приходам пропорционально — прямо в SQL.

export interface Range {
  userId: number
  from: string // 'YYYY-MM-DD' включительно
  to: string // 'YYYY-MM-DD' включительно
}

export interface Totals {
  incomeCents: number
  expenseCents: number
  netCents: number
}

export interface CategoryStat {
  categoryId: string
  name: string
  color: string | null
  icon: string | null
  totalCents: number
  percent: number
}

export interface SubCategoryStat {
  subcategoryId: string | null
  name: string
  totalCents: number
  percent: number
}

/**
 * Итоги за период с зачётом транзита.
 * income  = обычный приход + max(0, транзит_приход − транзит_расход)
 * expense = обычный расход + max(0, транзит_расход − транзит_приход)
 * Чистый итог (income − expense) при этом сохраняется точно, поэтому баланс
 * кошелька не «плывёт».
 */
export async function getTotals(db: D1Database, r: Range): Promise<Totals> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='income'  AND transit=0 THEN amount_cents END), 0) AS inc,
         COALESCE(SUM(CASE WHEN type='expense' AND transit=0 THEN amount_cents END), 0) AS exp,
         COALESCE(SUM(CASE WHEN type='income'  AND transit=1 THEN amount_cents END), 0) AS t_in,
         COALESCE(SUM(CASE WHEN type='expense' AND transit=1 THEN amount_cents END), 0) AS t_out
       FROM transactions
       WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3`,
    )
    .bind(r.userId, r.from, r.to)
    .first<{ inc: number; exp: number; t_in: number; t_out: number }>()

  const inc = row?.inc ?? 0
  const exp = row?.exp ?? 0
  const tIn = row?.t_in ?? 0
  const tOut = row?.t_out ?? 0
  const net = tIn - tOut
  const incomeCents = inc + Math.max(0, net)
  const expenseCents = exp + Math.max(0, -net)
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents }
}

/**
 * Разбивка по категориям одного типа с зачётом транзита и процентами.
 * Подкатегории (Meat, Water) сворачиваются в общий пул родителя (Groceries),
 * т.к. группировка идёт по category_id.
 */
export async function getCategoryStats(
  db: D1Database,
  r: Range,
  type: 'income' | 'expense',
): Promise<CategoryStat[]> {
  // pool — транзитный пул за период; factor — какая доля транзитной суммы
  // реально «осела» у пользователя (для расходов — симметрично).
  const sql = `
    WITH pool AS (
      SELECT
        COALESCE(SUM(CASE WHEN transit=1 AND type='income'  THEN amount_cents END), 0) AS t_in,
        COALESCE(SUM(CASE WHEN transit=1 AND type='expense' THEN amount_cents END), 0) AS t_out
      FROM transactions
      WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3
    ),
    factor AS (
      SELECT CASE
        WHEN ?4 = 'income'
          THEN CASE WHEN (SELECT t_in  FROM pool) > 0
                    THEN MAX(0, (SELECT t_in FROM pool) - (SELECT t_out FROM pool)) * 1.0 / (SELECT t_in  FROM pool)
                    ELSE 0 END
          ELSE CASE WHEN (SELECT t_out FROM pool) > 0
                    THEN MAX(0, (SELECT t_out FROM pool) - (SELECT t_in FROM pool)) * 1.0 / (SELECT t_out FROM pool)
                    ELSE 0 END
      END AS f
    ),
    agg AS (
      SELECT
        t.category_id AS category_id,
        CAST(
          SUM(CASE WHEN t.transit = 0 THEN t.amount_cents ELSE 0 END)
          + SUM(CASE WHEN t.transit = 1 THEN t.amount_cents ELSE 0 END) * (SELECT f FROM factor)
          AS INTEGER
        ) AS total_cents
      FROM transactions t
      WHERE t.user_id = ?1 AND t.date BETWEEN ?2 AND ?3 AND t.type = ?4
      GROUP BY t.category_id
    )
    SELECT
      a.category_id AS categoryId,
      COALESCE(c.name, a.category_id) AS name,
      c.color AS color,
      c.icon  AS icon,
      a.total_cents AS totalCents,
      CASE WHEN (SELECT SUM(total_cents) FROM agg) > 0
           THEN ROUND(a.total_cents * 100.0 / (SELECT SUM(total_cents) FROM agg), 1)
           ELSE 0 END AS percent
    FROM agg a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.total_cents > 0
    ORDER BY a.total_cents DESC`

  const { results } = await db.prepare(sql).bind(r.userId, r.from, r.to, type).all<CategoryStat>()
  return results ?? []
}

/**
 * Детализация одной категории по подкатегориям: сумма и процент от общей суммы
 * родителя — всё считается в SQL. Операции без подкатегории попадают в бакет
 * «Other / unsorted» (subcategoryId = null).
 */
export async function getSubCategoryStats(
  db: D1Database,
  r: Range,
  categoryId: string,
): Promise<{ totalCents: number; items: SubCategoryStat[] }> {
  const sql = `
    WITH agg AS (
      SELECT
        t.subcategory_id AS sub_id,
        SUM(t.amount_cents) AS total_cents
      FROM transactions t
      WHERE t.user_id = ?1 AND t.date BETWEEN ?2 AND ?3
        AND t.category_id = ?4 AND t.transit = 0
      GROUP BY t.subcategory_id
    )
    SELECT
      a.sub_id AS subcategoryId,
      COALESCE(s.name, 'Other / unsorted') AS name,
      a.total_cents AS totalCents,
      CASE WHEN (SELECT SUM(total_cents) FROM agg) > 0
           THEN ROUND(a.total_cents * 100.0 / (SELECT SUM(total_cents) FROM agg), 1)
           ELSE 0 END AS percent
    FROM agg a
    LEFT JOIN subcategories s ON s.id = a.sub_id
    ORDER BY a.total_cents DESC`

  const { results } = await db.prepare(sql).bind(r.userId, r.from, r.to, categoryId).all<SubCategoryStat>()
  const items = results ?? []
  return { totalCents: items.reduce((s, i) => s + i.totalCents, 0), items }
}

/** Помесячные итоги за год — для столбчатого графика (транзит зачтён внутри месяца). */
export async function getMonthlyTotals(
  db: D1Database,
  userId: number,
  year: number,
): Promise<{ month: number; incomeCents: number; expenseCents: number }[]> {
  const sql = `
    SELECT
      CAST(strftime('%m', date) AS INTEGER) AS month,
      COALESCE(SUM(CASE WHEN type='income'  AND transit=0 THEN amount_cents END), 0) AS inc,
      COALESCE(SUM(CASE WHEN type='expense' AND transit=0 THEN amount_cents END), 0) AS exp,
      COALESCE(SUM(CASE WHEN type='income'  AND transit=1 THEN amount_cents END), 0) AS t_in,
      COALESCE(SUM(CASE WHEN type='expense' AND transit=1 THEN amount_cents END), 0) AS t_out
    FROM transactions
    WHERE user_id = ?1 AND strftime('%Y', date) = ?2
    GROUP BY month
    ORDER BY month`

  const { results } = await db
    .prepare(sql)
    .bind(userId, String(year))
    .all<{ month: number; inc: number; exp: number; t_in: number; t_out: number }>()

  return (results ?? []).map((row) => {
    const net = row.t_in - row.t_out
    return {
      month: row.month,
      incomeCents: row.inc + Math.max(0, net),
      expenseCents: row.exp + Math.max(0, -net),
    }
  })
}
