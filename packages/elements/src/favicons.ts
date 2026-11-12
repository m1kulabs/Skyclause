import type { Mode } from '@skyclause/contracts'
import { t } from '@skyclause/i18n/brand'
import { brandStates, glyphPaths, modeColours, toneColours } from './glyphs'

const xmlns = 'xmlns="http://www.w3.org/2000/svg"'
const { dark, light } = modeColours

// The mark: one window (the capsule, fully round ends) lying on its day (the strip), late in the day so the strip shows
// before it. Flat ink, no other shape.
const strip = '<rect x="0.5" y="10.25" width="15" height="2.5" rx="1.25"/>'
const capsule = '<rect x="6" y="3.25" width="9.5" height="5.5" rx="2.75"/>'
const markPaths = `<g fill="currentColor">${strip}${capsule}</g>`
// Navy on light browser chrome, pink on dark: the two inks.
const adaptive = (onLight: string, onDark: string, selector = ':root') =>
  `${selector}{color:${onLight}}@media(prefers-color-scheme:dark){${selector}{color:${onDark}}}`
const adaptiveInk = `<style>${adaptive(light.ink, dark.ink)}</style>`

export const markSvg = `<svg ${xmlns} viewBox="0 0 16 16">${adaptiveInk}${markPaths}</svg>`

// "Skyclause" in Roundo Medium (500) at 16px with -0.025em tracking, outlined to one path so the file renders the face
// without it installed. Outlined with fontTools' SVGPathPen from apps/web/fonts/roundo/Roundo-Medium.woff, baseline 12.
const wordmarkPath =
  'M7.38 9.23C7.38 10.11 6.72 10.7 5.17 10.7C3.63 10.7 1.92 10.05 0.9 9.33V10.98C1.76 11.57 3.31 12.16 5.1 12.16C7.33 12.16 8.99 11.12 8.99 9.15C8.99 7.12 7.6 6.53 5.76 5.97L4.56 5.6C3.28 5.18 2.35 4.86 2.35 3.81C2.35 2.93 3.12 2.32 4.53 2.32C6 2.32 7.5 2.96 8.37 3.55V1.84C7.7 1.38 6.38 0.82 4.58 0.82C2.45 0.82 0.69 1.9 0.69 3.94C0.69 5.9 2.21 6.54 3.79 7.01L5.23 7.44C6.59 7.87 7.38 8.24 7.38 9.23ZM10.34 0.99V12H11.84V8.06H13.33L16.02 12H17.74L14.45 7.31L17.74 3.52H16L13.39 6.66H11.84V0.75ZM19.98 14.69C21.1 14.69 22.02 14.1 22.66 12.61L26.66 3.52H24.99L22.3 10.08L19.54 3.52H17.86L21.6 11.76L21.31 12.38C21.04 12.96 20.54 13.31 19.9 13.31C19.02 13.31 18.34 12.8 18.03 12.48V13.97C18.37 14.27 19.07 14.69 19.98 14.69ZM34.1 4C33.46 3.57 32.54 3.34 31.57 3.34C28.98 3.34 26.99 5.1 26.99 7.76C26.99 10.34 28.96 12.16 31.55 12.16C32.54 12.16 33.46 11.92 34.1 11.49V9.98C33.46 10.45 32.56 10.74 31.6 10.74C29.81 10.74 28.5 9.55 28.5 7.76C28.5 5.92 29.81 4.77 31.62 4.77C32.56 4.77 33.46 5.04 34.1 5.5ZM35.46 0.99V12H36.96V0.75ZM43.79 6.85V7.62C43.41 7.47 42.75 7.31 41.92 7.31C39.74 7.31 38.34 8.4 38.34 9.89C38.34 11.3 39.31 12.16 41.02 12.16C42.29 12.16 43.28 11.54 43.89 10.88V12H45.3V6.83C45.3 4.3 43.7 3.36 41.86 3.36C40.29 3.36 38.99 4.1 38.43 4.67V6.22C39.15 5.49 40.34 4.85 41.66 4.85C42.8 4.85 43.79 5.41 43.79 6.85ZM39.74 9.82C39.74 8.94 40.61 8.35 42.29 8.35C42.83 8.35 43.41 8.45 43.79 8.56V10C43.14 10.54 42.22 10.99 41.26 10.99C40.42 10.99 39.74 10.66 39.74 9.82ZM50.5 10.72C49.25 10.72 48.5 10.02 48.5 8.62V3.52H46.99V8.96C46.99 11.04 48.06 12.16 49.92 12.16C51.33 12.16 52.42 11.52 53.14 10.93V12H54.54V3.52H53.04V9.94C52.43 10.3 51.49 10.72 50.5 10.72ZM60.18 7.41 59.14 7.1C58.05 6.78 57.34 6.53 57.34 5.76C57.34 5.04 58.06 4.69 58.96 4.69C60.16 4.69 61.46 5.17 62.06 5.63V4.13C61.47 3.73 60.26 3.34 59.04 3.34C57.07 3.34 55.89 4.4 55.89 5.81C55.89 7.28 56.96 7.9 58.22 8.22L59.3 8.54C60.38 8.83 61.02 9.07 61.02 9.81C61.02 10.61 60.4 10.9 59.39 10.9C58.08 10.9 56.75 10.38 55.97 9.89V11.36C56.61 11.76 57.97 12.22 59.33 12.22C61.23 12.22 62.45 11.38 62.45 9.78C62.45 8.46 61.54 7.79 60.18 7.41ZM70.8 11.41V10.08C70.18 10.43 69.01 10.74 67.87 10.74C66.1 10.74 64.94 9.92 64.83 8.22H70.98V7.52C70.98 4.88 69.65 3.34 67.33 3.34C64.96 3.34 63.31 4.99 63.31 7.76C63.31 10.64 65.14 12.16 67.73 12.16C68.9 12.16 70.19 11.86 70.8 11.41ZM67.25 4.64C68.74 4.64 69.47 5.6 69.5 7.2H64.82C64.9 5.58 65.84 4.64 67.25 4.64Z'

