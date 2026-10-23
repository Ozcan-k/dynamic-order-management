// Barcode decoding for the camera scan screens.
//
// Why not @zxing/browser any more: courier labels printed on thermal printers (Flash Express above all) have narrow bars
// printed thinner than the spec. @zxing/library with its default binarizer read 0 of 30 photos of real Flash labels
// (2026-10-23 test, SOLUTIONS.md). Two engines now, tried in this order on every frame:
//   1. the phone's own detector (BarcodeDetector, Google ML Kit on Android Chrome) when the browser has one;
//   2. zxing-cpp compiled to WebAssembly (zxing-wasm), on the scan-frame area, rotating through binarizers and
//      thresholds frame by frame. Raising the threshold thickens thin bars: 17 of 18 label photos decode this way.
import type { ReaderOptions, ReadResult } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export interface Detection {
  text: string
  /** normalised format name, e.g. "code128", "qrcode" */
  format: string
}

export interface Region { x: number; y: number; w: number; h: number }

// ── Native detector (Shape Detection API; not in TypeScript's DOM lib) ──────────
interface NativeBarcode { rawValue: string; format: string }
interface NativeDetector { detect(source: CanvasImageSource): Promise<NativeBarcode[]> }
interface NativeDetectorCtor {
  new (options: { formats: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

/** `waybill`: courier labels (1D first, QR / DataMatrix allowed). `qr`: our own stock labels, QR codes only. */
export type ScanKind = 'waybill' | 'qr'

const NATIVE_FORMATS: Record<ScanKind, string[]> = {
  waybill: ['code_128', 'code_39', 'code_93', 'itf', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'],
  qr: ['qr_code'],
}
const WASM_FORMATS: Record<ScanKind, NonNullable<ReaderOptions['formats']>> = {
  waybill: ['Code128', 'Code39', 'Code93', 'ITF', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'QRCode', 'DataMatrix'],
  qr: ['QRCode'],
}

const nativePromises: Partial<Record<ScanKind, Promise<NativeDetector | null>>> = {}

function nativeDetector(kind: ScanKind): Promise<NativeDetector | null> {
  nativePromises[kind] ??= (async () => {
    const Ctor = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
    if (!Ctor) return null
    try {
      const supported = await Ctor.getSupportedFormats()
      const formats = NATIVE_FORMATS[kind].filter((f) => supported.includes(f))
      return formats.length ? new Ctor({ formats }) : null
    } catch {
      return null
    }
  })()
  return nativePromises[kind]!
}

// ── zxing-cpp (WebAssembly), loaded only when a camera opens; the .wasm is served by us, never a CDN ─────────
type WasmReader = typeof import('zxing-wasm/reader')
let wasmPromise: Promise<WasmReader> | null = null

function wasmReader(): Promise<WasmReader> {
  if (!wasmPromise) {
    wasmPromise = import('zxing-wasm/reader').then((m) => {
      void m
        .prepareZXingModule({
          overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
          fireImmediately: true,
        })
        .catch(() => {})
      return m
    })
    wasmPromise.catch(() => { wasmPromise = null })
  }
  return wasmPromise
}

/** Start loading both engines while the camera starts, so the first frames are not lost to loading. */
export function preloadDecoders(kind: ScanKind) {
  void nativeDetector(kind)
  void wasmReader().catch(() => {})
}

// ── Frame preparation ───────────────────────────────────────────────────────────
const MAX_WIDTH = 1280
let canvas: HTMLCanvasElement | null = null

function drawRegion(video: HTMLVideoElement, r: Region, factor: number): { cv: HTMLCanvasElement; data: ImageData } | null {
  const scale = Math.min(1, MAX_WIDTH / r.w) * factor
  const w = Math.max(1, Math.round(r.w * scale))
  const h = Math.max(1, Math.round(r.h * scale))
  canvas ??= document.createElement('canvas')
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, w, h)
  return { cv: canvas, data: g.getImageData(0, 0, w, h) }
}

/** Otsu threshold of the luminance, then a pure black / white copy at threshold + offset. */
function thresholded(src: ImageData, offset: number): ImageData {
  const px = src.data
  const n = px.length / 4
  const lum = new Uint8Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8
    lum[i] = v
    hist[v]++
  }
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, t = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = n - wB
    if (!wF) break
    sumB += i * hist[i]
    const d = sumB / wB - (sum - sumB) / wF
    const between = wB * wF * d * d
    if (between > best) { best = between; t = i }
  }
  const cut = Math.min(250, Math.max(5, t + offset))
  const out = new ImageData(src.width, src.height)
  const o = out.data
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = lum[i] > cut ? 255 : 0
    o[j] = o[j + 1] = o[j + 2] = v
    o[j + 3] = 255
  }
  return out
}

