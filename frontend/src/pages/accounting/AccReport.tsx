import { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ACC_COUNTRY_LABELS } from '@dom/shared'
import {
  useSalesReport, useExpenseReport, useVendors, useCategories, money, PESO,
} from '../../api/accounting'
import DateRangePicker, { type DateRange } from '../../components/accounting/DateRangePicker'

type Tab = 'sales' | 'expenses'

const C = { sales: '#16a34a', expenses: '#dc2626' }
const CAT_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea']

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function thisMonthRange(): DateRange {
  const n = new Date()
  return { from: fmt(new Date(n.getFullYear(), n.getMonth(), 1)), to: fmt(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }
}

function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return PESO + (n / 1_000_000).toFixed(1) + 'M'
  if (a >= 1_000) return PESO + (n / 1_000).toFixed(1) + 'k'
  return PESO + Math.round(n)
}
const tip = (v: any) => money(Number(v))

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="acc-card acc-card-pad" style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 10 }}>
        <h3 className="acc-card-title" style={{ margin: 0 }}>{title}</h3>
        {subtitle && <p className="acc-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function TrendChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} interval="preserveStartEnd" />
        <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} width={56} />
        <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Horizontal ranked bars + percentage breakdown table — shared layout for the
// "by Category" and "by Subcategory" sections so both read identically.
function BreakdownChart({
  rows, total, selected, onSelect, nameKey, label,
}: {
  rows: { name: string; amount: number }[]
  total: number
  selected: string
  onSelect: (name: string) => void
  nameKey: string
  label: string
}) {
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 38 + 30)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
          <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} width={140} />
          <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
          <Bar dataKey="amount" name={label} radius={[0, 4, 4, 0]} maxBarSize={28}>
            {rows.map((r, i) => <Cell key={i} fill={selected && selected !== r.name ? '#cbd5e1' : CAT_COLORS[i % CAT_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="acc-table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>{nameKey}</th><th className="acc-col-num">Amount</th><th className="acc-col-num">% of total</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} style={selected === r.name ? { background: '#f1f5f9' } : undefined}>
                <td>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[i % CAT_COLORS.length], marginRight: 8, verticalAlign: 'middle' }} />
                  <button type="button" className="acc-link-btn" onClick={() => onSelect(selected === r.name ? '' : r.name)}>{r.name}</button>
                </td>
                <td className="acc-col-num">{money(r.amount)}</td>
                <td className="acc-col-num">{total > 0 ? ((r.amount / total) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td style={{ fontWeight: 700 }}>Total</td><td className="acc-col-num" style={{ fontWeight: 700 }}>{money(total)}</td><td className="acc-col-num" style={{ fontWeight: 700 }}>100%</td></tr></tfoot>
        </table>
      </div>
    </>
  )
}

function StatCards({ cards }: { cards: { label: string; value: string; cls: string }[] }) {
  return (
    <div className="acc-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 14, marginBottom: 18 }}>
      {cards.map((c) => (
        <div key={c.label} className={`acc-stat ${c.cls}`}><div className="acc-stat-label">{c.label}</div><div className="acc-stat-value">{c.value}</div></div>
      ))}
    </div>
  )
}

export default function AccReport() {
  const [tab, setTab] = useState<Tab>('sales')
  const [range, setRange] = useState<DateRange>(thisMonthRange)
  // expense filters
  const [country, setCountry] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')

  const periodLabel = !range.from && !range.to
    ? 'All time'
    : range.from === range.to ? range.from : `${range.from || '…'} → ${range.to || '…'}`

  // ── Data ──
  const sales = useSalesReport({ from: range.from, to: range.to })
  const { data: vendors = [] } = useVendors()
  const { data: categories = [] } = useCategories('EXPENSE')
  const exp = useExpenseReport({ from: range.from, to: range.to, country, vendorId, category, subcategory })

  const salesSeries = (sales.data?.trend ?? []).map((t) => ({ label: t.label, value: t.amount }))
  const salesTotal = sales.data?.total ?? 0
  const salesCount = sales.data?.count ?? 0

  const expReport = exp.data
  const expTrend = (expReport?.trend ?? []).map((t) => ({ label: t.label, value: t.amount }))
  const byCategory = (expReport?.byCategory ?? []).map((c) => ({ name: c.categoryName, amount: c.amount }))
  const bySubcategory = (expReport?.bySubcategory ?? []).map((s) => ({ name: s.subcategoryName, amount: s.amount }))
  const expTotal = expReport?.total ?? 0
  const byCatTotal = expReport?.byCategoryTotal ?? 0
  const bySubTotal = expReport?.bySubcategoryTotal ?? 0
  const expCount = expReport?.count ?? 0

  const subOptions = categories.find((c) => c.name === category)?.subcategories ?? []

  const pickCategory = (name: string) => { setCategory(name); setSubcategory('') }

  const salesCards = [
    { label: 'Total Sales', value: money(salesTotal), cls: 'acc-stat--green' },
    { label: 'Invoices', value: String(salesCount), cls: 'acc-stat--blue' },
    { label: 'Avg / Invoice', value: money(salesCount > 0 ? salesTotal / salesCount : 0), cls: 'acc-stat--amber' },
  ]
  const expenseCards = [
    { label: 'Total Expenses', value: money(expTotal), cls: 'acc-stat--red' },
    { label: 'Expenses', value: String(expCount), cls: 'acc-stat--blue' },
    { label: 'Avg / Expense', value: money(expCount > 0 ? expTotal / expCount : 0), cls: 'acc-stat--amber' },
    { label: 'Categories', value: String(byCategory.length), cls: 'acc-stat--blue' },
  ]

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">{tab === 'sales' ? 'Sales Report' : 'Expense Report'}</h1><p className="acc-sub">Performance overview & analytics</p></div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Sales | Expenses separation */}
      <div className="acc-tabs">
        <button className={`acc-tab${tab === 'sales' ? ' active' : ''}`} onClick={() => setTab('sales')}>Sales</button>
        <button className={`acc-tab${tab === 'expenses' ? ' active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
      </div>

      {tab === 'sales' ? (
        <>
          <StatCards cards={salesCards} />
          <ChartCard title="Sales" subtitle={`${periodLabel}`}>
            {sales.isLoading ? <div className="acc-empty">Loading…</div>
              : salesSeries.length === 0 ? <div className="acc-empty">No data for this period.</div>
              : <TrendChart data={salesSeries} color={C.sales} />}
          </ChartCard>
        </>
      ) : (
        <>
          {/* expense filters apply to the whole tab */}
          <div className="acc-filter-bar">
            <div className="acc-field"><label>Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">All</option>{Object.entries(ACC_COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="acc-field" style={{ minWidth: 180 }}><label>Vendor</label>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">All vendors</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="acc-field" style={{ minWidth: 180 }}><label>Category</label>
              <select value={category} onChange={(e) => pickCategory(e.target.value)}>
                <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="acc-field" style={{ minWidth: 180 }}><label>Subcategory</label>
              <select value={subcategory} disabled={!category} onChange={(e) => setSubcategory(e.target.value)}>
                <option value="">{category ? 'All' : '—'}</option>{subOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            {(country || vendorId || category || subcategory) && (
              <div className="acc-field" style={{ alignSelf: 'flex-end' }}>
                <button className="acc-btn acc-btn-outline" onClick={() => { setCountry(''); setVendorId(''); setCategory(''); setSubcategory('') }}>Clear</button>
              </div>
            )}
          </div>

          <StatCards cards={expenseCards} />

          <ChartCard
            title={subcategory ? `Expenses · ${subcategory}` : category ? `Expenses · ${category}` : 'Expenses'}
            subtitle={`${periodLabel}${country ? ` · ${ACC_COUNTRY_LABELS[country as keyof typeof ACC_COUNTRY_LABELS]}` : ''}${vendorId ? ` · ${vendors.find((v) => v.id === vendorId)?.name ?? 'vendor'}` : ''}`}
          >
            {exp.isLoading ? <div className="acc-empty">Loading…</div>
              : expTrend.length === 0 ? <div className="acc-empty">No data for this period.</div>
              : <TrendChart data={expTrend} color={C.expenses} />}
          </ChartCard>

          <ChartCard title="Expenses by Category" subtitle={`${periodLabel} · Total ${money(byCatTotal)}`}>
            {exp.isLoading ? <div className="acc-empty">Loading…</div>
              : byCategory.length === 0 ? <div className="acc-empty">No expense data for this period.</div>
              : <BreakdownChart rows={byCategory} total={byCatTotal} selected={category} onSelect={pickCategory} nameKey="Category" label="Expenses" />}
          </ChartCard>

          <ChartCard
            title="Expenses by Subcategory"
            subtitle={`${category ? `Within ${category}` : 'All categories'} · ${periodLabel} · Total ${money(bySubTotal)}`}
          >
            {exp.isLoading ? <div className="acc-empty">Loading…</div>
              : bySubcategory.length === 0 ? <div className="acc-empty">No subcategory data for this period.</div>
              : <BreakdownChart rows={bySubcategory} total={bySubTotal} selected={subcategory} onSelect={setSubcategory} nameKey="Subcategory" label="Expenses" />}
          </ChartCard>
        </>
      )}
    </div>
  )
}
