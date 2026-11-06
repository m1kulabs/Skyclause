'use client'

import Link from 'next/link'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { t } from './i18n'
import { agreementInterval } from './model'
import type { ProbationStatus } from './operations'
import { LabellerPicker } from './labeller-picker'

interface ProgressProps {
  org: string
  project: string
  sourceId: string
  status: ProbationStatus | null
  /** Client-observed time of the first response with the camera passed. */
  passedAt: string | null
  disagreements: number
  /** Only Admins and Owners name labellers; Viewers see no picker. */
  picker: 'edit' | 'read' | 'none'
  locale?: 'en' | 'ms'
  onStatus(status: ProbationStatus): void
}

export function ProgressView({
  org,
  project,
  sourceId,
  status,
  passedAt,
  disagreements,
  picker,
  locale = 'en',
  onStatus
}: ProgressProps) {
  const labelHref = `/${encodeURIComponent(org)}/${encodeURIComponent(project)}/signals/probation/${encodeURIComponent(sourceId)}?view=label`
  const interval = status ? agreementInterval(status.agreement, status.n) : null
  const agreementText =
    status && status.agreement !== null ? formatNumber(Math.round(status.agreement * 100) / 100, locale) : '—'
  const intervalText = interval
    ? ` (n=${formatNumber(status!.n, locale)}, 95% ${formatNumber(interval.lo, locale)}–${formatNumber(interval.hi, locale)})`
    : ''

  return (
    <div className="probation-progress">
      <section aria-labelledby="probation-progress-heading">
        <h2 id="probation-progress-heading">{t('probation.progress_heading', {}, locale)}</h2>
        {status ? (
          <>
            <p className="probation-progress-line">
              {t(
                'probation.progress_line',
                {
                  n: formatNumber(status.n, locale),
                  k: formatNumber(status.obscured_frames, locale),
                  p: agreementText,
                  interval: intervalText,
                  d: formatNumber(disagreements, locale)
                },
                locale
              )}
            </p>
            {status.probation ? (
              <p>
                {t(
                  'probation.verdict_watching',
                  {
                    n: formatNumber(status.n, locale),
                    k: formatNumber(status.obscured_frames, locale),
                    p: agreementText
                  },
                  locale
                )}
              </p>
            ) : (
              passedAt && <p>{t('probation.verdict_passed', { date: formatDate(passedAt, locale) }, locale)}</p>
            )}
          </>
        ) : (
          <>
            <p className="probation-progress-line">{t('probation.progress_zero', {}, locale)}</p>
            <p>
              <Link href={labelHref}>{t('probation.progress_cta', {}, locale)}</Link>
            </p>
          </>
        )}
      </section>
      {picker !== 'none' && (
        <LabellerPicker
          org={org}
          sourceId={sourceId}
          status={status}
          editable={picker === 'edit'}
          locale={locale}
          onStatus={onStatus}
        />
      )}
    </div>
  )
}
