// DESIGN.md's glyphs on a 12px grid with a 1.5px stroke, copied from packages/elements/src/glyphs.ts.
const paths = {
  ring: <circle cx="6" cy="6" r="4.5" />,
  filled_triangle: <path d="M6 1.5 10.5 10.5h-9Z" fill="currentColor" />,
  replay: (
    <>
      <path d="M2.3 3.4A4.5 4.5 0 1 1 1.5 6" />
      <path d="M1.2 1.6v2.2h2.2" />
    </>
  )
} as const

export type GlyphName = keyof typeof paths

export const Glyph: React.FC<{ name: GlyphName; size: number }> = ({ name, size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    {paths[name]}
  </svg>
)
