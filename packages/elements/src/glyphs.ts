import type { InputState, Mode } from '@skyclause/contracts'

export type BrandState = Mode | InputState | 'storm_watch' | 'no_call'
/** Severity, for ranking calls (share previews pick the most severe pack). */
export type ColourLevel = 'neutral' | 'warning' | 'critical' | 'no-call'
/**
 * The capsule a state takes when drawn as one: a mode's own hue, or a non-mode style with no hue (watch: a solid ink
 * edge, no-call: a dashed edge). Equal to the `data-tone` values and the `--mode-*` tokens in apps/web globals.css.
 */
export type ModeTone =
  'normal' | 'outdoor-limited' | 'commute-disruption' | 'hybrid-recommended' | 'surge-night' | 'watch' | 'no-call'

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
  normal: { glyph: 'ring', word: 'brand.states.normal', level: 'neutral', tone: 'normal' },
  storm_watch: { glyph: 'hollow_triangle', word: 'brand.states.storm_watch', level: 'neutral', tone: 'watch' },
  outdoor_limited: {
    glyph: 'half_disc',
    word: 'brand.states.outdoor_limited',
    level: 'warning',
    tone: 'outdoor-limited'
  },
  commute_disruption: {
    glyph: 'filled_triangle',
    word: 'brand.states.commute_disruption',
    level: 'critical',
    tone: 'commute-disruption'
  },
  hybrid_recommended: {
    glyph: 'filled_square',
    word: 'brand.states.hybrid_recommended',
    level: 'critical',
    tone: 'hybrid-recommended'
  },
  surge_night: { glyph: 'rising_bars', word: 'brand.states.surge_night', level: 'warning', tone: 'surge-night' },
  no_call: { glyph: 'dashed_ring', word: 'brand.states.no_call', level: 'no-call', tone: 'no-call' },
  fresh: { glyph: 'ring', word: 'brand.states.fresh', level: 'neutral', tone: 'normal' },
  stale: { glyph: 'clock', word: 'brand.states.stale', level: 'warning', tone: 'watch' },
  error: { glyph: 'cross', word: 'brand.states.error', level: 'critical', tone: 'no-call' },
  recovered: { glyph: 'ring', word: 'brand.states.recovered', level: 'neutral', tone: 'normal' },
  pending: { glyph: 'dashed_ring', word: 'brand.states.pending', level: 'no-call', tone: 'no-call' },
  probation: { glyph: 'dashed_ring', word: 'brand.states.probation', level: 'no-call', tone: 'no-call' },
  off_hours: { glyph: 'dashed_ring', word: 'brand.states.off_hours', level: 'no-call', tone: 'no-call' }
} as const satisfies Record<BrandState, { glyph: GlyphName; word: string; level: ColourLevel; tone: ModeTone }>

// Standalone SVGs (favicons, Open Graph cards, the strip outside a page) cannot read the document's tokens. These are
// the Dusk (dark) and Day (light) values of the same names in apps/web/styles/globals.css, checked in brand.test.ts.
export const modeColours = {
  dark: {
    ground: '#1a2039',
    surface: '#212846',
    ink: '#f9a3c0',
    'ink-muted': '#c68da3',
    'mode-normal': '#2a3257',
    'mode-outdoor-limited': '#f6dc8e',
    'mode-commute-disruption': '#f08c3f',
    'mode-hybrid-recommended': '#ea5a44',
    'mode-surge-night': '#7fb0ff',
    'mode-outdoor-limited-ink': '#1a2039',
    'mode-commute-disruption-ink': '#1a2039',
    'mode-hybrid-recommended-ink': '#1a2039',
    'mode-surge-night-ink': '#1a2039'
  },
  light: {
    ground: '#fdeef3',
    surface: '#f9dfe8',
    ink: '#1a2039',
    'ink-muted': '#555a75',
    'mode-normal': '#f3cfdc',
    'mode-outdoor-limited': '#b4831a',
    'mode-commute-disruption': '#a8541c',
    'mode-hybrid-recommended': '#93302a',
    'mode-surge-night': '#3a64b0',
    'mode-outdoor-limited-ink': '#1a2039',
    'mode-commute-disruption-ink': '#fdeef3',
    'mode-hybrid-recommended-ink': '#fdeef3',
    'mode-surge-night-ink': '#fdeef3'
  }
} as const

type Scheme = (typeof modeColours)['dark' | 'light']

/** Colours by severity level, kept for callers that still colour by level; prefer `toneColours`. */
export const statusColours = {
  dark: {
    neutral: modeColours.dark.ink,
    warning: modeColours.dark['mode-outdoor-limited'],
    critical: modeColours.dark['mode-hybrid-recommended'],
    'no-call': modeColours.dark['ink-muted']
  },
  light: {
    neutral: modeColours.light.ink,
    warning: modeColours.light['mode-outdoor-limited'],
    critical: modeColours.light['mode-hybrid-recommended'],
    'no-call': modeColours.light['ink-muted']
  }
} as const satisfies Record<string, Record<ColourLevel, string>>

/** A tone's capsule as literal colours: its fill (none for the edge-only tones), its edge and the ink set on it. */
export function toneColours(tone: ModeTone, scheme: Scheme): { fill: string | null; edge: string | null; ink: string } {
  switch (tone) {
    case 'normal':
      return { fill: scheme['mode-normal'], edge: scheme['ink-muted'], ink: scheme.ink }
    case 'watch':
      return { fill: null, edge: scheme.ink, ink: scheme.ink }
    case 'no-call':
      return { fill: null, edge: scheme['ink-muted'], ink: scheme.ink }
    default:
      return { fill: scheme[`mode-${tone}`], edge: null, ink: scheme[`mode-${tone}-ink`] }
  }
}

export function glyphSvg(state: BrandState): string {
  const { glyph } = brandStates[state]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${glyphPaths[glyph]}</svg>`
}
