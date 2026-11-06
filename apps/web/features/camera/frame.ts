import { contrast, ratios, type Region, type Setup } from './model'

/** Paint only the upper part, then mask before any readback, encoding or persistence. */
export function maskedCanvas(source: HTMLVideoElement | HTMLCanvasElement, canvas: HTMLCanvasElement) {
  const width = 'videoWidth' in source ? source.videoWidth : source.width
  const height = 'videoHeight' in source ? source.videoHeight : source.height
  if (!width || !height) throw new Error('camera-not-ready')
  canvas.width = 640
  // Align the mask with JPEG MCU blocks so compression cannot leak the horizon into its first row.
  canvas.height = Math.max(48, Math.round(((height / width) * 640) / 48) * 48)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.fillStyle = '#000000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0, width, (height * 2) / 3, 0, 0, 640, (canvas.height * 2) / 3)
  context.fillRect(0, (canvas.height * 2) / 3, 640, canvas.height / 3)
  return context
}

export function measure(canvas: HTMLCanvasElement, near: Region, far: Region) {
  const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  return { near: contrast(image, near), far: contrast(image, far) }
}

export function captureFrame(video: HTMLVideoElement, setup: Setup) {
  const canvas = document.createElement('canvas')
  maskedCanvas(video, canvas)
  const score = measure(canvas, setup.near, setup.far)
  return {
    jpeg: canvas.toDataURL('image/jpeg', 0.85),
    ...ratios(score.near, score.far, setup.reference!.near, setup.reference!.far)
  }
}
