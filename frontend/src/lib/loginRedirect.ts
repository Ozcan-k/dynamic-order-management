// Remembers which login screen the user arrived from (scan station vs desktop)
// so logout and session-expiry redirects land on the same screen they started at.

const KEY = 'dom_login_redirect'
const DEFAULT = '/login'
const ALLOWED = new Set(['/login', '/scan'])

export function setLoginRedirect(path: '/login' | '/scan'): void {
  try {
    localStorage.setItem(KEY, path)
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

export function getLoginRedirect(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && ALLOWED.has(v)) return v
  } catch {
    // ignore
  }
  return DEFAULT
}
