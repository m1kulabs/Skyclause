'use client'

import { formatDate } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { localDate } from './model'
import type { WindowView } from './operations'
import { windowRange } from './window-entry'
import { t, type Locale } from './catalogue'

/**
 * An existing window where it cannot be changed: what was declared, as text rather than fields nobody can save, and
 * the one thing that works instead, declaring a new window. Cancel window shows only when it can work.
 */
export function WindowDetails({
  window,
  onDeclare,
  onCancel,
  locale
}: {
  window: WindowView
  onDeclare: () => void
  onCancel?: () => void
  locale: Locale
}) {
  const rows = [
    ['field_title', window.title],
    ['kind', t(`windows.${window.kind}`, {}, locale)],
    ['date', formatDate(`${localDate(window.starts_at)}T12:00:00+08:00`, locale)],
    ['time', windowRange(window, locale)]
  ] as const
  return (
    <div className="flex flex-col gap-5" data-window-details>
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[minmax(6rem,auto)_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 sm:contents">
            <dt className="type-small text-muted-foreground sm:pt-0.5">{t(`windows.${label}`, {}, locale)}</dt>
            <dd className="type-text break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="max-sm:w-full" onClick={onDeclare}>
          {t('windows.declare', {}, locale)}
        </Button>
        {onCancel && (
          <Button type="button" data-window-cancel variant="outline" className="max-sm:w-full" onClick={onCancel}>
            {t('windows.cancel', {}, locale)}
          </Button>
        )}
      </div>
    </div>
  )
}
