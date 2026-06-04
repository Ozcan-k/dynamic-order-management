import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useReport, useYearlyReport, useExpenseCategoryReport, money, PESO } from '../../api/accounting'

type Mode = 'monthly' | 'yearly'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const C = { sales: '#16a34a', expenses: '#dc2626', net: '#2563eb' }
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

export default function AccReport() {
  const now = new Date()
  const [mode, setMode] = useState<Mode>('monthly')
  const [month, setMonth] = useState(() => now.toISOString().slice(0, 7))
  const [year, setYear] = useState(() => now.getFullYear())
  const [category, setCategory] = useState('') // '' = All

  // active year drives the category analytics
  const activeYear = mode === 'monthly' ? Number(month.slice(0, 4)) : year

  const monthly = useReport(month)
  const yearly = useYearlyReport(year)
  const catRep = useExpenseCategoryReport(activeYear, category)

  const loadingHero = mode === 'monthly' ? monthly.isLoading : yearly.isLoading

  // ── period totals (stat cards) ──
  const totals = mode === 'monthly'
    ? { sales: monthly.data?.totalSales ?? 0, expenses: monthly.data?.totalExpenses ?? 0, net: monthly.data?.net ?? 0, records: (monthly.data?.sales.length ?? 0) + (monthly.data?.expenses.length ?? 0) }
    : { sales: yearly.data?.totalSales ?? 0, expenses: yearly.data?.totalExpenses ?? 0, net: yearly.data?.net ?? 0, records: (yearly.data?.salesCount ?? 0) + (yearly.data?.expenseCount ?? 0) }

  // ── hero chart data (Sales vs Expenses + Net) ──
  const heroData = useMemo(() => {
    if (mode === 'monthly') return (monthly.data?.byDay ?? []).map((d) => ({ label: String(d.day), sales: d.sales, expenses: d.expenses, net: d.sales - d.expenses }))
    return (yearly.data?.byMonth ?? []).map((m) => ({ label: MONTHS[m.month - 1], sales: m.sales, expenses: m.expenses, net: m.net }))
  }, [mode, monthly.data, yearly.data])

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i)
  const catData = catRep.data
  const byCategory = catData?.byCategory ?? []
  const catMonthly = (catData?.byMonth ?? []).map((m) => ({ label: MONTHS[m.month - 1], amount: m.amount }))
  const catTotal = catData?.total ?? 0

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Sales / Expense Report</h1><p className="acc-sub">Performance overview & analytics</p></div>
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

      {/* summary */}
      <div className="acc-grid acc-grid-4" style={{ marginBottom: 18 }}>
        <div className="acc-stat acc-stat--green"><div className="acc-stat-label">Total Sales</div><div className="acc-stat-value pos">{money(totals.sales)}</div></div>
        <div className="acc-stat acc-stat--red"><div className="acc-stat-label">Total Expenses</div><div className="acc-stat-value neg">{money(totals.expenses)}</div></div>
        <div className="acc-stat acc-stat--blue"><div className="acc-stat-label">Net Profit</div><div className={`acc-stat-value ${totals.net >= 0 ? 'pos' : 'neg'}`}>{money(totals.net)}</div></div>
        <div className="acc-stat acc-stat--amber"><div className="acc-stat-label">Records</div><div className="acc-stat-value">{totals.records}</div></div>
      </div>

      {/* hero: Sales vs Expenses */}
      <ChartCard title="Sales vs Expenses" subtitle={mode === 'monthly' ? `Daily breakdown — ${month}` : `Monthly breakdown — ${year}`}>
        {loadingHero ? <div className="acc-empty">Loading…</div> : heroData.length === 0 ? <div className="acc-empty">No data for this period.</div> : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={heroData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} width={56} />
              <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="sales" name="Sales" fill={C.sales} radius={[4, 4, 0, 0]} maxBarSize={mode === 'yearly' ? 26 : 14} />
              <Bar dataKey="expenses" name="Expenses" fill={C.expenses} radius={[4, 4, 0, 0]} maxBarSize={mode === 'yearly' ? 26 : 14} />
              <Line type="monotone" dataKey="net" name="Net" stroke={C.net} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* expenses by category */}
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
            // selected category → 12-month trend
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={catMonthly} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#64748b' }} width={56} />
                <Tooltip formatter={tip} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="amount" name={category} fill={C.expenses} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            // all categories → ranked horizontal bars
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

        {/* numeric breakdown table */}
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
    </div>
  )
}
