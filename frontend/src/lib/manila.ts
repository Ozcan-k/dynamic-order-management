/**
 * Manila timezone utilities — Asia/Manila is UTC+8, no DST.
 * Using pure arithmetic avoids adding external dependencies.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // UTC+8

/**
 * Returns today's date string (YYYY-MM-DD) in Manila local time.
 * Use this instead of new Date().toISOString().slice(0,10) which gives UTC date.
 */
export function getManilaDateString(date?: Date): string {
  const ms = (date ? date.getTime() : Date.now()) + MANILA_OFFSET_MS
  return new Date(ms).toISOString().slice(0, 10)
}

/** Format a date string/Date as a Manila-timezone date string. */
export function formatManilaDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleDateString('en-GB', { ...options, timeZone: 'Asia/Manila' })
}

/** Format a date string/Date as a Manila-timezone date+time string. */
export function formatManilaDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleString('en-GB', { ...options, timeZone: 'Asia/Manila' })
}

/** Format a date string/Date as a Manila-timezone time string. */
export function formatManilaTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleTimeString('en-GB', { ...options, timeZone: 'Asia/Manila' })
}
