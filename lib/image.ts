const MAX_EDGE = 2400
const MAX_BYTES = 3.5 * 1024 * 1024 // stay under the 4 MB limit enforced by /api/chat
const QUALITIES = [0.85, 0.75, 0.65, 0.55]

export async function compressImage(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // The browser can't decode it (e.g. HEIC on desktop Chrome). Send as-is if the server accepts it.
    if (file.size <= MAX_BYTES && /^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return file
    throw new Error('Could not read this image. Please use a JPEG or PNG photo.')
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Image processing is not available in this browser.')
  }

  ctx.fillStyle = '#ffffff' // flatten transparent PNG screenshots onto white
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (blob && blob.size <= MAX_BYTES) {
      return new File([blob], 'receipt.jpg', { type: 'image/jpeg' })
    }
  }
  throw new Error('This photo is still too large after compression. Try a smaller one.')
}