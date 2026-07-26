// ===== API «Деньги» — Cloudflare Worker (Hono + D1) =====
// Все маршруты под /api/* защищены проверкой Telegram initData (см. auth.ts):
// user_id берётся ТОЛЬКО из проверенной подписи, никогда из тела запроса,
// поэтому пользователь не может прочитать или испортить чужие данные.
//
// Статика (собранный фронтенд из dist/) отдаётся биндингом ASSETS —
// один Worker обслуживает и приложение, и API, поэтому CORS не нужен.

import { Hono } from 'hono'
import {
  createSession,
  readCookie,
  readSession,
  sessionCookie,
  telegramAuth,
  verifyLoginWidget,
  SESSION_COOKIE,
  type AuthEnv,
} from './auth'
import { importBackup } from './import'
import {
  getCategoryStats,
  getMonthlyTotals,
  getSubCategoryStats,
  getTotals,
  type Range,
} from './queries'

type Env = AuthEnv & { Bindings: AuthEnv['Bindings'] & { ASSETS?: Fetcher } }

const app = new Hono<Env>()

// ---------- Утилиты ----------

/** Проверка initData без выброса: возвращает id пользователя или null. */
async function verifyInitDataSafe(initData: string, botToken: string): Promise<number | null> {
  const { verifyInitData } = await import('./auth')
  const r = await verifyInitData(initData, botToken)
  return r.ok && r.user ? r.user.id : null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_AMOUNT_CENTS = 1e14 // ~1 трлн рублей — защита от мусора
const NOTE_MAX = 140
const PAYER_MAX = 60

function badRequest(message: string) {
  return { error: 'bad_request', message }
}

/** Границы месяца: (2026, 7) -> ['2026-07-01', '2026-07-31']. */
function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` }
}

/** Диапазон из query: либо ?from=&to=, либо ?year=&month=. По умолчанию — текущий месяц. */
function rangeFromQuery(c: { req: { query: (k: string) => string | undefined } }, userId: number): Range | null {
  const from = c.req.query('from')
  const to = c.req.query('to')
  if (from && to) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null
    return { userId, from, to }
  }
  const now = new Date()
  const year = Number(c.req.query('year') ?? now.getUTCFullYear())
  const month = Number(c.req.query('month') ?? now.getUTCMonth() + 1)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  const r = monthRange(year, month)
  return { userId, ...r }
}

function centsToRub(cents: number): number {
  return Math.round(cents) / 100
}

// ---------- Проверка живости (без авторизации) ----------

/** Публичные настройки для клиента. Секретов здесь нет: имя бота публично,
 *  а токен остаётся на сервере. Нужен сайту, чтобы отрисовать кнопку входа. */
app.get('/api/config', (c) => c.json({ botUsername: c.env.BOT_USERNAME ?? '' }))

app.get('/api/health', (c) =>
  c.json({ ok: true, ts: Date.now(), database: c.env.DB ? 'connected' : 'not_configured' }),
)

// ---------- Вход на сайте через Telegram Login Widget (без авторизации) ----------
// Telegram перенаправляет сюда с подписанными данными пользователя. Проверяем
// подпись и выдаём cookie сессии — дальше сайт работает как приложение внутри
// Telegram и видит те же самые данные.

app.get('/api/auth/telegram', async (c) => {
  const params: Record<string, string> = {}
  new URL(c.req.url).searchParams.forEach((v, k) => (params[k] = v))

  const res = await verifyLoginWidget(params, c.env.BOT_TOKEN)
  if (!res.ok || !res.user) {
    return c.json({ error: 'unauthorized', reason: res.reason }, 401)
  }
  const token = await createSession(res.user.id, c.env.BOT_TOKEN)
  // Возвращаем на главную уже с установленной cookie.
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': sessionCookie(token) },
  })
})

/** Кто я сейчас: есть ли действующий вход. Нужен сайту, чтобы решить,
 *  показывать кнопку входа или сразу данные. */
app.get('/api/auth/me', async (c) => {
  const initData = c.req.header('X-Telegram-Init-Data') || ''
  if (initData) {
    const r = await verifyInitDataSafe(initData, c.env.BOT_TOKEN)
    if (r) return c.json({ authenticated: true, userId: r, via: 'telegram' })
  }
  const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE)
  if (token) {
    const userId = await readSession(token, c.env.BOT_TOKEN)
    if (userId) return c.json({ authenticated: true, userId, via: 'session' })
  }
  // Локальная разработка: тот же признак, что и в telegramAuth. Без него
  // запросы к данным проходили, а приложение всё равно показывало вход —
  // проверить сайт локально было невозможно. В бою переменной нет.
  const devUser = c.env.ALLOW_DEV_USER
  if (devUser && /^\d+$/.test(devUser)) {
    return c.json({ authenticated: true, userId: Number(devUser), via: 'session' })
  }
  return c.json({ authenticated: false }, 200)
})

app.post('/api/auth/logout', (c) =>
  new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    },
  }),
)

// ---------- База ещё не привязана? Отвечаем понятно, а не падаем с 500 ----------
// Пока блок [[d1_databases]] в wrangler.toml закомментирован, деплоится только
// статика: приложение работает на локальном хранилище, а API сообщает 503.
app.use('/api/*', async (c, next) => {
  if (!c.env.DB) {
    return c.json(
      { error: 'database_not_configured', message: 'D1 database is not attached yet' },
      503,
    )
  }
  await next()
})

// ---------- Всё остальное под /api требует валидного Telegram initData ----------

app.use('/api/*', telegramAuth)

// ---------- Справочники ----------

app.get('/api/categories', async (c) => {
  const [cats, subs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, kind, color, icon FROM categories ORDER BY sort_order, name`,
    ).all(),
    c.env.DB.prepare(
      `SELECT id, parent_id AS parentId, name FROM subcategories ORDER BY sort_order, name`,
    ).all(),
  ])
  return c.json({ categories: cats.results ?? [], subcategories: subs.results ?? [] })
})

