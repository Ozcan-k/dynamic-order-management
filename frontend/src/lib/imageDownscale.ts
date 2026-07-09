/**
 * Shrink a camera photo in the browser before it is uploaded.
 *
 * A phone snapshot of a supplier invoice is ~3 MB; at 1600 px on the long edge it is
 * still comfortably legible (serial number, amounts, dates) but lands around 400 KB.
 * Since these files are kept for the statutory retention period and never purged, that
 * ~8x saving is what keeps the uploads volume from growing without bound.
 *
 * PDFs are never touched — they are already small, and re-encoding would damage the text.
 */

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

/** Below this, a photo is already small enough that re-encoding only loses detail. */
const SKIP_BELOW_BYTES = 600 * 1024

const RESIZABLE = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export function isResizableImage(file: File): boolean {
  return RESIZABLE.includes(file.type)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')) }
    img.src = url
  })
}

/**
 * Returns a downscaled JPEG, or the original file untouched when it is a PDF, already
 * small, already low-resolution, or when anything at all goes wrong. Never throws:
 * a failed shrink must not block the upload — worst case we send the original bytes.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!isResizableImage(file) || file.size <= SKIP_BELOW_BYTES) return file

  try {
    const img = await loadImage(file)
    const scale = MAX_EDGE / Math.max(img.width, img.height)
    if (scale >= 1) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    // A transparent PNG flattened to JPEG can come out larger. Keep whichever is smaller.
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
