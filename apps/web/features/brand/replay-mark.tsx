import type { ComponentProps } from 'react'
import { replayGlyphPath } from '@skyclause/elements'
import { t } from '@skyclause/i18n/brand'
import { Badge } from '#ui/badge'

export interface ReplayMarkProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** What was replayed ("JPS station 75, 2 November"); printed after the word. */
  label?: string
  locale?: 'en' | 'ms'
}

/**
 * The mark on a replayed figure: a counter-clockwise arrow and the word, on the raised tone with no edge. It is a tag,
 * not a state: No call keeps its dashed capsule and a control keeps its edge, so a replay never reads as either.
 */
export function ReplayMark({ label, locale = 'en', ...props }: ReplayMarkProps) {
  return (
    <Badge variant="secondary" data-replay-mark {...props}>
      <svg
        width={12}
        height={12}
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: replayGlyphPath }}
      />
      <span>{label ? `${t('brand.replay', {}, locale)} · ${label}` : t('brand.replay', {}, locale)}</span>
    </Badge>
  )
}
