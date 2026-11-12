'use client'

import { useState } from 'react'
import type { Grade } from '@skyclause/contracts'
import { formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { ModeBadge } from '../brand/mode-badge'
import type { Locale } from './model'
import { t } from './catalogue'
import { EmptyBlock, outcomeName } from './presentation'

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
            {t('analysis.n', { n: formatNumber(grades.length, locale) }, locale)}
          </span>
        </h2>
        {grades.length > PAGE && (
          <p className="analysis-muted" data-numeric>
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
        <div className="analysis-table-frame">
          <table className="analysis-graded-table">
            <caption className="sr-only">{t('analysis.fullTable', {}, locale)}</caption>
            <thead className="sr-only md:not-sr-only">
              <tr>
                {['window', 'pack', 'outcome', 'proposed', 'observed', 'agreement'].map((key) => (
                  <th key={key} scope="col">
                    {t(`analysis.${key}`, {}, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((grade) => (
                <tr key={grade.id} data-origin="live">
                  <th scope="row" translate="no">
                    {grade.window_id ?? grade.night_id ?? grade.id}
                  </th>
                  <td data-label={t('analysis.pack', {}, locale)}>{t(`analysis.tabs.${grade.pack}`, {}, locale)}</td>
                  <td data-label={t('analysis.outcome', {}, locale)}>
                    {outcomeName(grade.outcome, grade.no_call, locale)}
                  </td>
                  <td data-label={t('analysis.proposed', {}, locale)}>
                    {grade.proposed_mode ? (
                      <ModeBadge mode={grade.proposed_mode} locale={locale} />
                    ) : (
                      <ModeBadge mode="no_call" locale={locale} />
                    )}
                  </td>
                  <td data-label={t('analysis.observed', {}, locale)}>
                    {grade.observed_mode ? (
                      <ModeBadge mode={grade.observed_mode} locale={locale} />
                    ) : (
                      <span className="analysis-sub">{t('analysis.missing', {}, locale)}</span>
                    )}
                  </td>
                  <td data-label={t('analysis.agreement', {}, locale)}>
                    {t(
                      grade.stale_inputs ? 'analysis.stale' : grade.agrees ? 'analysis.agrees' : 'analysis.disagrees',
                      {},
                      locale
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
