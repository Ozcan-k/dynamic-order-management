import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ACC_COUNTRY_LABELS } from '@dom/shared'
import {
  useReport, useYearlyReport, useExpenseReport, useVendors, money, PESO,
} from '../../api/accounting'

type Tab = 'sales' | 'expenses'
type Mode = 'monthly' | 'yearly'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const C = { sales: '#16a34a', expenses: '#dc2626' }
const CAT_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea']

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
  const now = new Date()
  const [tab, setTab] = useState<Tab>('sales')
  const [mode, setMode] = useState<Mode>('monthly')
  const [month, setMonth] = useState(() => now.toISOString().slice(0, 7))
  const [year, setYear] = useState(() => now.getFullYear())
  // expense filters
  const [country, setCountry] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [category, setCategory] = useState('')

  const periodLabel = mode === 'monthly' ? month : String(year)
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i)

  // ── Sales tab data ──
  const monthly = useReport(month)
  const yearly = useYearlyReport(year)
  // ── Expenses tab data (filtered) ──
  const { data: vendors = [] } = useVendors()
  const exp = useExpenseReport({ mode, month: mode === 'monthly' ? month : undefined, year: mode === 'yearly' ? year : Number(month.slice(0, 4)), country, vendorId, category })

  const salesSeries = useMemo(() => {
    if (mode === 'monthly') return (monthly.data?.byDay ?? []).map((d) => ({ label: String(d.day), value: d.sales }))
    return (yearly.data?.byMonth ?? []).map((m) => ({ label: MONTHS[m.month - 1], value: m.sales }))
  }, [mode, monthly.data, yearly.data])

  const salesTotal = (mode === 'monthly' ? monthly.data?.totalSales : yearly.data?.totalSales) ?? 0
  const salesCount = (mode === 'monthly' ? monthly.data?.sales.length : yearly.data?.salesCount) ?? 0
  const salesLoading = mode === 'monthly' ? monthly.isLoading : yearly.isLoading

  const expReport = exp.data
  const expTrend = (expReport?.trend ?? []).map((t) => ({ label: t.label, value: t.amount }))
  const byCategory = expReport?.byCategory ?? []
  const bySubcategory = expReport?.bySubcategory ?? []
  const expTotal = expReport?.total ?? 0
  const byCatTotal = expReport?.byCategoryTotal ?? 0
  const expCount = expReport?.count ?? 0

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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="acc-tabs" style={{ margin: 0 }}>
            <button className={`acc-tab${mode === 'monthly' ? ' active' : ''}`} onClick={() => setMode('monthly')}>Monthly</button>
            <button className={`acc-tab${mode === 'yearly' ? ' active' : ''}`} onClick={() => setMode('yearly')}>Yearly</button>
          </div>
          {mode === 'monthly'
            ? <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} />
            : <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        </div>
      </div>

      {/* Sales | Expenses separation */}
      <div className="acc-tabs">
        <button className={`acc-tab${tab === 'sales' ? ' active' : ''}`} onClick={() => setTab('sales')}>Sales</button>
        <button className={`acc-tab${tab === 'expenses' ? ' active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
      </div>

      {tab === 'sales' ? (
        <>
          <StatCards cards={salesCards} />
          <ChartCard title="Sales" subtitle={mode === 'monthly' ? `Daily breakdown — ${periodLabel}` : `Monthly breakdown — ${periodLabel}`}>
            {salesLoading ? <div className="acc-empty">Loading…</div>
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
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>{(expReport?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(country || vendorId || category) && (
              <div className="acc-field" style={{ alignSelf: 'flex-end' }}>
                <button className="acc-btn acc-btn-outline" onClick={() => { setCountry(''); setVendorId(''); setCategory('') }}>Clear</button>
              </div>
            )}
          </div>

          <StatCards cards={expenseCards} />

          <ChartCard
            title={category ? `Expenses · ${category}` : 'Expenses'}
            subtitle={`${mode === 'monthly' ? `Daily breakdown — ${periodLabel}` : `Monthly breakdown — ${periodLabel}`}${country ? ` · ${ACC_COUNTRY_LABELS[country as keyof typeof ACC_COUNTRY_LABELS]}` : ''}${vendorId ? ` · ${vendors.find((v) => v.id === vendorId)?.name ?? 'vendor'}` : ''}`}
          >
            {exp.isLoading ? <div className="acc-empty">Loading…</div>
              : expTrend.length === 0 ? <div className="acc-empty">No data for this period.</div>
              : <TrendChart data={expTrend} color={C.expenses} />}
          </ChartCard>

          <ChartCard title="Expenses by Category" subtitle={`Breakdown for ${periodLabel} · Total ${money(byCatTotal)}`}>
            {exp.isLoading ? <div className="acc-empty">Loading…</div>
              : byCategory.length === 0 ? <div className="acc-empty">No expense data for this period.</div>
              : (
                <ResponsiveContainer width="100%" height={Math.max(180, byCategory.length * 38 + 30)}>
                  <BarChart data={byCategory} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 12, fill: '#334155' }} width={130} />
                    <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                    <Bar dataKey="amount" name="Expenses" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {byCategory.map((c, i) => <Cell key={i} fill={category && category !== c.categoryName ? '#cbd5e1' : CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

            {byCategory.length > 0 && (
              <div className="acc-table-wrap" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>Category</th><th className="acc-col-num">Amount</th><th className="acc-col-num">% of total</th></tr></thead>
                  <tbody>
                    {byCategory.map((c, i) => (
                      <tr key={c.categoryName} style={category === c.categoryName ? { background: '#f1f5f9' } : undefined}>
                        <td>
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[i % CAT_COLORS.length], marginRight: 8, verticalAlign: 'middle' }} />
                          <button type="button" className="acc-link-btn" onClick={() => setCategory(category === c.categoryName ? '' : c.categoryName)}>{c.categoryName}</button>
                        </td>
                        <td className="acc-col-num">{money(c.amount)}</td>
                        <td className="acc-col-num">{byCatTotal > 0 ? ((c.amount / byCatTotal) * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td style={{ fontWeight: 700 }}>Total</td><td className="acc-col-num" style={{ fontWeight: 700 }}>{money(byCatTotal)}</td><td className="acc-col-num" style={{ fontWeight: 700 }}>100%</td></tr></tfoot>
                </table>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="Expenses by Subcategory"
            subtitle={`${category ? `Within ${category}` : 'All categories'} · ${periodLabel} · Total ${money(expTotal)}`}
          >
            {exp.isLoading ? <div className="acc-empty">Loading…</div>
              : bySubcategory.length === 0 ? <div className="acc-empty">No subcategory data for this period.</div>
              : (
                <ResponsiveContainer width="100%" height={Math.max(180, bySubcategory.length * 38 + 30)}>
                  <BarChart data={bySubcategory} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="subcategoryName" tick={{ fontSize: 12, fill: '#334155' }} width={140} />
                    <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                    <Bar dataKey="amount" name="Expenses" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {bySubcategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
          </ChartCard>
        </>
      )}
    </div>
  )
}
