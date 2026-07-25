// ===== Перенос данных из старого формата (localStorage / CloudStorage) в D1 =====
// Принимает ровно тот JSON, который приложение отдаёт по кнопке
// «Settings → Download file», и раскладывает его по таблицам.
//
// Принципы:
//  - идемпотентность: повторный импорт того же файла не создаёт дублей
//    (INSERT OR IGNORE по стабильному id операции);
//  - ничего не удаляем: импорт только добавляет, старые данные в D1 остаются;
//  - строгая проверка: некорректная запись пропускается и попадает в отчёт,
//    а не роняет весь перенос.

/** Старые ключи категорий (русские) -> id в новой базе. */
const CATEGORY_MAP: Record<string, string> = {
  // доходы
  YouTube: 'youtube',
  Реклама: 'ads',
  'Офлайн-работа': 'day-job',
  Близкие: 'family',
  'Прочий доход': 'other-income',
  // расходы
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

/** Куда складывать операции с неизвестной категорией — чтобы деньги не пропали. */
const FALLBACK = { income: 'other-income', expense: 'other-expense' }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export interface ImportReport {
  transactions: { imported: number; skipped: number; duplicates: number }
  goals: { imported: number; skipped: number }
  tasks: { imported: number; skipped: number }
  taskLog: { imported: number }
  warnings: string[]
}

function toCents(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

/**
 * Переносит бэкап в D1 для конкретного пользователя.
 * userId берётся из проверенного initData, а не из файла — чужие данные
 * подсунуть нельзя.
 */
export async function importBackup(db: D1Database, userId: number, payload: unknown): Promise<ImportReport> {
  const report: ImportReport = {
    transactions: { imported: 0, skipped: 0, duplicates: 0 },
    goals: { imported: 0, skipped: 0 },
    tasks: { imported: 0, skipped: 0 },
    taskLog: { imported: 0 },
    warnings: [],
  }
  if (!payload || typeof payload !== 'object') {
    report.warnings.push('payload is not an object')
    return report
  }
  const data = payload as Record<string, unknown>

  // ---------- Какие категории и подкатегории реально есть в базе ----------
  const [catRows, subRows] = await Promise.all([
    db.prepare(`SELECT id, kind FROM categories`).all<{ id: string; kind: string }>(),
    db.prepare(`SELECT id, parent_id FROM subcategories`).all<{ id: string; parent_id: string }>(),
  ])
  const catKind = new Map((catRows.results ?? []).map((r) => [r.id, r.kind]))
  const subParent = new Map((subRows.results ?? []).map((r) => [r.id, r.parent_id]))

  // ---------- Операции ----------
  const txs = Array.isArray(data.transactions) ? (data.transactions as unknown[]) : []
  const stmts: D1PreparedStatement[] = []

  for (const raw of txs) {
    if (!raw || typeof raw !== 'object') {
      report.transactions.skipped++
      continue
    }
    const t = raw as Record<string, unknown>

    const date = String(t.date ?? '')
    if (!DATE_RE.test(date)) {
      report.transactions.skipped++
      continue
    }

    const type = t.type === 'Доход' || t.type === 'income' ? 'income' : 'expense'
    const cents = toCents(t.amount)
    if (cents == null) {
      report.transactions.skipped++
      continue
    }

    // Категория: маппинг старого ключа; если ключ уже новый — берём как есть.
    const rawCat = String(t.category ?? '')
    let categoryId = CATEGORY_MAP[rawCat] ?? (catKind.has(rawCat) ? rawCat : '')
    if (!categoryId || catKind.get(categoryId) !== type) {
      if (categoryId && catKind.get(categoryId) !== type) {
        report.warnings.push(`«${rawCat}» не подходит типу ${type} — перенесено в «прочее»`)
      } else if (rawCat) {
        report.warnings.push(`неизвестная категория «${rawCat}» — перенесена в «прочее»`)
      }
      categoryId = FALLBACK[type]
    }

    // Подкатегория принимается, только если принадлежит этой категории.
    const rawSub = t.subCategory ? String(t.subCategory) : ''
    const subCategoryId = rawSub && subParent.get(rawSub) === categoryId ? rawSub : null

    const id = typeof t.id === 'string' && ID_RE.test(t.id) ? t.id : crypto.randomUUID()
    const transit = t.transit === true || t.transit === 1 ? 1 : 0
    const payer = t.payer ? String(t.payer).slice(0, 60) : null
    const note = t.note ? String(t.note).slice(0, 140) : null
    const createdAt = Number(t.createdAt) > 0 ? Number(t.createdAt) : Date.now()

    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO transactions
             (id, user_id, date, type, category_id, subcategory_id, amount_cents, transit, payer, note, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(id, userId, date, type, categoryId, subCategoryId, cents, transit, payer, note, createdAt),
    )
  }

  if (stmts.length) {
    const results = await db.batch(stmts)
    for (const r of results) {
      // changes = 0 означает, что такая операция уже была (INSERT OR IGNORE).
      if (r.meta.changes > 0) report.transactions.imported++
      else report.transactions.duplicates++
    }
  }

  // ---------- Цели ----------
  const goalsBlock = (data.goals ?? {}) as Record<string, unknown>

  const goals = Array.isArray(goalsBlock.goals) ? (goalsBlock.goals as unknown[]) : []
  const goalStmts: D1PreparedStatement[] = []
  for (const raw of goals) {
    const g = raw as Record<string, unknown>
    const title = String(g?.title ?? '').trim().slice(0, 80)
    const target = String(g?.targetDate ?? '')
    if (!title || !DATE_RE.test(target)) {
      report.goals.skipped++
      continue
    }
    const id = typeof g.id === 'string' && ID_RE.test(g.id) ? g.id : crypto.randomUUID()
    goalStmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO goals (id, user_id, title, target_date, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(id, userId, title, target, Date.now()),
    )
  }
  if (goalStmts.length) {
    for (const r of await db.batch(goalStmts)) if (r.meta.changes > 0) report.goals.imported++
  }

  // ---------- Ежедневные задачи ----------
  const tasks = Array.isArray(goalsBlock.tasks) ? (goalsBlock.tasks as unknown[]) : []
  const taskStmts: D1PreparedStatement[] = []
  const knownTaskIds = new Set<string>()
  tasks.forEach((raw, i) => {
    const t = raw as Record<string, unknown>
    const title = String(t?.title ?? '').trim().slice(0, 80)
    const id = typeof t?.id === 'string' && ID_RE.test(t.id) ? t.id : ''
    if (!title || !id) {
      report.tasks.skipped++
      return
    }
    knownTaskIds.add(id)
    taskStmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO daily_tasks (id, user_id, title, sort_order, archived)
           VALUES (?1, ?2, ?3, ?4, 0)`,
        )
        .bind(id, userId, title, i),
    )
  })
  if (taskStmts.length) {
    for (const r of await db.batch(taskStmts)) if (r.meta.changes > 0) report.tasks.imported++
  }

  // ---------- Отметки выполнения по дням ----------
  const logs = (goalsBlock.logs ?? {}) as Record<string, unknown>
  const logStmts: D1PreparedStatement[] = []
  for (const [day, value] of Object.entries(logs)) {
    if (!DATE_RE.test(day) || !value || typeof value !== 'object') continue
    const entry = value as { done?: unknown; total?: unknown }
    const done = Array.isArray(entry.done) ? entry.done : []
    const total = Number(entry.total) >= 0 ? Math.round(Number(entry.total)) : done.length
    for (const taskId of done) {
      if (typeof taskId !== 'string' || !knownTaskIds.has(taskId)) continue
      logStmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO task_log (user_id, day, task_id, total_tasks)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(userId, day, taskId, total),
      )
    }
  }
  if (logStmts.length) {
    for (const r of await db.batch(logStmts)) if (r.meta.changes > 0) report.taskLog.imported++
  }

  return report
}
