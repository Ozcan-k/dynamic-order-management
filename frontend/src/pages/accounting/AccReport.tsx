import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useReport, useYearlyReport, useExpenseCategoryReport, money, PESO } from '../../api/accounting'

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

export default function AccReport() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('sales')
  const [mode, setMode] = useState<Mode>('monthly')
  const [month, setMonth] = useState(() => now.toISOString().slice(0, 7))
  const [year, setYear] = useState(() => now.getFullYear())
  const [category, setCategory] = useState('') // '' = All

  const activeYear = mode === 'monthly' ? Number(month.slice(0, 4)) : year
  const periodLabel = mode === 'monthly' ? month : String(year)

  const monthly = useReport(month)
  const yearly = useYearlyReport(year)
  const catRep = useExpenseCategoryReport(activeYear, category) // only used on the Expenses tab

  const loading = mode === 'monthly' ? monthly.isLoading : yearly.isLoading
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i)

  // ── per-tab single-series chart data ──
  const seriesData = useMemo(() => {
    const key = tab === 'sales' ? 'sales' : 'expenses'
    if (mode === 'monthly') return (monthly.data?.byDay ?? []).map((d) => ({ label: String(d.day), value: (d as any)[key] }))
    return (yearly.data?.byMonth ?? []).map((m) => ({ label: MONTHS[m.month - 1], value: (m as any)[key] }))
  }, [tab, mode, monthly.data, yearly.data])

  // ── per-tab totals ──
  const total = tab === 'sales'
    ? (mode === 'monthly' ? monthly.data?.totalSales : yearly.data?.totalSales) ?? 0
    : (mode === 'monthly' ? monthly.data?.totalExpenses : yearly.data?.totalExpenses) ?? 0
  const count = tab === 'sales'
    ? (mode === 'monthly' ? monthly.data?.sales.length : yearly.data?.salesCount) ?? 0
    : (mode === 'monthly' ? monthly.data?.expenses.length : yearly.data?.expenseCount) ?? 0
  const avg = count > 0 ? total / count : 0

  // category analytics (Expenses tab)
  const catData = catRep.data
  const byCategory = catData?.byCategory ?? []
  const catMonthly = (catData?.byMonth ?? []).map((m) => ({ label: MONTHS[m.month - 1], value: m.amount }))
  const catTotal = catData?.total ?? 0

  const accent = tab === 'sales' ? C.sales : C.expenses

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

      {/* summary (tab-specific) */}
      <div className="acc-grid acc-grid-4" style={{ marginBottom: 18 }}>
        <div className={`acc-stat ${tab === 'sales' ? 'acc-stat--green' : 'acc-stat--red'}`}>
          <div className="acc-stat-label">{tab === 'sales' ? 'Total Sales' : 'Total Expenses'}</div>
          <div className={`acc-stat-value ${tab === 'sales' ? 'pos' : 'neg'}`}>{money(total)}</div>
        </div>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">{tab === 'sales' ? 'Invoices' : 'Expenses'}</div><div className="acc-stat-value">{count}</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">{tab === 'sales' ? 'Avg / Invoice' : 'Avg / Expense'}</div><div className="acc-stat-value">{money(avg)}</div></div>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">{tab === 'sales' ? 'Categories' : 'Categories'}</div><div className="acc-stat-value">{tab === 'expenses' ? byCategory.length : '—'}</div></div>
      </div>

      {/* trend chart (single series, separate per tab) */}
      <ChartCard
        title={tab === 'sales' ? 'Sales' : 'Expenses'}
        subtitle={mode === 'monthly' ? `Daily breakdown — ${periodLabel}` : `Monthly breakdown — ${periodLabel}`}
      >
        {loading ? <div className="acc-empty">Loading…</div>
          : seriesData.length === 0 ? <div className="acc-empty">No data for this period.</div>
          : <TrendChart data={seriesData} color={accent} />}
      </ChartCard>

      {/* Expenses-only: by category */}
      {tab === 'expenses' && (
        <ChartCard
          title="Expenses by Category"
          subtitle={category ? `“${category}” monthly trend — ${activeYear}` : `Breakdown for ${activeYear} · Total ${money(catTotal)}`}
        >
          <div className="acc-filter-bar" style={{ marginBottom: 14 }}>
            <div className="acc-field" style={{ minWidth: 220 }}><label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {(catData?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="acc-field"><label>Year</label>
              {mode === 'monthly'
                ? <input value={activeYear} disabled style={{ width: 110 }} />
                : <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
            </div>
          </div>

          {catRep.isLoading ? <div className="acc-empty">Loading…</div>
            : byCategory.length === 0 ? <div className="acc-empty">No expense data for {activeYear}.</div>
            : category ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={catMonthly} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} width={56} />
                  <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="value" name={category} fill={C.expenses} radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, byCategory.length * 38 + 30)}>
                <BarChart data={byCategory} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                  <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 12, fill: '#334155' }} width={130} />
                  <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="amount" name="Expenses" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
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
                      <td className="acc-col-num">{catTotal > 0 ? ((c.amount / catTotal) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td style={{ fontWeight: 700 }}>Total</td><td className="acc-col-num" style={{ fontWeight: 700 }}>{money(catTotal)}</td><td className="acc-col-num" style={{ fontWeight: 700 }}>100%</td></tr></tfoot>
              </table>
            </div>
          )}
        </ChartCard>
      )}
    </div>
  )
}
