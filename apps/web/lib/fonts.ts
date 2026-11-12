import localFont from 'next/font/local'

// Roundo, self-hosted (fonts/roundo/SOURCE.txt). The family keeps its own name so globals.css can set it on every
// root; `next/font` adds the preload and a metric-matched fallback face named 'Roundo Fallback'.
export const roundo = localFont({
  src: '../fonts/roundo/Roundo-Variable.woff2',
  weight: '200 700',
  style: 'normal',
  display: 'swap',
  declarations: [{ prop: 'font-family', value: 'Roundo' }],
  fallback: ['system-ui', 'sans-serif']
})

// Skyclause Figures: Roundo's digits at one width (fonts/skyclause-figures/build.py), for the characters numbers are
// printed with. Loaded through next/font like Roundo so its three faces are preloaded: tables, clocks and counters
// paint in these digits at first paint and do not shift when a late face arrives. The family keeps its own name
// (`--font-figures` in globals.css lists it ahead of Roundo) and the unicode-range limits each face to those characters.
export const figures = localFont({
  src: [
    { path: '../fonts/skyclause-figures/SkyclauseFigures-Regular.woff2', weight: '200 449', style: 'normal' },
    { path: '../fonts/skyclause-figures/SkyclauseFigures-Medium.woff2', weight: '450 549', style: 'normal' },
    { path: '../fonts/skyclause-figures/SkyclauseFigures-SemiBold.woff2', weight: '550 700', style: 'normal' }
  ],
  display: 'swap',
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: 'Skyclause Figures' },
    { prop: 'unicode-range', value: 'U+0020, U+0025, U+002B-003A, U+00A0, U+2009, U+2013, U+202F, U+2212' }
  ],
  variable: '--font-skyclause-figures'
})
