import type { Grade } from '@skyclause/contracts'
import { GradeCard } from '../data-components/grade-card'
import { ModeBadge } from '../brand/mode-badge'
import type { Locale } from './model'
import { t } from './catalogue'
import { EmptyBlock, outcomeName } from './presentation'
import { formatNumber } from '@skyclause/i18n/format'

export function GradedTable({ grades, locale }: { grades: Grade[]; locale: Locale }) {
  return (
    <section aria-labelledby="analysis-graded-title">
      <h2 id="analysis-graded-title">{t('analysis.fullTable', {}, locale)}</h2>
      <p>{t('analysis.n', { n: formatNumber(grades.length, locale) }, locale)}</p>
      {!grades.length ? (
        <EmptyBlock locale={locale} />
      ) : (
        <div className="analysis-table-frame">
          <table className="analysis-graded-table">
            <caption className="sr-only">{t('analysis.fullTable', {}, locale)}</caption>
            <thead className="sr-only sm:not-sr-only">
              <tr>
                {['window', 'pack', 'outcome', 'proposed', 'observed', 'agreement'].map((key) => (
                  <th key={key} scope="col">
                    {t(`analysis.${key}`, {}, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grades.map((grade) => (
                <tr key={grade.id} data-origin="live">
                  <th scope="row">
                    {grade.window_id ?? grade.night_id ?? grade.id}
                    <GradeCard grade={grade} />
                  </th>
                  <td data-label={t('analysis.pack', {}, locale)}>{t(`analysis.tabs.${grade.pack}`, {}, locale)}</td>
                  <td data-label={t('analysis.outcome', {}, locale)}>
                    {outcomeName(grade.outcome, grade.no_call, locale)}
                  </td>
                  <td data-label={t('analysis.proposed', {}, locale)}>
                    {grade.proposed_mode ? (
                      <>
                        <ModeBadge mode={grade.proposed_mode} pack={grade.pack} />
                        <span>{t(`analysis.mode.${grade.proposed_mode}`, {}, locale)}</span>
                      </>
                    ) : (
                      t('analysis.noCall', {}, locale)
                    )}
                  </td>
                  <td data-label={t('analysis.observed', {}, locale)}>
                    {grade.observed_mode ? (
                      <>
                        <ModeBadge mode={grade.observed_mode} pack={grade.pack} />
                        <span>{t(`analysis.mode.${grade.observed_mode}`, {}, locale)}</span>
                      </>
                    ) : (
                      t('analysis.missing', {}, locale)
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
    </section>
  )
}
