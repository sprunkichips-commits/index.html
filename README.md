# Деньги — личный финансовый трекер (Telegram Mini App)

Персональный учёт доходов/расходов и инвестиций. Работает как Telegram Mini App и
в обычном браузере. Данные хранятся в Telegram CloudStorage (синхронизация между
устройствами), с откатом на `localStorage`. UI на русском, валюта ₽.

**Ветка `redesign`** — переписанная версия на React + Vite + Tailwind + shadcn/ui
(поверх Radix) + Recharts. Ветка `main` — прежняя однофайловая версия (живой сайт),
её не трогаем, пока не будем готовы переключиться.

## Стек

- Vite + React + TypeScript
- Tailwind CSS v3 (тёмная тема — основная, светлая — переключаемая)
- shadcn/ui-компоненты поверх Radix (Dialog, Select, Slot)
- Recharts (графики)
- lucide-react (иконки)
- Telegram WebApp SDK (`telegram-web-app.js`, подключён в `index.html`)

## Разработка

```bash
npm install
npm run dev        # локальный дев-сервер
npm run build      # прод-сборка в dist/
npm run preview    # отдать собранный dist локально
npm run typecheck  # проверка типов
```

## Структура

```
src/
  lib/        storage.ts (CloudStorage+localStorage+память, чанки 3500, ключи)
              data.ts (типы, категории+цвета, sanitize, агрегаты, DEMO)
              telegram.ts (SDK, OWNER_ID), format.ts, useChartColors.ts, utils.ts
  store/      StoreContext.tsx (состояние, действия, загрузка/сохранение, тосты)
  components/ ui/* (Button, Card, Sheet, Input, Select, Segmented),
              навигация, шапка, листы Add/Settings, карточки, charts/*
  screens/    Dashboard, Transactions, Stats, Investments
```

## Данные и совместимость

Формат данных не менялся — старые записи открываются как есть:

```ts
data = {
  transactions: [{ id, date:"YYYY-MM-DD", type:"Доход"|"Расход", category, amount, note }],
  investments:  [{ id, name, type, invested, current }]
}
```

- Источник истины — Telegram CloudStorage: данные в чанках `data_0…/data_n`
  (размер чанка 3500), тема в ключе `theme`.
- Откат — `localStorage`: данные в `pm-finance-v1`, тема в `pm-finance-theme-v1`.
- Загрузка существующих данных идёт **без** строгой нормализации (как раньше),
  поэтому ничего не теряется. Нормализация (`sanitize`) применяется только при
  импорте/восстановлении из файла или текста.

## Безопасность

- React экранирует пользовательский текст автоматически; `dangerouslySetInnerHTML`
  для пользовательских строк не используется.
- Импорт JSON строго нормализуется: только ожидаемые поля, числа через `Number`
  с клампом (0…1 трлн), строки по длине (заметка 140, название 40 и т.д.),
  валидация даты `YYYY-MM-DD`, потолок размера массивов; мусор отбрасывается.
- Лимиты ввода: `maxLength` на заметку/название, ограничение разрядности сумм.
- Внешняя сеть запрещена: `<meta>` CSP с `connect-src 'self'`, разрешены только
  собственные ассеты и Telegram SDK. Никаких сторонних fetch/XHR, аналитики,
  внешних шрифтов.
- Секретов в коде нет: токен бота живёт только на стороне бота, в Mini App его быть
  не должно.

### OWNER_ID — честно

`OWNER_ID` (в `src/lib/telegram.ts`) — это **мягкий клиентский UX-замок, а не
авторизация**. Его можно обойти, открыв страницу вне Telegram или изменив код в
браузере. Реальная приватность обеспечивается тем, что Telegram CloudStorage у
каждого пользователя свой — чужой не увидит твои данные. Настоящая проверка доступа
потребовала бы валидации подписи `initData` на бэкенде, что вне рамок статического
сайта. `0` = без замка; впиши свой Telegram ID, чтобы открывать только себе.

## Деплой (GitHub Pages)

`vite.config.ts` задаёт `base: '/index.html/'` под URL проекта
`https://sprunkichips-commits.github.io/index.html/`.

Workflow `.github/workflows/deploy.yml` на пуш в `redesign` собирает и публикует
`dist` через `actions/upload-pages-artifact` + `actions/deploy-pages`.

**Пока `main` не ломаем.** GitHub Pages в репозитории один источник за раз. Сейчас
Source = «Deploy from a branch (main)» — живёт прежняя версия. Когда `redesign`
готов, чтобы переключиться:

1. Settings → Pages → **Source: GitHub Actions**.
2. Запустить workflow (повторный пуш в `redesign` или «Run workflow» вручную).
3. Проверить сайт по адресу Pages и открыть его внутри Telegram через бота.

Откат: вернуть Source на «Deploy from a branch (main)».

## Фаза 2 — TON Connect (опционально, ещё не подключено)

Крипто-функция не входит в ядро. При необходимости — `@tonconnect/ui-react`:
кнопка подключения кошелька (Tonkeeper/Telegram Wallet), показ адреса/баланса.
Приложение должно полноценно работать без кошелька; сид-фразы/приватные ключи
никогда не запрашиваются; транзакции — только через официальный UI кошелька.
Потребуется публичный `tonconnect-manifest.json`.
