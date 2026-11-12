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
