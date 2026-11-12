'use client'

import { useState } from 'react'
import type { Grade } from '@skyclause/contracts'
import { formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { ModeBadge } from '../brand/mode-badge'
import type { Locale } from './model'
import { t } from './catalogue'
import { EmptyBlock, outcomeName } from './presentation'
import { gradedName } from './review-panel'

const PAGE = 50

/** Every graded window or night of the period, live only, 50 to a page. */
export function GradedTable({ grades, locale }: { grades: Grade[]; locale: Locale }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(grades.length / PAGE))
  const current = Math.min(page, pages - 1)
  const shown = grades.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <section aria-labelledby="analysis-graded-title" className="analysis-graded">
      <div className="analysis-section-head">
        <h2 id="analysis-graded-title">
          {t('analysis.fullTable', {}, locale)}
          <span className="analysis-n" data-numeric>
            {t('analysis.gradedCount', { n: formatNumber(grades.length, locale) }, locale)}
          </span>
        </h2>
        {grades.length > PAGE && (
          <p className="analysis-muted" data-numeric role="status">
            {t(
              'analysis.rowsShown',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                n: formatNumber(grades.length, locale)
              },
              locale
            )}
          </p>
        )}
      </div>
      {!grades.length ? (
        <EmptyBlock locale={locale} />
      ) : (
        <Table className="analysis-graded-table">
          <TableCaption className="sr-only">{t('analysis.fullTable', {}, locale)}</TableCaption>
          <TableHeader>
            <TableRow>
              {['window', 'pack', 'outcome', 'proposed', 'observed', 'agreement'].map((key) => (
                <TableHead key={key} scope="col">
                  {t(`analysis.${key}`, {}, locale)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((grade) => (
              <TableRow key={grade.id} data-origin="live">
                <TableCell phone="primary">{gradedName(grade, locale)}</TableCell>
                <TableCell label={t('analysis.pack', {}, locale)}>
                  {t(`analysis.tabs.${grade.pack}`, {}, locale)}
                </TableCell>
                <TableCell truncate="36ch" label={t('analysis.outcome', {}, locale)}>
                  {outcomeName(grade.outcome, grade.no_call, locale)}
                </TableCell>
                <TableCell phone="end">
                  <ModeBadge mode={grade.proposed_mode ?? 'no_call'} locale={locale} />
                </TableCell>
                <TableCell label={t('analysis.observed', {}, locale)}>
                  {grade.observed_mode ? (
                    <ModeBadge mode={grade.observed_mode} locale={locale} />
                  ) : (
                    <span className="analysis-sub">{t('analysis.missing', {}, locale)}</span>
                  )}
                </TableCell>
                <TableCell label={t('analysis.agreement', {}, locale)}>
                  {t(
                    grade.stale_inputs ? 'analysis.stale' : grade.agrees ? 'analysis.agrees' : 'analysis.disagrees',
                    {},
                    locale
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {pages > 1 && (
        <div className="analysis-pager">
          <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t('analysis.previousRows', {}, locale)}
          </Button>
          <Button variant="outline" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
            {t('analysis.nextRows', {}, locale)}
          </Button>
        </div>
      )}
    </section>
  )
}
