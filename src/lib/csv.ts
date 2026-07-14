// ===== Экспорт в CSV для Excel =====
// Формат подобран под «двойной клик → готовая таблица» в Excel любой локали
// (включая русскую, где разделитель списка — точка с запятой):
//  - BOM (﻿) — иначе Excel читает UTF-8 кириллицу как кракозябры;
//  - первая строка "sep=;" — явно задаёт разделитель, работает и в EN-Excel;
//  - CRLF-переводы строк; суммы — голые числа (без пробелов и знака ₽),
//    даты — YYYY-MM-DD: Excel распознаёт их и сортирует как числа/даты.
// Google Sheets такой файл тоже открывает (строка sep= там видна как мусорная
// первая строка — некритично, приоритет отдан Excel по просьбе владельца).

import { type Inv, type Tx, addedAt, catLabel, typeLabel } from './data'
import { subCategoryLabel } from './categories'
import { type GoalsData, percentForDay } from './goals'

export type CsvCell = string | number

function esc(v: CsvCell): string {
  const s = String(v)
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function buildCsv(rows: CsvCell[][]): string {
  return '\ufeff' + 'sep=;\r\n' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

/** Числа для Excel: дробная часть с запятой — так русский Excel читает их как
 *  числа, а не как текст (разделитель полей у нас ';', конфликта нет). */
function num(n: number): string {
  return String(n).replace('.', ',')
}

/** Локальные дата-время добавления для Excel: '2026-07-06 21:40'. */
function fmtAdded(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Операции: по строке на транзакцию, отсортированы по дате (старые сверху). */
export function txCsv(txs: Tx[]): string {
  const rows: CsvCell[][] = [['Date', 'Type', 'Category', 'Subcategory', 'Amount', 'Note', 'Added at']]
  txs
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (addedAt(a) || 0) - (addedAt(b) || 0)))
    .forEach((t) => {
      const ms = addedAt(t)
      rows.push([
        t.date,
        typeLabel(t.type),
        catLabel(t.category),
        t.subCategory ? subCategoryLabel(t.subCategory) : '',
        num(t.amount),
        t.note || '',
        ms ? fmtAdded(ms) : '',
      ])
    })
  return buildCsv(rows)
}

/** Инвестиции: имя, тип, вложено/сейчас, прибыль и доходность. */
export function invCsv(inv: Inv[]): string {
  const rows: CsvCell[][] = [['Name', 'Type', 'Invested', 'Current', 'Profit', 'Return %']]
  inv.forEach((x) => {
    const pl = (x.current || 0) - (x.invested || 0)
    const ret = x.invested > 0 ? Math.round((pl / x.invested) * 1000) / 10 : 0
    rows.push([x.name, x.type, num(x.invested), num(x.current), num(pl), num(ret)])
  })
  return buildCsv(rows)
}

/** Цели: строка на день с 1/0 по каждой текущей задаче + общий процент. */
export function goalsCsv(g: GoalsData): string {
  const rows: CsvCell[][] = [['Date', 'Done %', ...g.tasks.map((t) => t.title)]]
  Object.keys(g.logs)
    .sort()
    .forEach((day) => {
      const log = g.logs[day]
      rows.push([day, percentForDay(log), ...g.tasks.map((t) => (log.done.includes(t.id) ? 1 : 0))])
    })
  return buildCsv(rows)
}

/** Скачивание текстового файла; false — если браузер не дал этого сделать. */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): boolean {
  try {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}
