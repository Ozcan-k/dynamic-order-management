import type { AccItem, AccCategory } from '@dom/shared'
import ComboBox from '../shared/ComboBox'
import { money } from '../../api/accounting'

export interface LineRow {
  itemId: string | null
  itemName: string
  categoryId?: string | null
  categoryName?: string | null
  subcategoryId?: string | null
  subcategoryName?: string | null
  description: string
  quantity: string
  unitCost: string
  discountPct: string
  taxPct: string
}

export const emptyLine = (): LineRow => ({
  itemId: null, itemName: '', categoryId: null, categoryName: '', subcategoryId: null, subcategoryName: '', description: '',
  quantity: '1', unitCost: '', discountPct: '0', taxPct: '0',
})

export function lineTotals(rows: LineRow[]) {
  let subtotal = 0, discountTotal = 0, taxTotal = 0
  for (const l of rows) {
    const gross = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0)
    const disc = gross * ((Number(l.discountPct) || 0) / 100)
    const net = gross - disc
    const tax = net * ((Number(l.taxPct) || 0) / 100)
    subtotal += gross; discountTotal += disc; taxTotal += tax
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return { subtotal: r2(subtotal), discountTotal: r2(discountTotal), taxTotal: r2(taxTotal), total: r2(subtotal - discountTotal + taxTotal) }
}

function rowTotal(l: LineRow) {
  const gross = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0)
  const net = gross - gross * ((Number(l.discountPct) || 0) / 100)
  return net + net * ((Number(l.taxPct) || 0) / 100)
}

type CategoryMode = 'none' | 'sale' | 'expense'

interface Props {
  rows: LineRow[]
  onChange: (rows: LineRow[]) => void
  items: AccItem[]
  categoryMode?: CategoryMode
  categories?: AccCategory[] // SALE: flat list; EXPENSE: parents with nested subcategories
  onCreateItem?: (name: string) => Promise<AccItem>
}

// Renders a managed (select-only) category option set, preserving a legacy value
// that is no longer in the catalog so editing old records doesn't lose it.
function CategorySelect({
  value, valueName, options, placeholder, onPick,
}: {
  value: string | null | undefined
  valueName: string | null | undefined
  options: { id: string; name: string }[]
  placeholder: string
  onPick: (id: string, name: string) => void
}) {
  const known = value ? options.some((o) => o.id === value) : true
  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const opt = options.find((o) => o.id === e.target.value)
        onPick(e.target.value, opt?.name ?? '')
      }}
    >
      <option value="">{placeholder}</option>
      {!known && value && <option value={value}>{valueName || '(legacy)'}</option>}
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

export default function LineItemsEditor({ rows, onChange, items, categoryMode = 'none', categories = [], onCreateItem }: Props) {
  const set = (i: number, patch: Partial<LineRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => onChange([...rows, emptyLine()])
  const removeRow = (i: number) => onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)
  const t = lineTotals(rows)

  const withCategory = categoryMode !== 'none'
  const withSub = categoryMode === 'expense'
  const subsFor = (categoryId?: string | null) => categories.find((c) => c.id === categoryId)?.subcategories ?? []

  return (
    <div>
      <div className="acc-table-wrap" style={{ overflow: 'visible' }}>
        <table className="acc-lines">
          <thead>
            <tr>
              <th style={{ minWidth: 160 }}>Item *</th>
              {withCategory && <th style={{ minWidth: 140 }}>Category</th>}
              {withSub && <th style={{ minWidth: 150 }}>Subcategory</th>}
              <th style={{ minWidth: 140 }}>Description</th>
              <th className="acc-col-num">Qty *</th>
              <th className="acc-col-num">Unit cost *</th>
              <th className="acc-col-num">Disc %</th>
              <th className="acc-col-num">Tax %</th>
              <th className="acc-col-num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i}>
                <td>
                  <ComboBox<AccItem>
                    items={items} value={l.itemName} placeholder="Select / type item"
                    showOthers={false}
                    onChange={(text) => set(i, { itemName: text, itemId: null })}
                    onPick={(it) => set(i, it ? { itemName: it.name, itemId: it.id, unitCost: l.unitCost || (it.unitCost != null ? String(it.unitCost) : '') } : { itemId: null })}
                    onAddNew={onCreateItem ? async (name) => { const it = await onCreateItem(name); set(i, { itemName: it.name, itemId: it.id }) } : undefined}
                  />
                </td>
                {withCategory && (
                  <td>
                    <CategorySelect
                      value={l.categoryId} valueName={l.categoryName} placeholder="— Category —"
                      options={categories.map((c) => ({ id: c.id, name: c.name }))}
                      onPick={(id, name) => set(i, { categoryId: id || null, categoryName: name, subcategoryId: null, subcategoryName: '' })}
                    />
                  </td>
                )}
                {withSub && (
                  <td>
                    <CategorySelect
                      value={l.subcategoryId} valueName={l.subcategoryName} placeholder={l.categoryId ? '— Subcategory —' : 'Pick category first'}
                      options={subsFor(l.categoryId)}
                      onPick={(id, name) => set(i, { subcategoryId: id || null, subcategoryName: name })}
                    />
                  </td>
                )}
                <td><input value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" style={{ width: 70, textAlign: 'right' }} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></td>
                <td><input type="number" min="0" step="0.01" style={{ width: 95, textAlign: 'right' }} value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} /></td>
                <td><input type="number" min="0" max="100" step="0.01" style={{ width: 65, textAlign: 'right' }} value={l.discountPct} onChange={(e) => set(i, { discountPct: e.target.value })} /></td>
                <td><input type="number" min="0" max="100" step="0.01" style={{ width: 65, textAlign: 'right' }} value={l.taxPct} onChange={(e) => set(i, { taxPct: e.target.value })} /></td>
                <td className="acc-col-num" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(rowTotal(l))}</td>
                <td className="acc-col-actions"><button type="button" className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => removeRow(i)} title="Remove">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, gap: 16, flexWrap: 'wrap' }}>
        <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={addRow}>+ New Row</button>
        <div style={{ minWidth: 240 }}>
          <div className="acc-totline"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
          <div className="acc-totline"><span>Discount</span><span>− {money(t.discountTotal)}</span></div>
          <div className="acc-totline"><span>Total Tax</span><span>{money(t.taxTotal)}</span></div>
          <div className="acc-totline acc-totline-grand"><span>Total</span><span>{money(t.total)}</span></div>
        </div>
      </div>
    </div>
  )
}
