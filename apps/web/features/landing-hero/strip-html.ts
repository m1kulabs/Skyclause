import { layoutStrip, stripSvg, type StripInput } from '@skyclause/elements'

// The 60-minute lane in landing ink; the window line is the screen's only crimson (D32).
export function heroStripSvg(strip: StripInput | null): string | null {
  if (!strip) return null
  const layout = layoutStrip({ ...strip, locale: 'en' })
  return stripSvg(layout, { locale: 'en' })
    .replace('<svg', '<svg data-source="clock:Asia/Kuala_Lumpur"')
    .replace(/<rect([^>]*?)stroke="#b11226"/g, '<rect$1stroke="#f0566c"')
    .replace(/stroke="#b11226" stroke-width="2"/g, 'stroke="currentColor" stroke-width="2"')
    .replace(/<g stroke="#b11226"/g, '<g stroke="currentColor"')
    .replace(
      /<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)" stroke="#b11226" stroke-width="1"\/>/g,
      '<line x1="$1" y1="$2" x2="$3" y2="$4" stroke="currentColor" stroke-width="1"/>'
    )
    .replace(/<path d=/g, '<path class="hero-strip-path" d=')
    .replace('role="img"', 'aria-hidden="true"')
}
