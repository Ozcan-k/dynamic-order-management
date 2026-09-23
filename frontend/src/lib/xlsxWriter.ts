// ════════════════════════════════════════════════════════════════════════════
// Minimal, dependency-free .xlsx writer (v2.84.0).
//
// Produces a valid Office Open XML workbook (stored/uncompressed ZIP) with
// inline strings, per-cell styles (font / fill / border / alignment / number
// format), column widths, row heights, merged cells and frozen panes. Enough
// for formatted report exports without pulling a spreadsheet library into the
// bundle (and without touching package-lock for the production build).
// ════════════════════════════════════════════════════════════════════════════

export interface XStyle {
  bold?: boolean
  italic?: boolean
  size?: number
  color?: string // '#RRGGBB'
  bg?: string // '#RRGGBB'
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'center' | 'bottom'
  wrap?: boolean
  numFmt?: string // e.g. '#,##0', '0.0%', '0.0'
  border?: string // '#RRGGBB' thin border on all sides
}

export interface XCell {
  v: string | number | null
  s?: XStyle
}

export interface XSheet {
  name: string
  rows: (XCell | null)[][]
  colWidths?: number[] // in Excel character units
  rowHeights?: Record<number, number> // 0-based row index → points
  merges?: string[] // e.g. 'A1:K1'
  freeze?: { rows: number; cols: number }
  showGrid?: boolean
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function colName(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // strip XML-illegal control chars
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

// ─── styles registry ────────────────────────────────────────────────────────

class StyleRegistry {
  private fonts: string[] = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>']
  private fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  private borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  private numFmts: { id: number; code: string }[] = []
  private xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  private xfIndex = new Map<string, number>()

  private idx(list: string[], xml: string): number {
    const i = list.indexOf(xml)
    if (i >= 0) return i
    list.push(xml)
    return list.length - 1
  }

  id(s?: XStyle): number {
    if (!s) return 0
    const key = JSON.stringify(s)
    const hit = this.xfIndex.get(key)
    if (hit !== undefined) return hit

    const font = `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size ?? 11}"/>${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`
    const fontId = this.idx(this.fonts, font)
    const fillId = s.bg
      ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.bg)}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0
    const borderId = s.border
      ? this.idx(this.borders, `<border>${['left', 'right', 'top', 'bottom'].map((side) => `<${side} style="thin"><color rgb="${argb(s.border!)}"/></${side}>`).join('')}<diagonal/></border>`)
      : 0
    let numFmtId = 0
    if (s.numFmt) {
      const existing = this.numFmts.find((f) => f.code === s.numFmt)
      if (existing) numFmtId = existing.id
      else {
        numFmtId = 164 + this.numFmts.length
        this.numFmts.push({ id: numFmtId, code: s.numFmt })
      }
    }
    const align = s.align || s.valign || s.wrap
      ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.valign ? ` vertical="${s.valign}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>`
      : ''
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
      + `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`
    this.xfs.push(xf)
    const id = this.xfs.length - 1
    this.xfIndex.set(key, id)
    return id
  }

  xml(): string {
    const numFmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code)}"/>`).join('')}</numFmts>`
      : ''
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + numFmts
      + `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>`
      + `<fills count="${this.fills.length}">${this.fills.join('')}</fills>`
      + `<borders count="${this.borders.length}">${this.borders.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>'
  }
}

// ─── sheet xml ──────────────────────────────────────────────────────────────

function sheetXml(sheet: XSheet, styles: StyleRegistry): string {
  let views = ''
  const fr = sheet.freeze
  const grid = sheet.showGrid === false ? ' showGridLines="0"' : ''
  if (fr && (fr.rows > 0 || fr.cols > 0)) {
    const pane = fr.rows > 0 && fr.cols > 0 ? 'bottomRight' : fr.rows > 0 ? 'bottomLeft' : 'topRight'
    views = `<sheetViews><sheetView workbookViewId="0"${grid}><pane${fr.cols ? ` xSplit="${fr.cols}"` : ''}${fr.rows ? ` ySplit="${fr.rows}"` : ''} topLeftCell="${colName(fr.cols)}${fr.rows + 1}" activePane="${pane}" state="frozen"/></sheetView></sheetViews>`
  } else {
    views = `<sheetViews><sheetView workbookViewId="0"${grid}/></sheetViews>`
  }

  const cols = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''

  const rows = sheet.rows.map((row, r) => {
    const ht = sheet.rowHeights?.[r]
    const cells = row.map((cell, c) => {
      if (!cell) return ''
      const ref = `${colName(c)}${r + 1}`
      const s = styles.id(cell.s)
      const sAttr = s ? ` s="${s}"` : ''
      if (cell.v === null || cell.v === '') return s ? `<c r="${ref}"${sAttr}/>` : ''
      if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${ref}"${sAttr}><v>${cell.v}</v></c>`
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(cell.v))}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`
  }).join('')

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + views
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + cols
    + `<sheetData>${rows}</sheetData>`
    + merges
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '</worksheet>'
}

// ─── zip (stored) ───────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  // fixed DOS timestamp (2026-01-01 00:00) — content is what matters
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1

  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(6, 0x0800, true) // UTF-8 names
    lh.setUint16(8, 0, true) // stored
    lh.setUint16(10, dosTime, true)
    lh.setUint16(12, dosDate, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, size, true)
    lh.setUint32(22, size, true)
    lh.setUint16(26, name.length, true)
    lh.setUint16(28, 0, true)
    const local = new Uint8Array(30 + name.length + size)
    local.set(new Uint8Array(lh.buffer), 0)
    local.set(name, 30)
    local.set(f.data, 30 + name.length)
    locals.push(local)

    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(8, 0x0800, true)
    ch.setUint16(10, 0, true)
    ch.setUint16(12, dosTime, true)
    ch.setUint16(14, dosDate, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, size, true)
    ch.setUint32(24, size, true)
    ch.setUint16(28, name.length, true)
    ch.setUint16(30, 0, true)
    ch.setUint16(32, 0, true)
    ch.setUint16(34, 0, true)
    ch.setUint16(36, 0, true)
    ch.setUint32(38, 0, true)
    ch.setUint32(42, offset, true)
    const central = new Uint8Array(46 + name.length)
    central.set(new Uint8Array(ch.buffer), 0)
    central.set(name, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const l of locals) { out.set(l, p); p += l.length }
  for (const c of centrals) { out.set(c, p); p += c.length }
  out.set(new Uint8Array(eocd.buffer), p)
  return out
}

// ─── workbook ───────────────────────────────────────────────────────────────

export function buildXlsx(sheets: XSheet[]): Blob {
  const enc = new TextEncoder()
  const styles = new StyleRegistry()
  const sheetFiles = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s, styles)) }))
  // sheet names: max 31 chars, no []:*?/\
  const safeName = (n: string) => n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>'
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>'
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${sheets.map((s, i) => `<sheet name="${esc(safeName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + '</workbook>'
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>'

  const zip = zipStored([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(styles.xml()) },
    ...sheetFiles,
  ])
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
