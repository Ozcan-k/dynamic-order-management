import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// The app is a single-page app: a phone left open on a scan screen keeps the code it loaded, even across sign-out /
// sign-in, so a fix never reaches it (2026-10-23: the inbound handheld scanned all day on the build from before the
// camera fix). This checks index.html for a new bundle and gets the new version onto the device.

const CHECK_MS = 2 * 60 * 1000
const SAFE_TO_RELOAD = ['/scan', '/login'] // nothing typed or scanned is lost on these

function currentBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return el ? new URL(el.src, location.href).pathname : null
}

async function latestBundle(): Promise<string | null> {
  try {
    const html = await (await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })).text()
    return html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null
  } catch {
    return null
  }
}

// One automatic reload per new bundle: if a cache still served the old page, never loop — show the button instead.
const RELOADED_KEY = 'dom-update-reloaded-for'

function reloadOnceFor(bundle: string): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === bundle) return false
    sessionStorage.setItem(RELOADED_KEY, bundle)
  } catch {
    return false
  }
  window.location.reload()
  return true
}

export default function AppUpdateNotice() {
  const [ready, setReady] = useState<string | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    const mine = currentBundle()
    if (!mine) return // dev server: no hashed bundle
    let stopped = false
    const check = async () => {
      const latest = await latestBundle()
      if (!stopped && latest && latest !== mine) setReady(latest)
    }
    void check()
    const t = window.setInterval(check, CHECK_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // On the sign-in screens nothing can be lost: take the new version straight away.
  const [autoTried, setAutoTried] = useState(false)
  useEffect(() => {
    if (ready && SAFE_TO_RELOAD.includes(pathname) && !reloadOnceFor(ready)) setAutoTried(true)
  }, [ready, pathname])

  if (!ready || (SAFE_TO_RELOAD.includes(pathname) && !autoTried)) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 'max(12px, env(safe-area-inset-bottom))', zIndex: 20000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 14px', borderRadius: 14, background: '#0f172a', color: '#f8fafc',
        border: '1px solid rgba(96,165,250,0.5)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        maxWidth: 520, margin: '0 auto', fontSize: 14, fontWeight: 600,
      }}
    >
      <span>A new version of the app is ready.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ flexShrink: 0, padding: '10px 16px', minHeight: 44, borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
      >
        Update now
      </button>
    </div>
  )
}
