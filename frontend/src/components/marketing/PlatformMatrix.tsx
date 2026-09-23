import { CONTENT_POST_TYPE_LABELS, SALES_PLATFORM_LABELS, type ContentPostType, type SalesPlatform } from '@dom/shared'
import type { AnalyticsBreakdowns } from '../../api/marketing'
import { ChartCard, Empty } from './chartKit'
import { formatInt, formatPct } from './format'
import { RampLegend } from './HeatGrid'
import { completionLevel, CONTENT_RAMP, OTHER, PLATFORM_COLOR } from './palette'

const POST_TYPES = Object.keys(CONTENT_POST_TYPE_LABELS) as ContentPostType[]

/** Completion of each mandatory platform × post-type slot. */
export default function PlatformMatrix({ matrix, loading }: { matrix?: AnalyticsBreakdowns['contentMatrix']; loading: boolean }) {
  const cells = matrix ?? []
  const platforms = [...new Set(cells.map((m) => m.platform))]

  return (
    <ChartCard title="Platform × post type" sub="Completion of each mandatory slot">
      {loading ? <div className="mkt-chart-skeleton" style={{ height: 220 }} /> : cells.every((m) => m.required === 0) ? (
        <Empty title="No store reports in this range" />
      ) : (
        <div className="mkt-matrix-wrap">
          <table className="mkt-matrix">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Platform</span></th>
                {POST_TYPES.map((t) => <th key={t} scope="col">{CONTENT_POST_TYPE_LABELS[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p}>
                  <th scope="row">
                    <span className="mkt-swatch mkt-swatch--dot" style={{ background: PLATFORM_COLOR[p] ?? OTHER }} />
                    {SALES_PLATFORM_LABELS[p as SalesPlatform] ?? p}
                  </th>
                  {POST_TYPES.map((t) => {
                    const cell = cells.find((m) => m.platform === p && m.postType === t)
                    if (!cell) return <td key={t} className="mkt-matrix-na" aria-label="Not required">·</td>
                    const rate = cell.required ? cell.completed / cell.required : 0
                    const lvl = completionLevel(rate)
                    return (
                      <td key={t}>
                        <span
                          className="mkt-matrix-cell"
                          style={{ background: CONTENT_RAMP[lvl], color: lvl >= 3 ? '#fff' : '#2e1065' }}
                          title={`${cell.completed} of ${cell.required}`}
                        >
                          <strong>{formatPct(rate)}</strong>
                          <small>{formatInt(cell.completed)}/{formatInt(cell.required)}</small>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <RampLegend ramp={CONTENT_RAMP} low="0%" high="100%" extra={<span className="mkt-ramp-extra">· = not a mandatory slot</span>} />
        </div>
      )}
    </ChartCard>
  )
}
