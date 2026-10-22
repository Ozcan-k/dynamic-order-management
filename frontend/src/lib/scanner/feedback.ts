// Scan feedback shared by every scan screen. One AudioContext for the whole app: phones allow only a few at a time,
// and a new one per beep (the old per-page copies) made the beep go silent after a number of scans.

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null

/** The shared context, for screens with their own beep tones (Outbound, Returns, Stock). */
export function getAudioContext(): AudioContext | null {
  return audio()
}

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

export function playBeep(success: boolean) {
  const ac = audio()
  if (!ac) return
  try {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain)
    gain.connect(ac.destination)
    const t = ac.currentTime
    if (success) {
      osc.frequency.setValueAtTime(880, t)
      osc.frequency.setValueAtTime(1100, t + 0.08)
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.35, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
      osc.start(t)
      osc.stop(t + 0.2)
    } else {
      osc.frequency.setValueAtTime(300, t)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.2, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
      osc.start(t)
      osc.stop(t + 0.3)
    }
    osc.onended = () => { osc.disconnect(); gain.disconnect() }
  } catch {
    // audio is best effort
  }
}

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* not supported */ }
}

/** Call from a tap handler (e.g. the "Scan" button) so the context may start on browsers that need a gesture. */
export function unlockAudio() {
  audio()
}
