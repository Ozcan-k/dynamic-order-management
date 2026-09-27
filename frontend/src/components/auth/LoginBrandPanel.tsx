import { useState, useEffect, ReactNode } from 'react'

// Shared dark brand panel for /login and /scan (styles: styles/login.css).
// Desktop: left half of the split layout; mobile: compact header band.

export interface BrandFeature {
  title: string
  text: string
  icon: ReactNode
}

function DomLogo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" rx="18" fill="url(#logoGrad)" />
      <path d="M36 16 L54 26 L36 36 L18 26 Z"
            fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 26 L18 46 L36 56 L36 36 Z"
            fill="rgba(255,255,255,0.10)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M54 26 L54 46 L36 56 L36 36 Z"
            fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="39" y1="41" x2="52" y2="34.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.85" />
      <line x1="39" y1="46" x2="52" y2="39.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.55" />
    </svg>
  )
}

const FLOW_STAGES = [
  { label: 'Inbound', icon: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /> },
  { label: 'Pick', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  { label: 'Pack', icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></> },
  { label: 'Outbound', icon: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></> },
]

function useManilaTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })
  const date = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' })
  return { time, date }
}

export default function LoginBrandPanel({
  tag,
  headline,
  lede,
  features,
}: {
  tag: string
  headline: ReactNode
  lede: string
  features: BrandFeature[]
}) {
  const manila = useManilaTime()

  return (
    <aside className="login-brand">
      <div className="login-brand-grid" aria-hidden="true" />
      <div className="login-brand-glow" aria-hidden="true" />

      <div className="login-brand-top">
        <DomLogo size={44} />
        <div>
          <div className="login-brand-name">Dynamic Order Management</div>
          <div className="login-brand-tag">{tag}</div>
        </div>
      </div>

      <div className="login-brand-body">
        <h1 className="login-brand-headline">{headline}</h1>
        <p className="login-brand-lede">{lede}</p>

        <div className="login-flow" aria-hidden="true">
          <div className="login-flow-track">
            <span className="login-flow-parcel" />
            <span className="login-flow-parcel login-flow-parcel--2" />
          </div>
          {FLOW_STAGES.map((s, i) => (
            <div className="login-flow-stage" key={s.label} style={{ animationDelay: `${i * 1.8}s` }}>
              <span className="login-flow-node">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon}
                </svg>
              </span>
              <span className="login-flow-label">{s.label}</span>
            </div>
          ))}
        </div>

        <ul className="login-features">
          {features.map((f) => (
            <li key={f.title}>
              <span className="login-feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </span>
              <div>
                <div className="login-feature-title">{f.title}</div>
                <div className="login-feature-text">{f.text}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="login-brand-foot">
        <span className="login-live-dot" aria-hidden="true" />
        <span>Manila</span>
        <span className="login-brand-clock">{manila.time}</span>
        <span className="login-brand-sep" aria-hidden="true">·</span>
        <span>{manila.date}</span>
      </div>
    </aside>
  )
}
