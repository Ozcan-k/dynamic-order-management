import { longDate, shiftDate, shortDate } from './format'

export function rangeTitle(from: string, to: string, today: string): string {
  if (from === to) {
    if (to === today) return `Today · ${shortDate(to)}`
    if (to === shiftDate(today, -1)) return `Yesterday · ${shortDate(to)}`
    return longDate(to)
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${sameYear ? shortDate(from) : longDate(from)} – ${longDate(to)}`
}

export function dayCountLabel(from: string, to: string): string {
  const n = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return `${n} day${n === 1 ? '' : 's'}`
}
