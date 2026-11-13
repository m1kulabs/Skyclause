// DESIGN.md's Dusk theme (docs/DESIGN.md, colors.dusk and colors.mode). Every overlay and new graphic uses these.
export const dusk = {
  ground: '#1a2039',
  surface: '#212846',
  raised: '#2a3257',
  overlay: '#313a62',
  ink: '#f9a3c0',
  inkMuted: '#c68da3'
} as const

// Mode fills and the ink printed on them (Dusk). Mode hues go on data only, always with their glyph and word.
export const mode = {
  normal: { fill: dusk.raised, ink: dusk.ink, edge: dusk.inkMuted },
  commuteDisruption: { fill: '#f08c3f', ink: dusk.ground, edge: 'transparent' }
} as const

// The one easing family.
export const EASE = [0.16, 1, 0.3, 1] as const

// Older call sites read these names; like DESIGN.md's kept aliases, each resolves to a Dusk role.
export const theme = {
  landingBackground: dusk.ground,
  landingForeground: dusk.ink,
  landingMuted: dusk.inkMuted,
  background: dusk.ground,
  card: dusk.surface,
  raised: dusk.raised,
  foreground: dusk.ink,
  secondary: dusk.inkMuted,
  muted: dusk.inkMuted,
  border: dusk.raised,
  rule: dusk.raised,
  grid: dusk.raised,
  control: dusk.raised,
  crimson: dusk.ink,
  crimsonOnDark: dusk.ink,
  warning: dusk.ink
} as const

export const font = {
  sans: '"Roundo", system-ui, sans-serif',
  // Skyclause Figures holds only digits and number punctuation, so letters fall through to Roundo.
  figures: '"Skyclause Figures", "Roundo", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace'
} as const
