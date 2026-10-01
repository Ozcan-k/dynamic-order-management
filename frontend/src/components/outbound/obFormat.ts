// Number / Manila time formatting for the Outbound pages (v2.98.0).

export function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  const v = (part / whole) * 100
  return v > 0 && v < 1 ? '<1%' : `${Math.round(v)}%`
}

/** "30 Sep 2026, 14:05" in Manila. "—" for null. */
export function fmtManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** "30 Sep, 14:05" in Manila. */
export function fmtManilaShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** 45s → "<1m", 14m, 2h 05m, 3d 4h. */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—'
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return '<1m'
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}
