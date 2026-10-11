// CSV / Excel export for the Accounting lists (v2.102.0). One column definition feeds
// both formats, so a column can never mean one thing in CSV and another in Excel.
//
// CSV safety: a text cell that starts with = + - @ TAB or CR is prefixed with ' so a
// spreadsheet opens it as text instead of running it as a formula (CSV injection —
// customer and vendor names are typed by people).
import { buildXlsx, downloadBlob, type XCell, type XStyle } from '../../lib/xlsxWriter'

export type ExportKind = 'text' | 'money' | 'number' | 'date'
export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
  kind?: ExportKind
  width?: number
  /** Money / number columns summed into the total row. */
  total?: boolean
}

const FORMULA_START = /^[=+\-@\t\r]/

function csvField(v: string | number | null | undefined, kind: ExportKind): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return kind === 'money' ? v.toFixed(2) : String(v)
  let s = String(v)
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const lines = [
    columns.map((c) => csvField(c.header, 'text')).join(','),
    ...rows.map((r) => columns.map((c) => csvField(c.value(r), c.kind ?? 'text')).join(',')),
  ]
  // BOM so Excel opens UTF-8 (₱, ñ) correctly.
  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename)
}

const NAVY = '#0f172a', LINE = '#e2e8f0'
const head: XStyle = { bold: true, color: '#ffffff', bg: '#1e293b', border: LINE, valign: 'center' }
const fmtOf = (k: ExportKind): XStyle => k === 'money' ? { numFmt: '#,##0.00', align: 'right' } : k === 'number' ? { numFmt: '#,##0.##', align: 'right' } : {}

export function exportXlsx<T>(filename: string, sheetName: string, title: string, columns: ExportColumn<T>[], rows: T[]) {
  const sheetRows: (XCell | null)[][] = [
    [{ v: title, s: { bold: true, size: 14, color: NAVY } }],
    [{ v: `Exported ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (Manila) · ${rows.length} row${rows.length === 1 ? '' : 's'}`, s: { color: '#475569', italic: true } }],
    [],
    columns.map((c) => ({ v: c.header, s: { ...head, align: c.kind === 'money' || c.kind === 'number' ? 'right' : 'left' } })),
    ...rows.map((r) => columns.map((c) => {
      const v = c.value(r)
      return { v: v === undefined || v === '' ? null : v, s: { ...fmtOf(c.kind ?? 'text'), border: LINE } }
    })),
  ]
  if (columns.some((c) => c.total)) {
    sheetRows.push(columns.map((c, i) => {
      if (i === 0) return { v: 'Total', s: { bold: true, border: LINE, bg: '#f1f5f9' } }
      if (!c.total) return { v: null, s: { border: LINE, bg: '#f1f5f9' } }
      const sum = rows.reduce((t, r) => t + Math.round(Number(c.value(r) || 0) * 100), 0) / 100
      return { v: sum, s: { ...fmtOf(c.kind ?? 'money'), bold: true, border: LINE, bg: '#f1f5f9' } }
    }))
  }
  downloadBlob(buildXlsx([{
    name: sheetName.slice(0, 31),
    rows: sheetRows,
    colWidths: columns.map((c) => c.width ?? (c.kind === 'money' ? 14 : c.kind === 'date' ? 12 : 18)),
    freeze: { rows: 4, cols: 1 },
  }]), filename)
}

/** "Sales_2026-10-01_to_2026-10-31" / "Sales_all-dates" */
export function exportName(base: string, from?: string, to?: string) {
  const range = from || to ? `${from || 'start'}_to_${to || 'today'}` : 'all-dates'
  return `${base}_${range}`
}
