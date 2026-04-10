// Keystroke interval < 50ms = barcode scanner (HID)
// Keystroke interval > 200ms = manual typing
const SCANNER_THRESHOLD_MS = 50

export function createScanDetector() {
  let lastKeyTime = 0

  return {
    onKeyDown(): boolean {
      const now = Date.now()
      const interval = now - lastKeyTime
      lastKeyTime = now
      return interval < SCANNER_THRESHOLD_MS && interval > 0
    },
    reset() {
      lastKeyTime = 0
    },
  }
}
