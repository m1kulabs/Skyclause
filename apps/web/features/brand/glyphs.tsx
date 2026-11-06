import { Glyph, type GlyphProps } from './glyph'
export type { GlyphProps } from './glyph'

export function NormalGlyph(props: GlyphProps) {
  return <Glyph state="normal" {...props} />
}

export function StormWatchGlyph(props: GlyphProps) {
  return <Glyph state="storm_watch" {...props} />
}

export function OutdoorLimitedGlyph(props: GlyphProps) {
  return <Glyph state="outdoor_limited" {...props} />
}

export function CommuteDisruptionGlyph(props: GlyphProps) {
  return <Glyph state="commute_disruption" {...props} />
}

export function HybridRecommendedGlyph(props: GlyphProps) {
  return <Glyph state="hybrid_recommended" {...props} />
}

export function SurgeNightGlyph(props: GlyphProps) {
  return <Glyph state="surge_night" {...props} />
}

export function NoCallGlyph(props: GlyphProps) {
  return <Glyph state="no_call" {...props} />
}

export function StaleInputGlyph(props: GlyphProps) {
  return <Glyph state="stale" {...props} />
}

export function InputErrorGlyph(props: GlyphProps) {
  return <Glyph state="error" {...props} />
}
