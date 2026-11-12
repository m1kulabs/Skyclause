import type { Mode, Pack } from '@skyclause/contracts'
import { brandStates } from '@skyclause/elements'
import { t } from '@skyclause/i18n/brand'
import { Glyph } from './glyph'
import './brand.css'

export interface ModeBadgeProps {
  mode: Mode | 'storm_watch' | 'no_call'
  /** Supply the pack when the surrounding surface displays both packs. */
  pack?: Pack
  locale?: 'en' | 'ms'
}

/** A call's mode as a text-size capsule: filled by the mode's tone, with its glyph and its word inside. */
export function ModeBadge({ mode, pack, locale = 'en' }: ModeBadgeProps) {
  const { word, level, tone } = brandStates[mode]
  const label = t(word, {}, locale)
  return (
    <span className="mode-badge" data-mode={mode} lang={locale}>
      <span className="mode-badge-pill" data-status={level} data-tone={tone}>
        <Glyph state={mode} />
        <span translate={pack ? 'no' : undefined}>
          {pack
            ? t('brand.badge_with_pack', { pack: t(`brand.packs.${pack}`, {}, locale), mode: label }, locale)
            : label}
        </span>
      </span>
    </span>
  )
}
