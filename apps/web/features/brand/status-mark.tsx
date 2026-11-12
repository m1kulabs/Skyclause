import { brandStates, type BrandState } from '@skyclause/elements'
import { t } from '@skyclause/i18n/brand'
import { Glyph } from './glyph'
import './brand.css'

export interface StatusMarkProps {
  /** Any mode or input state: its glyph and its word are always printed, never its colour alone. */
  state: BrandState
  /** Replaces the state's own word, for a phrase that names it ("Sky: Normal"). */
  label?: string
  /** `capsule` fills the mark with the state's tone; `plain` sets glyph and word in the surrounding ink. */
  variant?: 'capsule' | 'plain'
  locale?: 'en' | 'ms'
}

/** The text-size status mark: the state's glyph and word, in a capsule of its tone or inline in the ink. */
export function StatusMark({ state, label, variant = 'capsule', locale = 'en' }: StatusMarkProps) {
  const { word, level, tone } = brandStates[state]
  return (
    <span className="status-mark" data-state={state} data-variant={variant} lang={locale}>
      <span
        className="mode-badge-pill"
        data-status={variant === 'capsule' ? level : undefined}
        data-tone={variant === 'capsule' ? tone : undefined}
      >
        <Glyph state={state} />
        <span>{label ?? t(word, {}, locale)}</span>
      </span>
    </span>
  )
}