// ---------- Транзакции ----------

app.get('/api/transactions', async (c) => {
  const userId = c.get('userId')
  const range = rangeFromQuery(c, userId)
  if (!range) return c.json(badRequest('invalid date range'), 400)

  const limit = Math.min(Number(c.req.query('limit') ?? 500) || 500, 1000)
  const { results } = await c.env.DB.prepare(
    `SELECT id, date, type, category_id AS categoryId, subcategory_id AS subCategoryId,
            amount_cents AS amountCents, transit, payer, note, created_at AS createdAt
     FROM transactions
     WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3
     ORDER BY date DESC, created_at DESC
     LIMIT ?4`,
  )
    .bind(userId, range.from, range.to, limit)
    .all<Record<string, unknown>>()

  const items = (results ?? []).map((t) => ({
    ...t,
    transit: t.transit === 1,
    amount: centsToRub(t.amountCents as number),
  }))
  return c.json({ items })
})

app.post('/api/transactions', async (c) => {
  const userId = c.get('userId')
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json(badRequest('invalid JSON'), 400)
  }

  // --- Валидация. Клиенту не доверяем ничего, кроме уже проверенного userId. ---
  const date = String(body.date ?? '')
  if (!DATE_RE.test(date)) return c.json(badRequest('date must be YYYY-MM-DD'), 400)

  const type = body.type === 'income' ? 'income' : body.type === 'expense' ? 'expense' : null
  if (!type) return c.json(badRequest("type must be 'income' or 'expense'"), 400)

  // Сумма принимается в копейках (amountCents) либо в рублях (amount).
  const rawCents =
    body.amountCents != null ? Number(body.amountCents) : Math.round(Number(body.amount) * 100)
  if (!Number.isFinite(rawCents) || rawCents <= 0 || rawCents > MAX_AMOUNT_CENTS) {
    return c.json(badRequest('amount must be a positive number'), 400)
  }
  const amountCents = Math.round(rawCents)

  const categoryId = String(body.categoryId ?? '')
  if (!categoryId) return c.json(badRequest('categoryId is required'), 400)

  // Категория должна существовать и совпадать по типу операции.
  const cat = await c.env.DB.prepare(`SELECT id, kind FROM categories WHERE id = ?1`)
    .bind(categoryId)
    .first<{ id: string; kind: string }>()
  if (!cat) return c.json(badRequest('unknown categoryId'), 400)
  if (cat.kind !== type) return c.json(badRequest(`category '${categoryId}' is not a ${type} category`), 400)

  // Подкатегория (опционально) должна принадлежать выбранной категории.
  let subCategoryId: string | null = body.subCategoryId ? String(body.subCategoryId) : null
  if (subCategoryId) {
    const sub = await c.env.DB.prepare(`SELECT id FROM subcategories WHERE id = ?1 AND parent_id = ?2`)
      .bind(subCategoryId, categoryId)
      .first<{ id: string }>()
    if (!sub) return c.json(badRequest('subCategoryId does not belong to categoryId'), 400)
  }

  const id = crypto.randomUUID()
  const transit = body.transit === true || body.transit === 1 ? 1 : 0
  const payer = body.payer ? String(body.payer).trim().slice(0, PAYER_MAX) : null
  const note = body.note ? String(body.note).trim().slice(0, NOTE_MAX) : null
  const createdAt = Date.now()

  await c.env.DB.prepare(
    `INSERT INTO transactions
       (id, user_id, date, type, category_id, subcategory_id, amount_cents, transit, payer, note, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(id, userId, date, type, categoryId, subCategoryId, amountCents, transit, payer, note, createdAt)
    .run()

  return c.json(
    {
      id, date, type, categoryId, subCategoryId,
      amountCents, amount: centsToRub(amountCents),
      transit: transit === 1, payer, note, createdAt,
    },
    201,
  )
})

app.delete('/api/transactions/:id', async (c) => {
  const userId = c.get('userId')
  // user_id в WHERE обязателен: без него можно было бы удалить чужую операцию.
  const res = await c.env.DB.prepare(`DELETE FROM transactions WHERE id = ?1 AND user_id = ?2`)
    .bind(c.req.param('id'), userId)
    .run()
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})

// ---------- Перенос данных из бэкапа ----------
// Принимает файл, который отдаёт «Settings → Download file». Импорт только
// добавляет записи и не создаёт дублей при повторной загрузке того же файла.

app.post('/api/import', async (c) => {
  const userId = c.get('userId')
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json(badRequest('invalid JSON'), 400)
  }
  const report = await importBackup(c.env.DB, userId, payload)
  return c.json(report)
})

// ---------- Статистика (агрегация в SQL) ----------

app.get('/api/stats', async (c) => {
  const userId = c.get('userId')
  const range = rangeFromQuery(c, userId)
  if (!range) return c.json(badRequest('invalid date range'), 400)

  const [totals, income, expense] = await Promise.all([
    getTotals(c.env.DB, range),
    getCategoryStats(c.env.DB, range, 'income'),
    getCategoryStats(c.env.DB, range, 'expense'),
  ])

  return c.json({
    range: { from: range.from, to: range.to },
    totals: {
      ...totals,
      income: centsToRub(totals.incomeCents),
      expense: centsToRub(totals.expenseCents),
      net: centsToRub(totals.netCents),
    },
    incomeSources: income.map((s) => ({ ...s, total: centsToRub(s.totalCents) })),
    expenseCategories: expense.map((s) => ({ ...s, total: centsToRub(s.totalCents) })),
  })
})

app.get('/api/stats/subcategories', async (c) => {
  const userId = c.get('userId')
  const range = rangeFromQuery(c, userId)
  if (!range) return c.json(badRequest('invalid date range'), 400)

  const categoryId = c.req.query('categoryId')
  if (!categoryId) return c.json(badRequest('categoryId is required'), 400)

  const { totalCents, items } = await getSubCategoryStats(c.env.DB, range, categoryId)
  return c.json({
    categoryId,
    totalCents,
    total: centsToRub(totalCents),
    items: items.map((i) => ({ ...i, total: centsToRub(i.totalCents) })),
  })
})

app.get('/api/stats/monthly', async (c) => {
  const userId = c.get('userId')
  const year = Number(c.req.query('year') ?? new Date().getUTCFullYear())
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return c.json(badRequest('invalid year'), 400)

  const months = await getMonthlyTotals(c.env.DB, userId, year)
  return c.json({
    year,
    months: months.map((m) => ({
      ...m,
      income: centsToRub(m.incomeCents),
      expense: centsToRub(m.expenseCents),
    })),
  })
})

// ---------- Ошибки и статика ----------

app.onError((err, c) => {
  console.error('API error:', err)
  return c.json({ error: 'internal_error' }, 500)
})

app.notFound(async (c) => {
  // Неизвестный /api/* — честная 404 JSON-ом.
  if (new URL(c.req.url).pathname.startsWith('/api/')) return c.json({ error: 'not_found' }, 404)
  // Остальное отдаёт статика (SPA); если биндинга нет — значит статику раздаёт другой хостинг.
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw)
  return c.text('Not found', 404)
})

export default app
