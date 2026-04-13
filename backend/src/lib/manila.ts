/**
 * Manila timezone utilities — Asia/Manila is UTC+8, no DST.
 * Using pure arithmetic avoids adding external dependencies.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // UTC+8

/**
 * Returns the start of today in Manila local time, expressed as a UTC Date.
 * Manila midnight 00:00 +08:00  =  yesterday 16:00 UTC.
 */
export function getManilaStartOfToday(): Date {
  const manilaMs = Date.now() + MANILA_OFFSET_MS
  const d = new Date(manilaMs) // .getUTCFullYear/Month/Date now reflect Manila local
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - MANILA_OFFSET_MS)
}

/**
 * Returns today's date string (YYYY-MM-DD) in Manila local time.
 */
export function getManilaDateString(date?: Date): string {
  const ms = (date ? date.getTime() : Date.now()) + MANILA_OFFSET_MS
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Returns the start of a given date string (YYYY-MM-DD) in Manila local time,
 * expressed as a UTC Date. E.g. '2026-03-28' → 2026-03-27T16:00:00.000Z
 */
export function getManilaStartOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+08:00`)
}
