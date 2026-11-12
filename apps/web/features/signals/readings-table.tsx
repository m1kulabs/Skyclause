'use client'

import { useId, useState } from 'react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import type { SourceReading } from './operations'
import { t } from './catalogue'

/** A list never renders more than this many rows (NFR-9). */
export const READING_ROWS = 50
/** Rows shown before "show more": enough to read the latest few hours without a page of figures. */
export const READING_PREVIEW = 12

function recordOf(reading: SourceReading, locale: 'en' | 'ms'): string {
  const json = reading.value_json
  if (json && typeof json === 'object' && !Array.isArray(json) && typeof json.class === 'string') return json.class
  return reading.value_text ?? t('signals.reading', {}, locale)
}

/**
 * The readings stream of one source as a table on a 44px pitch: source time, the value as a right-aligned tabular
 * figure with its unit, and the record. Newest first, never more than fifty rows.
 */
export function ReadingsTable({
  readings,
  locale,
  expanded: initiallyExpanded = false
}: {
  readings: readonly SourceReading[]
  locale: 'en' | 'ms'
  expanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const tableId = useId()
  const rows = [...readings].sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))
  const capped = rows.slice(0, READING_ROWS)
  const shown = expanded ? capped : capped.slice(0, READING_PREVIEW)
  return (
    <section data-readings-table aria-labelledby="signals-readings-title" className="flex flex-col gap-2">
      <h3 id="signals-readings-title" className="type-card-title">
        {t('signals.readings_title', {}, locale)}
      </h3>
      <p className="type-small text-muted-foreground">
        {t(
          rows.length === 1
            ? 'signals.readings_one'
            : rows.length > shown.length
              ? 'signals.readings_shown'
              : 'signals.readings_all',
          { shown: formatNumber(shown.length, locale), total: formatNumber(rows.length, locale) },
          locale
        )}
      </p>
      {shown.length > 0 && (
        <Table id={tableId}>
          <TableCaption className="sr-only">{t('signals.readings_title', {}, locale)}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('signals.table_time', {}, locale)}</TableHead>
              <TableHead numeric>{t('signals.table_value', {}, locale)}</TableHead>
              <TableHead>{t('signals.table_state', {}, locale)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((reading) => (
              <TableRow key={reading.id}>
                <TableCell phone="primary">
                  <time dateTime={reading.observed_at} data-numeric>
                    {formatDateTime(reading.observed_at, locale)}
                  </time>
                </TableCell>
                <TableCell numeric phone="end">
                  {reading.value === null ? (
                    <span className="text-muted-foreground">{t('signals.value_missing', {}, locale)}</span>
                  ) : (
                    <>
                      {formatNumber(reading.value, locale)}
                      {reading.unit ? <span className="text-muted-foreground">{`\u00a0${reading.unit}`}</span> : null}
                    </>
                  )}
                </TableCell>
                <TableCell phone="meta" label={t('signals.table_state', {}, locale)}>
                  {recordOf(reading, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {capped.length > READING_PREVIEW && (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          aria-expanded={expanded}
          aria-controls={tableId}
          onClick={() => setExpanded((value) => !value)}
        >
          {t(expanded ? 'signals.readings_fewer' : 'signals.readings_more', { count: capped.length }, locale)}
        </Button>
      )}
    </section>
  )
}
