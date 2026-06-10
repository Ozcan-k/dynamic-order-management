import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  type EmpReportRow,
} from '@dom/shared'
import { colors, radius, shadow, font } from '../../theme'
import { getReport, downloadReportExport } from '../../api/employeeSchedule'
import { DEPT_STYLE, addDays, todayStr } from './config'

type Period = 'week' | 'month'

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// shift the anchor by one period
function shift(period: Period, anchor: string, dir: 1 | -1): string {
  if (period === 'week') return addDays(anchor, dir * 7)
  const d = new Date(`${anchor}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() + dir)
  return d.toISOString().slice(0, 10)
}

const ChevLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
)
const ChevRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
)
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
)

export default function ReportTab() {
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState<string>(todayStr())

  const { data, isLoading } = useQuery({
    queryKey: ['emp', 'report', period, anchor],
    queryFn: () => getReport(period, anchor),
    staleTime: 15_000,
  })

  // maximum total hours for the inline bar scale
  const maxHours = useMemo(() => {
    if (!data) return 0
    return Math.max(1, ...data.rows.map((r) => r.totalHours))
  }, [data])

  const grouped = useMemo(() => {
    if (!data) return []
    return EMP_DEPARTMENT_ORDER
      .map((dept) => ({ dept, rows: data.rows.filter((r) => r.employee.department === dept) }))
      .filter((g) => g.rows.length > 0)
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Controls ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, boxShadow: shadow.card, padding: '12px 16px', flexWrap: 'wrap', gap: '12px',
      }}>
        {/* Period toggle */}
        <div style={{ display: 'flex', gap: '4px', background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '4px' }}>
          {(['week', 'month'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 18px', fontSize: '13px', fontWeight: 600, borderRadius: radius.md, border: 'none',
              background: period === p ? colors.surface : 'transparent',
              color: period === p ? colors.primary : colors.textSecondary,
              cursor: 'pointer', boxShadow: period === p ? shadow.card : 'none',
            }}>{p === 'week' ? 'Weekly' : 'Monthly'}</button>
          ))}
        </div>

        {/* Period navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setAnchor((a) => shift(period, a, -1))} style={navBtn}><ChevLeft /></button>
          <div style={{ minWidth: 170, textAlign: 'center', fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>
            {data?.label ?? '—'}
          </div>
          <button onClick={() => setAnchor((a) => shift(period, a, 1))} style={navBtn}><ChevRight /></button>
          <button onClick={() => setAnchor(todayStr())} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: '12px', fontWeight: 600 }}>
            {period === 'week' ? 'This Week' : 'This Month'}
          </button>
        </div>

        {/* Exports */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => downloadReportExport('csv', period, anchor)} style={exportBtn(colors.textSecondary, colors.border)}>
            <DownloadIcon /> CSV
          </button>
          <button onClick={() => downloadReportExport('pdf', period, anchor)} style={exportBtn('#b91c1c', '#fca5a5', '#fff5f5')}>
            <DownloadIcon /> PDF
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <div style={{ textAlign: 'center', padding: '48px', color: colors.textSecondary }}>Loading report…</div>
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <SummaryCard label="Employees" value={data.totals.employees} color={colors.primary} />
            <SummaryCard label="Worked Days" value={fmtNum(data.totals.workedDays)} color={colors.success} />
            <SummaryCard label="Total Hours" value={fmtNum(data.totals.totalHours)} color="#6366f1" />
            <SummaryCard label="OT Hours" value={fmtNum(data.totals.otHours)} color={colors.warning} />
          </div>

          {/* ── Report table ── */}
          {data.totals.employees === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: colors.textSecondary, background: colors.surface, border: `1px dashed ${colors.borderStrong}`, borderRadius: radius.xl }}>
              No employees to report. Add employees first.
            </div>
          ) : (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.xl, boxShadow: shadow.card, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: 1000 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border}`, background: colors.surfaceAlt }}>
                      <th style={th('left')}>ID</th>
                      <th style={th('left')}>Name</th>
                      <th style={th()}>Present</th>
                      <th style={th()}>Half Day</th>
                      <th style={th()}>Absent</th>
                      <th style={th()}>Day Off</th>
                      <th style={th()}>Vacation</th>
                      <th style={th()}>Sick</th>
                      <th style={th()}>Maternity</th>
                      <th style={th()}>OT (h)</th>
                      <th style={th()}>Worked Days</th>
                      <th style={{ ...th(), minWidth: 150 }}>Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g) => {
                      const ds = DEPT_STYLE[g.dept]
                      const sub = subtotal(g.rows)
                      return (
                        <DeptSection key={g.dept} label={EMP_DEPARTMENT_LABEL[g.dept]} ds={ds} rows={g.rows} sub={sub} maxHours={maxHours} />
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${colors.textPrimary}`, background: colors.surfaceAlt }}>
                      <td style={{ ...td('left'), fontWeight: 800 }} colSpan={2}>GRAND TOTAL</td>
                      <td style={td()} /><td style={td()} /><td style={td()} /><td style={td()} /><td style={td()} /><td style={td()} /><td style={td()} />
                      <td style={{ ...td(), fontWeight: 800, color: colors.warning }}>{fmtNum(data.totals.otHours)}</td>
                      <td style={{ ...td(), fontWeight: 800, color: colors.success }}>{fmtNum(data.totals.workedDays)}</td>
                      <td style={{ ...td(), fontWeight: 800, color: colors.textPrimary }}>{fmtNum(data.totals.totalHours)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div style={{ fontSize: '11px', color: colors.textMuted, padding: '0 4px' }}>
            Worked Days = Present + 0.5 × Half Day&nbsp;&nbsp;·&nbsp;&nbsp;Total Hours = 8 × Present + 4 × Half Day + OT
          </div>
        </>
      )}
    </div>
  )
}

// ─── Department section (rows + subtotal) ────────────────────────────────────
interface Sub { present: number; halfDay: number; absent: number; dayOff: number; vacation: number; sick: number; maternity: number; otHours: number; workedDays: number; totalHours: number }
function subtotal(rows: EmpReportRow[]): Sub {
  return rows.reduce((a, r) => ({
    present: a.present + r.present, halfDay: a.halfDay + r.halfDay, absent: a.absent + r.absent, dayOff: a.dayOff + r.dayOff,
    vacation: a.vacation + r.vacation, sick: a.sick + r.sick, maternity: a.maternity + r.maternity,
    otHours: a.otHours + r.otHours, workedDays: a.workedDays + r.workedDays, totalHours: a.totalHours + r.totalHours,
  }), { present: 0, halfDay: 0, absent: 0, dayOff: 0, vacation: 0, sick: 0, maternity: 0, otHours: 0, workedDays: 0, totalHours: 0 })
}

function DeptSection({ label, ds, rows, sub, maxHours }: {
  label: string; ds: typeof DEPT_STYLE[keyof typeof DEPT_STYLE]; rows: EmpReportRow[]; sub: Sub; maxHours: number
}) {
  return (
    <>
      <tr>
        <td colSpan={12} style={{ padding: '8px 16px', background: ds.band, color: ds.bandText, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={r.employee.id} style={{ background: i % 2 === 0 ? colors.surface : colors.surfaceAlt, borderBottom: `1px solid ${colors.border}` }}>
          <td style={{ ...td('left'), fontWeight: 700, color: ds.accent, fontVariantNumeric: 'tabular-nums' }}>#{r.employee.empNo}</td>
          <td style={{ ...td('left'), fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap' }}>{r.employee.firstName} {r.employee.lastName}</td>
          <td style={{ ...td(), color: r.present ? colors.success : colors.textMuted, fontWeight: r.present ? 700 : 400 }}>{r.present}</td>
          <td style={td()}>{r.halfDay || <span style={{ color: colors.textMuted }}>0</span>}</td>
          <td style={{ ...td(), color: r.absent ? colors.danger : colors.textMuted }}>{r.absent}</td>
          <td style={{ ...td(), color: r.dayOff ? '#475569' : colors.textMuted, fontWeight: r.dayOff ? 600 : 400 }}>{r.dayOff}</td>
          <td style={td()}>{r.vacation || <span style={{ color: colors.textMuted }}>0</span>}</td>
          <td style={td()}>{r.sick || <span style={{ color: colors.textMuted }}>0</span>}</td>
          <td style={td()}>{r.maternity || <span style={{ color: colors.textMuted }}>0</span>}</td>
          <td style={{ ...td(), color: r.otHours ? colors.warning : colors.textMuted, fontWeight: r.otHours ? 700 : 400 }}>{r.otHours}</td>
          <td style={{ ...td(), fontWeight: 700, color: colors.textPrimary }}>{fmtNum(r.workedDays)}</td>
          <td style={td()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
              <div style={{ flex: 1, height: 7, borderRadius: 4, background: colors.surfaceAlt, overflow: 'hidden', maxWidth: 90 }}>
                <div style={{ width: `${(r.totalHours / maxHours) * 100}%`, height: '100%', background: ds.accent, borderRadius: 4 }} />
              </div>
              <span style={{ fontWeight: 700, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{fmtNum(r.totalHours)}</span>
            </div>
          </td>
        </tr>
      ))}
      <tr style={{ background: ds.soft, borderBottom: `1px solid ${colors.border}` }}>
        <td style={{ ...td('left'), fontWeight: 700, color: ds.bandText }} colSpan={2}>Subtotal</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.present}</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.halfDay}</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.absent}</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.dayOff}</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.vacation}</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.sick}</td>
        <td style={{ ...td(), fontWeight: 600 }}>{sub.maternity}</td>
        <td style={{ ...td(), fontWeight: 700, color: colors.warning }}>{fmtNum(sub.otHours)}</td>
        <td style={{ ...td(), fontWeight: 700, color: colors.success }}>{fmtNum(sub.workedDays)}</td>
        <td style={{ ...td(), fontWeight: 700, color: colors.textPrimary }}>{fmtNum(sub.totalHours)}</td>
      </tr>
    </>
  )
}

// ─── Bits ────────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, boxShadow: shadow.card, padding: '16px 20px' }}>
      <div style={{ fontSize: font.xs, color: colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

const th = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
  padding: '10px 14px', textAlign: align, fontSize: '11px', fontWeight: 700,
  color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
})
const td = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
  padding: '9px 14px', textAlign: align, fontSize: '13px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
})
const navBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: radius.md, border: `1.5px solid ${colors.border}`, background: colors.surface, color: colors.textSecondary, cursor: 'pointer',
}
function exportBtn(color: string, borderC: string, bg = colors.surface): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
    borderRadius: radius.md, border: `1.5px solid ${borderC}`, background: bg, color, cursor: 'pointer',
  }
}
