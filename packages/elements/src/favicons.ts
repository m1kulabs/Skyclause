import type { Mode } from '@skyclause/contracts'
import { t } from '@skyclause/i18n/brand'
import { brandStates, glyphPaths, statusColours } from './glyphs'

const xmlns = 'xmlns="http://www.w3.org/2000/svg"'
// Brand crimson and the light/dark inks are the f-ui brand and foreground tokens.
const markPaths =
  '<rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1 10.5h14" fill="none" stroke="#b11226" stroke-width="1"/>'
const adaptiveInk = '<style>:root{color:#111113}@media(prefers-color-scheme:dark){:root{color:#ffffff}}</style>'

export const markSvg = `<svg ${xmlns} viewBox="0 0 16 16">${adaptiveInk}${markPaths}</svg>`

export const wordmarkSvg = `<svg ${xmlns} viewBox="0 0 86 16" translate="no"><text x="0" y="12" fill="currentColor" font-family="Work Sans Variable, Work Sans, sans-serif" font-size="16" font-weight="500" letter-spacing="-0.02em">${t('brand.name')}</text></svg>`

/** Zero/omitted means none. Positive whole counts saturate at the pre-rendered 9+ asset. */
export function tabBadgeSvg(count: number | '9+' = 0): string {
  if (typeof count === 'number' && (!Number.isSafeInteger(count) || count < 0)) {
    throw new RangeError('Tab badge count must be a nonnegative safe integer')
  }
  if (count === 0) return markSvg
  const label = count === '9+' || count > 9 ? '9+' : String(count)
  return `<svg ${xmlns} viewBox="0 0 24 24">${adaptiveInk}<g transform="translate(0 4) scale(1.25)">${markPaths}</g><circle cx="17" cy="7" r="7" fill="#b11226"/><text x="17" y="10" text-anchor="middle" font-family="sans-serif" font-size="${label === '9+' ? 8 : 10}" font-weight="700" fill="#ffffff">${label}</text></svg>`
}

/** The caller selects the highest approved call still in force (D3), never an engine verdict. */
export function projectFaviconSvg({
  mode = null,
  error = false
}: { mode?: Mode | null; error?: boolean } = {}): string {
  if (!error && mode === null) return markSvg
  const { glyph, level } = brandStates[error ? 'error' : mode!]
  const colours = `<style>.mode{color:${statusColours.light[level]}}@media(prefers-color-scheme:dark){.mode{color:${statusColours.dark[level]}}}</style>`
  return `<svg ${xmlns} viewBox="0 0 16 16">${adaptiveInk}${colours}${markPaths}<g class="mode" transform="translate(4 4) scale(0.666667)" fill="none" stroke="currentColor" stroke-width="1.5">${glyphPaths[glyph]}</g></svg>`
}
