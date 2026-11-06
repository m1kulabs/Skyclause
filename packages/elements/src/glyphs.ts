import type { InputState, Mode } from '@skyclause/contracts'

export type BrandState = Mode | InputState | 'storm_watch' | 'no_call'
export type ColourLevel = 'neutral' | 'warning' | 'critical' | 'no-call'

// DESIGN's nine shapes. Trusted static geometry shared by SVG strings and framework adapters.
export const glyphPaths = {
  ring: '<circle cx="6" cy="6" r="4.5"/>',
  hollow_triangle: '<path d="M6 1.5 10.5 10.5h-9Z"/>',
  half_disc: '<circle cx="6" cy="6" r="4.5"/><path d="M6 1.5a4.5 4.5 0 0 1 0 9Z" fill="currentColor" stroke="none"/>',
  filled_triangle: '<path d="M6 1.5 10.5 10.5h-9Z" fill="currentColor"/>',
  filled_square: '<rect x="2" y="2" width="8" height="8" fill="currentColor"/>',
  rising_bars: '<path d="M2 10V7M6 10V4M10 10V1"/>',
  dashed_ring: '<circle cx="6" cy="6" r="4.5" stroke-dasharray="2 1.5"/><path d="m2 10 8-8"/>',
  clock: '<circle cx="6" cy="6" r="4.5"/><path d="M6 3v3h2.5"/>',
  cross: '<path d="m2 2 8 8m0-8-8 8"/>'
} as const
export type GlyphName = keyof typeof glyphPaths

export const brandStates = {
  normal: { glyph: 'ring', word: 'brand.states.normal', level: 'neutral' },
  storm_watch: { glyph: 'hollow_triangle', word: 'brand.states.storm_watch', level: 'neutral' },
  outdoor_limited: { glyph: 'half_disc', word: 'brand.states.outdoor_limited', level: 'warning' },
  commute_disruption: { glyph: 'filled_triangle', word: 'brand.states.commute_disruption', level: 'critical' },
  hybrid_recommended: { glyph: 'filled_square', word: 'brand.states.hybrid_recommended', level: 'critical' },
  surge_night: { glyph: 'rising_bars', word: 'brand.states.surge_night', level: 'warning' },
  no_call: { glyph: 'dashed_ring', word: 'brand.states.no_call', level: 'no-call' },
  fresh: { glyph: 'ring', word: 'brand.states.fresh', level: 'neutral' },
  stale: { glyph: 'clock', word: 'brand.states.stale', level: 'warning' },
  error: { glyph: 'cross', word: 'brand.states.error', level: 'critical' },
  recovered: { glyph: 'ring', word: 'brand.states.recovered', level: 'neutral' },
  pending: { glyph: 'dashed_ring', word: 'brand.states.pending', level: 'no-call' },
  probation: { glyph: 'dashed_ring', word: 'brand.states.probation', level: 'no-call' },
  off_hours: { glyph: 'dashed_ring', word: 'brand.states.off_hours', level: 'no-call' }
} as const satisfies Record<BrandState, { glyph: GlyphName; word: string; level: ColourLevel }>

// Standalone SVGs cannot inherit the document's CSS tokens. These are f-ui's token values,
// checked against globals.css in brand.test.ts; no host-supplied mode palette is accepted.
export const statusColours = {
  dark: { neutral: '#bdbdc0', warning: '#d9a441', critical: '#f0566c', 'no-call': '#bdbdc0' },
  light: { neutral: '#3f4246', warning: '#966400', critical: '#9b0f24', 'no-call': '#3f4246' }
} as const satisfies Record<string, Record<ColourLevel, string>>

export function glyphSvg(state: BrandState): string {
  const { glyph } = brandStates[state]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${glyphPaths[glyph]}</svg>`
}
