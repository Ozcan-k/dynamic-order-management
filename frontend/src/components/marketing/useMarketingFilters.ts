import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AnalyticsFilter } from '../../api/marketing'
import { shiftDate, todayManila } from './format'

// Marketing Report filter state lives in the URL (?range=30&agents=a,b&stores=x&tab=content)
// so a view can be refreshed, bookmarked and shared.

export const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: 'mtd', label: 'This month' },
  { id: '90', label: '90 days' },
] as const

export type PresetId = typeof PRESETS[number]['id'] | 'custom'

export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'content', label: 'Content' },
  { id: 'live', label: 'Live Selling' },
  { id: 'sales', label: 'Sales' },
  { id: 'activity', label: 'Activity' },
] as const

export type TabId = typeof TABS[number]['id']

const MAX_RANGE_DAYS = 366
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function csv(v: string | null): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

function resolveRange(preset: PresetId, from: string | null, to: string | null, today: string) {
  switch (preset) {
    case 'today': return { from: today, to: today }
    case '7': return { from: shiftDate(today, -6), to: today }
    case '90': return { from: shiftDate(today, -89), to: today }
    case 'mtd': return { from: `${today.slice(0, 8)}01`, to: today }
    case 'custom': {
      let f = from && DATE_RE.test(from) ? from : shiftDate(today, -29)
      let t = to && DATE_RE.test(to) ? to : today
      if (t > today) t = today
      if (f > t) f = t
      if (shiftDate(f, MAX_RANGE_DAYS - 1) < t) f = shiftDate(t, -(MAX_RANGE_DAYS - 1))
      return { from: f, to: t }
    }
    default: return { from: shiftDate(today, -29), to: today }
  }
}

export function useMarketingFilters() {
  const [sp, setSp] = useSearchParams()
  const today = todayManila()

  const rawPreset = sp.get('range')
  const preset: PresetId = rawPreset === 'custom' || PRESETS.some((p) => p.id === rawPreset)
    ? (rawPreset as PresetId)
    : '30'
  const rawTab = sp.get('tab')
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'overview'

  const agentIds = useMemo(() => csv(sp.get('agents')), [sp])
  const stores = useMemo(() => csv(sp.get('stores')), [sp])
  const { from, to } = resolveRange(preset, sp.get('from'), sp.get('to'), today)

  const update = useCallback((patch: Record<string, string | null>) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      return next
    }, { replace: true })
  }, [setSp])

  const filter: AnalyticsFilter = useMemo(
    () => ({ from, to, agentIds: agentIds.length ? agentIds : undefined, stores: stores.length ? stores : undefined }),
    [from, to, agentIds, stores],
  )

  return {
    today,
    preset,
    tab,
    from,
    to,
    agentIds,
    stores,
    filter,
    isLive: to === today,
    setPreset: (p: PresetId) =>
      update(p === 'custom' ? { range: 'custom', from, to } : { range: p, from: null, to: null }),
    setCustomRange: (f: string, t: string) => update({ range: 'custom', from: f, to: t }),
    setAgents: (ids: string[]) => update({ agents: ids.join(',') || null }),
    setStores: (list: string[]) => update({ stores: list.join(',') || null }),
    setTab: (t: TabId) => update({ tab: t === 'overview' ? null : t }),
    clearFilters: () => update({ agents: null, stores: null }),
  }
}