// The zxing-cpp attempts rotate frame by frame (one per frame keeps each frame fast on a phone). From the 2026-10-23
// label test: no single setting reads every Flash label, but each label has one that does — thicker bars (threshold
// +20 / +40) and a 75 % copy of the picture (less JPEG / sensor noise on the bar edges) rescued most of them.
// Area: `guide` = the on-screen band; `square` = a square on the same centre as wide as the band, because people hold the
// phone sideways (2026-10-23 floor video): the label then shows rotated 90°, its barcode runs across the band and does not
// fit in it; `full` = the whole picture, in case the label is outside the guide.
type Area = 'guide' | 'square' | 'full'
type Attempt = { binarizer: 'LocalAverage' | 'FixedThreshold'; offset?: number; scale: number; area: Area }
const SETTINGS: Omit<Attempt, 'area'>[] = [
  { binarizer: 'FixedThreshold', offset: 20, scale: 1 },
  { binarizer: 'FixedThreshold', offset: 20, scale: 0.75 },
  { binarizer: 'FixedThreshold', offset: 40, scale: 1 },
  { binarizer: 'FixedThreshold', scale: 0.75 },
  { binarizer: 'LocalAverage', scale: 1 },
  { binarizer: 'FixedThreshold', offset: 40, scale: 0.75 },
  { binarizer: 'FixedThreshold', scale: 1 },
  { binarizer: 'FixedThreshold', offset: 20, scale: 0.6 },
  { binarizer: 'FixedThreshold', offset: -20, scale: 0.75 },
]
// Two guide reads, then one square read (at most 75 %: it has more pixels), frame by frame; twice per round the whole
// picture. Straight labels keep their speed, sideways ones get every third frame.
const ATTEMPTS: Attempt[] = [
  ...SETTINGS.flatMap((s, i): Attempt[] =>
    i % 2 === 0 ? [{ ...s, area: 'guide' }] : [{ ...s, area: 'guide' }, { ...SETTINGS[i - 1], scale: Math.min(0.75, SETTINGS[i - 1].scale), area: 'square' }, { ...s, scale: Math.min(0.75, s.scale), area: 'square' }]),
  { binarizer: 'LocalAverage', scale: 1, area: 'full' },
  { binarizer: 'FixedThreshold', offset: 20, scale: 0.75, area: 'full' },
]

function areaOf(video: HTMLVideoElement, guide: Region, area: Area): Region {
  const vw = video.videoWidth, vh = video.videoHeight
  if (area === 'full') return { x: 0, y: 0, w: vw, h: vh }
  if (area === 'guide') return guide
  const side = Math.min(Math.max(guide.w, guide.h), vw, vh)
  const cx = guide.x + guide.w / 2, cy = guide.y + guide.h / 2
  const x = Math.round(Math.min(Math.max(0, cx - side / 2), vw - side))
  const y = Math.round(Math.min(Math.max(0, cy - side / 2), vh - side))
  return { x, y, w: Math.round(side), h: Math.round(side) }
}

const normalise = (format: string) => format.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Drop control characters (GS1 separators etc.) a symbol may carry around the tracking number. */
const printable = (s: string) => Array.from(s).filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('')

function pick(results: { text: string; format: string }[], minLength: number): Detection | null {
  const ok = results
    .map((r) => ({ text: printable(r.text).trim(), format: normalise(r.format) }))
    .filter((r) => r.text.length >= minLength)
  if (!ok.length) return null
  // labels carry several codes: prefer 1D (the waybill) over QR / DataMatrix, then the longest
  ok.sort((a, b) => Number(isMatrix(a.format)) - Number(isMatrix(b.format)) || b.text.length - a.text.length)
  return ok[0]
}

const isMatrix = (f: string) => f === 'qrcode' || f === 'datamatrix'

/** Formats without a mandatory check character: one read is not trusted, the caller confirms with a second. */
export const needsConfirmation = (format: string) => format === 'code39' || format === 'itf' || format === 'code93'

/** Decode one video frame. `attempt` grows by one per call so the zxing-cpp settings rotate (see ATTEMPTS). */
export async function decodeFrame(video: HTMLVideoElement, region: Region, attempt: number, minLength: number, kind: ScanKind = 'waybill'): Promise<Detection | null> {
  const a = ATTEMPTS[attempt % ATTEMPTS.length]
  const frame = drawRegion(video, areaOf(video, region, a.area), a.scale)
  if (!frame) return null

  const native = await nativeDetector(kind)
  if (native) {
    try {
      const found = pick((await native.detect(frame.cv)).map((b) => ({ text: b.rawValue, format: b.format })), minLength)
      if (found) return found
    } catch {
      // fall through to zxing-cpp
    }
  }

  let reader: WasmReader
  try {
    reader = await wasmReader()
  } catch {
    return null
  }
  const image = a.offset === undefined ? frame.data : thresholded(frame.data, a.offset)
  try {
    const results: ReadResult[] = await reader.readBarcodes(image, {
      formats: WASM_FORMATS[kind],
      binarizer: a.binarizer,
      tryHarder: true,
      tryRotate: true,
      tryInvert: false,
      tryDownscale: true,
      maxNumberOfSymbols: 4,
    })
    return pick(results.filter((x) => x.isValid).map((x) => ({ text: x.text, format: x.format })), minLength)
  } catch {
    return null
  }
}
