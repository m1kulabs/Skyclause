import { layoutStrip, stripSvg, type StripInput } from '@skyclause/elements'

// The 60-minute lane around the picked window, drawn by the shared strip engine (the window as its capsule).
export function heroStripSvg(strip: StripInput | null): string | null {
  if (!strip) return null
  const layout = layoutStrip({ ...strip, locale: 'en' })
  return stripSvg(layout, { locale: 'en' })
    .replace('<svg', '<svg data-source="clock:Asia/Kuala_Lumpur"')
    .replace(/<path d=/g, '<path class="hero-strip-path" d=')
    .replace('role="img"', 'aria-hidden="true"')
}
