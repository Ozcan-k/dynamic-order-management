// Accounting home (v2.100.0): who owes what, how late it is, and when money came in.
// Everything is "as of today (Manila)" — no date picker on purpose; the Report page is
// where periods are compared.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { ACC_AGING_LABELS, type AccAgingBucket, type AccDebtor } from '@dom/shared'
import { money, PESO, useReceivablesOverview } from '../../api/accounting'
import AccIcon from '../../components/accounting/AccIcon'
import { AGING_COLOR, SERIES_COLOR } from '../../components/accounting/paymentUtils'

const fmtAsOf = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return PESO + (n / 1_000_000).toFixed(1) + 'M'
  if (a >= 1_000) return PESO + Math.round(n / 1_000) + 'k'
  return PESO + Math.round(n)
}

export default function AccOverview() {
  const navigate = useNavigate()
  const { data, isLoading } = useReceivablesOverview()
  const [asTable, setAsTable] = useState(false)

  if (isLoading || !data) return <div className="acc-page acc-v3"><div className="acc-empty">Loading…</div></div>

  const latePct = data.owed > 0 ? Math.round((data.late / data.owed) * 100) : 0
  const debtorMax = Math.max(1, ...data.debtors.map((d) => d.owed))
  const openDebtor = (d: AccDebtor) => d.customerId
    ? navigate(`/accounting/customers/${d.customerId}`)
    : navigate(`/accounting/sales?search=${encodeURIComponent(d.name)}`)

  return (
    <div className="acc-page acc-v3">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Overview</h1><p className="acc-sub">Money owed to you and money coming in, as of {fmtAsOf(data.asOf)} (Manila)</p></div>
        <div className="acc-actions">
          <Link className="acc-btn acc-btn-outline" to="/accounting/report">Report</Link>
          <button className="acc-btn acc-btn-primary" onClick={() => navigate('/accounting/sales/new')}><AccIcon name="plus" />New Invoice</button>
        </div>
      </div>

      <div className="acc-money" aria-label="Summary as of today">
        <div className={data.owed > 0 ? 'is-warn' : ''}><span>Customers owe you</span><b>{money(data.owed)}</b><small>{data.openCount} open invoice{data.openCount === 1 ? '' : 's'}</small></div>
        <div className={data.late > 0 ? 'is-bad' : ''}><span>Of that, late</span><b>{money(data.late)}</b><small>{data.lateCount} invoice{data.lateCount === 1 ? '' : 's'} · {latePct}%</small></div>
        <div><span><i className="acc-dot acc-dot--collected" />Collected this month</span><b>{money(data.collectedThisMonth)}</b><small>{data.collectedThisMonthCount} payment{data.collectedThisMonthCount === 1 ? '' : 's'} · by payment date</small></div>
        {data.payables
          ? <div className={data.payables.late > 0 ? 'is-bad' : ''}><span>You owe vendors</span><b>{money(data.payables.owed)}</b><small>{data.payables.count} unpaid expense{data.payables.count === 1 ? '' : 's'}{data.payables.lateCount ? ` · ${data.payables.lateCount} late` : ''}</small></div>
          : <div><span>Open invoices</span><b>{data.debtorCount}</b><small>customer{data.debtorCount === 1 ? '' : 's'} with a balance</small></div>}
      </div>

      <div className="acc-ov">
        <section className="acc-card" aria-labelledby="acc-aging-h">
          <div className="acc-sec-h"><h2 id="acc-aging-h">How late is the money owed</h2><small>{money(data.owed)} total</small></div>
          {data.owed <= 0 ? (
            <div className="acc-empty-pay"><AccIcon name="ok" size={22} /><p>Nothing is owed right now. Every invoice is fully paid.</p></div>
          ) : (
            <div className="acc-aging">
              <div className="acc-aging-bar" role="img"
                aria-label={data.aging.map((a) => `${ACC_AGING_LABELS[a.bucket]} ${money(a.amount)}`).join(', ')}>
                {data.aging.filter((a) => a.amount > 0).map((a) => (
                  <i key={a.bucket} style={{ flexGrow: a.amount, background: AGING_COLOR[a.bucket as AccAgingBucket] }} title={`${ACC_AGING_LABELS[a.bucket]}: ${money(a.amount)}`} />
                ))}
              </div>
              <ul className="acc-aging-leg">
                {data.aging.map((a) => (
                  <li key={a.bucket}>
                    <span><i className="acc-dot" style={{ background: AGING_COLOR[a.bucket] }} />{ACC_AGING_LABELS[a.bucket]}</span>
                    <b>{money(a.amount)}</b>
                    <small>{data.owed > 0 ? Math.round((a.amount / data.owed) * 100) : 0}% · {a.count} invoice{a.count === 1 ? '' : 's'}</small>
                  </li>
                ))}
              </ul>
              {data.lateCount > 0 && (
                <Link className="acc-text-link" to="/accounting/sales?late=1">See the {data.lateCount} late invoice{data.lateCount === 1 ? '' : 's'} →</Link>
              )}
            </div>
          )}
        </section>

        <section className="acc-card" aria-labelledby="acc-debt-h">
          <div className="acc-sec-h"><h2 id="acc-debt-h">Who owes the most</h2><small>Open balance · late part darker</small></div>
          {data.debtors.length === 0 ? (
            <div className="acc-empty-pay"><p>No customer has an open balance.</p></div>
          ) : (
            <ul className="acc-debtors">
              {data.debtors.map((d) => (
                <li key={(d.customerId ?? '') + d.name}>
                  <button type="button" onClick={() => openDebtor(d)} title={d.customerId ? 'Open statement' : 'Show this customer’s invoices'}>
                    <span className="acc-debtor-name">{d.name}<small>{d.invoices} invoice{d.invoices === 1 ? '' : 's'}{d.late > 0 ? ` · ${money(d.late)} late` : ''}</small></span>
                    <span className="acc-debtor-track" aria-hidden="true">
                      {d.late > 0 && <i style={{ width: `${(d.late / debtorMax) * 100}%`, background: AGING_COLOR.d1_30 }} />}
                      <i style={{ width: `${((d.owed - d.late) / debtorMax) * 100}%`, background: AGING_COLOR.notDue }} />
                    </span>
                    <b>{money(d.owed)}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.debtorCount > data.debtors.length && <p className="acc-card-note">Top {data.debtors.length} of {data.debtorCount} customers with a balance.</p>}
        </section>

        <section className="acc-card acc-ov-wide" aria-labelledby="acc-trend-h">
          <div className="acc-sec-h">
            <h2 id="acc-trend-h">Invoiced vs collected</h2>
            <small>Last 6 months · invoiced by issue date, collected by payment date</small>
          </div>
          {asTable ? (
            <div className="acc-scroll-x" style={{ padding: '4px 18px 6px' }}>
              <table>
                <thead><tr><th>Month</th><th className="acc-col-num">Invoiced</th><th className="acc-col-num">Collected</th><th className="acc-col-num">Collected / invoiced</th></tr></thead>
                <tbody>
                  {data.trend.map((t) => (
                    <tr key={t.month}><td>{t.label} {t.month.slice(0, 4)}</td><td className="acc-col-num">{money(t.invoiced)}</td><td className="acc-col-num">{money(t.collected)}</td>
                      <td className="acc-col-num">{t.invoiced > 0 ? `${Math.round((t.collected / t.invoiced) * 100)}%` : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="acc-chart-box" role="img" aria-label={data.trend.map((t) => `${t.label}: invoiced ${money(t.invoiced)}, collected ${money(t.collected)}`).join('; ')}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.trend} margin={{ top: 10, right: 12, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
                  <CartesianGrid stroke="#94a3b8" strokeOpacity={0.18} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#475569' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.14)' }} content={<TrendTip />} />
                  <Bar dataKey="invoiced" name="Invoiced" fill={SERIES_COLOR.invoiced} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="collected" name="Collected" fill={SERIES_COLOR.collected} radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="acc-legend">
            <span><i className="acc-dot" style={{ background: SERIES_COLOR.invoiced }} />Invoiced</span>
            <span><i className="acc-dot" style={{ background: SERIES_COLOR.collected }} />Collected</span>
            <button type="button" className="acc-text-link" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? 'View as chart' : 'View as table'}</button>
          </div>
        </section>
      </div>
    </div>
  )
}

function TrendTip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; month: string; invoiced: number; collected: number } }[] }) {
  if (!active || !payload?.length) return null
  const t = payload[0].payload
  return (
    <div className="acc-chart-tip">
      <b>{t.label} {t.month.slice(0, 4)}</b>
      <div><span><i className="acc-dot" style={{ background: SERIES_COLOR.invoiced }} />Invoiced</span><span>{money(t.invoiced)}</span></div>
      <div><span><i className="acc-dot" style={{ background: SERIES_COLOR.collected }} />Collected</span><span>{money(t.collected)}</span></div>
      {t.invoiced > 0 && <div className="muted"><span>Collected / invoiced</span><span>{Math.round((t.collected / t.invoiced) * 100)}%</span></div>}
    </div>
  )
}
