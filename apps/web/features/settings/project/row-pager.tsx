'use client'

import { formatNumber } from '@skyclause/i18n/format'
import { t } from '../../project-settings/catalogue'
import { Button } from '#ui/button'

/** The most rows a settings list renders at once. */
export const ROW_PAGE_SIZE = 50

export function pageOf<Row>(rows: readonly Row[], page: number): Row[] {
  return rows.slice(page * ROW_PAGE_SIZE, (page + 1) * ROW_PAGE_SIZE)
}

/**
 * Pages through a list already read in full, 50 rows at a time. It renders nothing for a list that fits on one page;
 * at either end the button that cannot move is disabled, and the range is announced as it changes.
 */
export function RowPager({
  total,
  page,
  onPage,
  locale = 'en',
  rangeKey = 'project-settings.page_range'
}: {
  total: number
  page: number
  onPage: (page: number) => void
  locale?: 'en' | 'ms'
  rangeKey?: 'project-settings.page_range' | 'project-settings.sources_range'
}) {
  if (total <= ROW_PAGE_SIZE) return null
  const from = page * ROW_PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * ROW_PAGE_SIZE)
  const last = Math.ceil(total / ROW_PAGE_SIZE) - 1
  return (
    <div className="flex flex-wrap items-center gap-3" data-row-pager>
      <p role="status" className="type-small m-0 text-muted-foreground" data-numeric>
        {t(
          rangeKey,
          { from: formatNumber(from, locale), to: formatNumber(to, locale), total: formatNumber(total, locale) },
          locale
        )}
      </p>
      <Button type="button" variant="outline" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        {t('project-settings.page_previous', {}, locale)}
      </Button>
      <Button type="button" variant="outline" disabled={page >= last} onClick={() => onPage(page + 1)}>
        {t('project-settings.page_next', {}, locale)}
      </Button>
    </div>
  )
}