export const wordmarkSvg = `<svg ${xmlns} viewBox="0 0 72 16" role="img" aria-label="${t('brand.name')}" translate="no"><path fill="currentColor" d="${wordmarkPath}"/></svg>`

/** Zero/omitted means none. Positive whole counts saturate at the pre-rendered 9+ asset. */
export function tabBadgeSvg(count: number | '9+' = 0): string {
  if (typeof count === 'number' && (!Number.isSafeInteger(count) || count < 0)) {
    throw new RangeError('Tab badge count must be a nonnegative safe integer')
  }
  if (count === 0) return markSvg
  const label = count === '9+' || count > 9 ? '9+' : String(count)
  // The count sits in an ink capsule above the mark's own capsule, in the ground colour, so the two never touch.
  const width = label === '9+' ? 15 : 12
  const colours = `<style>${adaptive(light.ink, dark.ink)}${adaptive(light.ground, dark.ground, '.count')}</style>`
  return `<svg ${xmlns} viewBox="0 0 24 24">${colours}<g transform="translate(0 10) scale(0.875)">${markPaths}</g><rect x="${24 - width}" y="0" width="${width}" height="12" rx="6" fill="currentColor"/><text class="count" x="${24 - width / 2}" y="9.5" text-anchor="middle" font-family="sans-serif" font-size="${label === '9+' ? 8 : 10}" font-weight="700" fill="currentColor">${label}</text></svg>`
}

/** The caller selects the highest approved call still in force (D3), never an engine verdict. */
export function projectFaviconSvg({
  mode = null,
  error = false
}: { mode?: Mode | null; error?: boolean } = {}): string {
  if (!error && mode === null) return markSvg
  const { glyph, tone } = brandStates[error ? 'error' : mode!]
  // The mark's capsule takes the call's mode, with the mode's glyph inside it: the hue never stands alone. A tab bar is
  // not our ground, so Normal's quiet tone step becomes the ink there.
  const colours = (scheme: typeof light | typeof dark) =>
    tone === 'normal' ? { fill: scheme.ink, edge: null, ink: scheme.ground } : toneColours(tone, scheme)
  const [l, d] = [colours(light), colours(dark)]
  const paint = (c: typeof l) => `.cap{fill:${c.fill ?? 'none'};stroke:${c.edge ?? 'none'}}.mode{color:${c.ink}}`
  const style = `<style>${adaptive(light.ink, dark.ink)}${paint(l)}@media(prefers-color-scheme:dark){${paint(d)}}</style>`
  const dashed = tone === 'no-call' ? ' stroke-dasharray="1.5 1"' : ''
  return `<svg ${xmlns} viewBox="0 0 16 16">${style}<g fill="currentColor">${strip}</g><rect class="cap" x="6" y="3.25" width="9.5" height="5.5" rx="2.75" stroke-width="1"${dashed}/><g class="mode" transform="translate(8.05 3.3) scale(0.45)" fill="none" stroke="currentColor" stroke-width="1.5">${glyphPaths[glyph]}</g></svg>`
}
