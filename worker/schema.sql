/* ===== Схема БД «Деньги» (Cloudflare D1 / SQLite) =====
 *
 * ВАЖНО: комментарии здесь только блочные (слэш-звёздочка). Однострочные
 * комментарии (два дефиса) нельзя: консоль D1 в панели Cloudflare склеивает
 * вставленный текст в одну строку, и всё после такого комментария стало бы
 * закомментированным — таблицы молча не создались бы.
 *
 * Применение — любым из двух способов:
 *   панель Cloudflare: D1 -> база -> Console -> вставить этот файл -> Execute
 *   командой:          npx wrangler d1 execute dengi-db --remote --file=worker/schema.sql
 *
 * Файл идемпотентный: повторный запуск ничего не ломает и не дублирует
 * (IF NOT EXISTS + INSERT OR IGNORE).
 *
 * Денежные суммы храним в КОПЕЙКАХ целым числом (amount_cents) — это убирает
 * дрейф чисел с плавающей точкой: 100.50 + 50.25 всегда даст ровно 150.75.
 * Даты — строкой 'YYYY-MM-DD' (локальная дата пользователя).
 */

PRAGMA foreign_keys = ON;

/* ---------- Справочник категорий (верхний уровень) ---------- */
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  color      TEXT,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

/* ---------- Подкатегории (иерархия: Categories -> Subcategories) ---------- */
CREATE TABLE IF NOT EXISTS subcategories (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_subcategories_parent ON subcategories(parent_id);

/* ---------- Транзакции ----------
 * user_id — числовой Telegram ID, берётся из проверенного initData, а НЕ от
 * клиента. transit — «транзитные» деньги: проходят насквозь, в статистике
 * учитывается только чистый остаток (получено минус передано дальше).
 */
CREATE TABLE IF NOT EXISTS transactions (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  date           TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
  category_id    TEXT    NOT NULL,
  subcategory_id TEXT,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 0),
  transit        INTEGER NOT NULL DEFAULT 0 CHECK (transit IN (0, 1)),
  payer          TEXT,
  note           TEXT,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (category_id)    REFERENCES categories(id),
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date     ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_user_cat_date ON transactions(user_id, category_id, date);

/* ---------- Цели и ежедневные привычки ---------- */
CREATE TABLE IF NOT EXISTS goals (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  target_date TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, target_date);

CREATE TABLE IF NOT EXISTS daily_tasks (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON daily_tasks(user_id, sort_order);

/* total_tasks — снимок числа задач на тот день, чтобы проценты за прошлое
 * не менялись задним числом при добавлении новых привычек. */
CREATE TABLE IF NOT EXISTS task_log (
  user_id     INTEGER NOT NULL,
  day         TEXT    NOT NULL,
  task_id     TEXT    NOT NULL,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_log_user_day ON task_log(user_id, day);

/* ---------- Профиль (ник и аватар) ---------- */
CREATE TABLE IF NOT EXISTS profile (
  user_id INTEGER PRIMARY KEY,
  name    TEXT NOT NULL DEFAULT '',
  avatar  TEXT NOT NULL DEFAULT ''
);

/* ---------- Наполнение справочников ----------
 * id категорий совпадают с ключами на клиенте, чтобы перенос старых данных
 * был однозначным (см. worker/src/import.ts).
 */
INSERT OR IGNORE INTO categories (id, name, kind, color, icon, sort_order) VALUES
  ('youtube',       'YouTube',         'income',  '#4F86C6', 'Clapperboard', 1),
  ('ads',           'Ads',             'income',  '#C264A0', 'Megaphone',    2),
  ('day-job',       'Day job',         'income',  '#3FA796', 'Briefcase',    3),
  ('family',        'Family',          'income',  '#7FB069', 'Users',        4),
  ('other-income',  'Other income',    'income',  '#9AA0A6', 'Wallet',       5),
  ('housing',       'Housing',         'expense', '#E1574C', 'Home',            10),
  ('groceries',     'Groceries',       'expense', '#E58A3B', 'ShoppingCart',    11),
  ('dining',        'Dining out',      'expense', '#E0B23A', 'UtensilsCrossed', 12),
  ('transport',     'Transport',       'expense', '#7FB069', 'Bus',             13),
  ('internet',      'Internet & phone','expense', '#3FA796', 'Wifi',            14),
  ('subscriptions', 'Subscriptions',   'expense', '#4F86C6', 'CreditCard',      15),
  ('equipment',     'Equipment',       'expense', '#6C6CD1', 'Cpu',             16),
  ('software',      'Software & tools','expense', '#9B6CCB', 'Wrench',          17),
  ('promo',         'Ads & promo',     'expense', '#C264A0', 'Megaphone',       18),
  ('health',        'Health',          'expense', '#D98AA8', 'HeartPulse',      19),
  ('education',     'Education',       'expense', '#4EA8DE', 'GraduationCap',   20),
  ('entertainment', 'Entertainment',   'expense', '#8C7B6B', 'Gamepad2',        21),
  ('gifts',         'Gifts',           'expense', '#6B8E9E', 'Gift',            22),
  ('clothing',      'Clothing',        'expense', '#A0A65B', 'Shirt',           23),
  ('taxes',         'Taxes',           'expense', '#C77B58', 'Landmark',        24),
  ('other-expense', 'Other',           'expense', '#9AA0A6', 'MoreHorizontal',  25);

INSERT OR IGNORE INTO subcategories (id, parent_id, name, sort_order) VALUES
  ('groc-meat',   'groceries', 'Meat',               1),
  ('groc-water',  'groceries', 'Water & drinks',     2),
  ('groc-veg',    'groceries', 'Vegetables & fruit', 3),
  ('groc-snacks', 'groceries', 'Snacks',             4);
