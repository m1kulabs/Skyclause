'use client'

import type { PackState } from '@skyclause/contracts'
import { ModeBadge } from '../brand/mode-badge'
import { t } from './catalogue'

export interface PackStateNoteProps {
  pack: PackState
  locale?: 'en' | 'ms'
}

export function PackStateNote({ pack, locale = 'en' }: PackStateNoteProps) {
  const note =
    pack.basis === 'engine_verdict'
      ? t('data.pack.clause_engine', {}, locale)
      : pack.basis === 'approved_call'
        ? t('data.pack.approved_call', {}, locale)
        : t('data.pack.no_basis', {}, locale)

  return (
    <span className="inline-flex min-h-[34px] flex-wrap items-center gap-2 [@media(pointer:coarse)]:min-h-[44px]">
      <ModeBadge mode={pack.mode ?? 'no_call'} pack={pack.pack} locale={locale} />
      <span className="text-sm text-muted-foreground">{note}</span>
    </span>
  )
}
