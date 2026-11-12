import type { ComponentProps } from 'react'
import { brandStates, glyphPaths, type BrandState } from '@skyclause/elements'

export type GlyphProps = ComponentProps<'svg'>

/** A state's glyph at text size, in the colour of the text around it: the word beside it says the same thing. */
export function Glyph({ state, style, ...props }: GlyphProps & { state: BrandState }) {
  const { glyph } = brandStates[state]
  return (
    <svg
      width={12}
      height={12}
      {...props}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      style={{ ...style, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: glyphPaths[glyph] }}
    />
  )
}
