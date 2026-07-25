-- ===== Схема БД «Деньги» (Cloudflare D1 / SQLite) =====
-- Применение:
--   npx wrangler d1 execute dengi-db --local  --file=worker/schema.sql   (локально)
--   npx wrangler d1 execute dengi-db --remote --file=worker/schema.sql   (боевая)
--
-- Денежные суммы храним в КОПЕЙКАХ целым числом (amount_cents). Это убирает
-- дрейф чисел с плавающей точкой: 100.50 + 50.25 всегда даст ровно 150.75.
-- Даты — строкой 'YYYY-MM-DD' (локальная дата пользователя), сортируется как есть.

PRAGMA foreign_keys = ON;

-- ---------- Справочник категорий (верхний уровень) ----------
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,          -- стабильный ключ, напр. 'groceries'
  name       TEXT NOT NULL,             -- отображаемое имя, напр. 'Groceries'
  kind       TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  color      TEXT,                      -- hex для иконки/диаграмм
  icon       TEXT,                      -- имя иконки на клиенте
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ---------- Подкатегории (иерархия: Categories -> Subcategories) ----------
CREATE TABLE IF NOT EXISTS subcategories (
  id         TEXT PRIMARY KEY,          -- напр. 'groc-meat'
  parent_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,             -- напр. 'Meat'
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_subcategories_parent ON subcategories(parent_id);

-- ---------- Транзакции ----------
-- user_id — числовой Telegram ID (берётся из проверенного initData, НЕ от клиента).
-- transit — «транзитные» деньги: проходят насквозь, в статистике учитывается
-- только чистый остаток (получено минус передано дальше).
CREATE TABLE IF NOT EXISTS transactions (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL,
  date           TEXT    NOT NULL,      -- 'YYYY-MM-DD'
  type           TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
  category_id    TEXT    NOT NULL,
  subcategory_id TEXT,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 0),
  transit        INTEGER NOT NULL DEFAULT 0 CHECK (transit IN (0, 1)),
  payer          TEXT,                  -- «от кого» (для дохода)
  note           TEXT,
  created_at     INTEGER NOT NULL,      -- epoch ms
  FOREIGN KEY (category_id)    REFERENCES categories(id),
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
);

-- Основной путь запросов: «операции пользователя за период».
CREATE INDEX IF NOT EXISTS idx_tx_user_date     ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_user_cat_date ON transactions(user_id, category_id, date);

-- ---------- Наполнение справочников ----------
-- id категорий совпадают с ключами на клиенте (см. src/lib/data.ts), чтобы
-- перенос старых данных был однозначным.

INSERT OR IGNORE INTO categories (id, name, kind, color, icon, sort_order) VALUES
  ('youtube',       'YouTube',        'income',  '#4F86C6', 'Clapperboard', 1),
  ('ads',           'Ads',            'income',  '#C264A0', 'Megaphone',    2),
  ('day-job',       'Day job',        'income',  '#3FA796', 'Briefcase',    3),
  ('family',        'Family',         'income',  '#7FB069', 'Users',        4),
  ('other-income',  'Other income',   'income',  '#9AA0A6', 'Wallet',       5),

  ('housing',       'Housing',        'expense', '#E1574C', 'Home',              10),
  ('groceries',     'Groceries',      'expense', '#E58A3B', 'ShoppingCart',      11),
  ('dining',        'Dining out',     'expense', '#E0B23A', 'UtensilsCrossed',   12),
  ('transport',     'Transport',      'expense', '#7FB069', 'Bus',               13),
  ('internet',      'Internet & phone','expense','#3FA796', 'Wifi',              14),
  ('subscriptions', 'Subscriptions',  'expense', '#4F86C6', 'CreditCard',        15),
  ('equipment',     'Equipment',      'expense', '#6C6CD1', 'Cpu',               16),
  ('software',      'Software & tools','expense','#9B6CCB', 'Wrench',            17),
  ('promo',         'Ads & promo',    'expense', '#C264A0', 'Megaphone',         18),
  ('health',        'Health',         'expense', '#D98AA8', 'HeartPulse',        19),
  ('education',     'Education',      'expense', '#4EA8DE', 'GraduationCap',     20),
  ('entertainment', 'Entertainment',  'expense', '#8C7B6B', 'Gamepad2',          21),
  ('gifts',         'Gifts',          'expense', '#6B8E9E', 'Gift',              22),
  ('clothing',      'Clothing',       'expense', '#A0A65B', 'Shirt',             23),
  ('taxes',         'Taxes',          'expense', '#C77B58', 'Landmark',          24),
  ('other-expense', 'Other',          'expense', '#9AA0A6', 'MoreHorizontal',    25);

INSERT OR IGNORE INTO subcategories (id, parent_id, name, sort_order) VALUES
  ('groc-meat',   'groceries', 'Meat',               1),
  ('groc-water',  'groceries', 'Water & drinks',     2),
  ('groc-veg',    'groceries', 'Vegetables & fruit', 3),
  ('groc-snacks', 'groceries', 'Snacks',             4);
