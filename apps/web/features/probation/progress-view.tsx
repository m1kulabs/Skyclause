'use client'

import Link from 'next/link'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { buttonVariants } from '#ui/button'
import { cn } from '#lib/utils'
import { StatusMark } from '../brand/status-mark'
import { t } from './i18n'
import { PASS, agreementInterval } from './model'
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

type Locale = 'en' | 'ms'

/** A row that measures: its figure on the right, and a capsule-ended track filled to the true ratio under the label. */
function Measure({
  label,
  value,
  target,
  locale,
  ...rest
}: {
  label: string
  value: number
  target?: number
  locale: Locale
} & Record<`data-${string}`, string | number>) {
  const ratio = target ? Math.min(1, value / target) : null
  return (
    <div className="flex min-h-11 flex-col justify-center gap-2" {...rest}>
      <div className="flex items-baseline justify-between gap-3 type-body">
        <span>{label}</span>
        <span data-numeric className="text-right">
          {target === undefined
            ? formatNumber(value, locale)
            : t(
                'probation.measure_of',
                { value: formatNumber(value, locale), target: formatNumber(target, locale) },
                locale
              )}
        </span>
      </div>
      {ratio !== null && (
        <div aria-hidden="true" className="h-2 rounded-full bg-raised">
          <div className="h-2 rounded-full bg-foreground" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  )
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
  const hasAgreement = status !== null && status.agreement !== null
  const agreement = hasAgreement ? formatNumber(Math.round(status.agreement! * 100) / 100, locale) : null

  return (
    <div className="probation-progress flex flex-col gap-section">
      <section aria-labelledby="probation-progress-heading" className="flex flex-col gap-gap">
        <h2 id="probation-progress-heading" className="type-section">
          {t('probation.progress_heading', {}, locale)}
        </h2>
        {status ? (
          <div className="grid gap-gap lg:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl bg-card p-pad" data-probation-agreement>
              <p className="type-small text-muted-foreground">{t('probation.measure_agreement', {}, locale)}</p>
              {agreement ? (
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span data-numeric className="type-title">
                    {agreement}
                  </span>
                  <span data-numeric className="type-body text-muted-foreground">
                    {t(
                      'probation.measure_needed',
                      { needed: formatNumber(PASS.agreement, locale, { minimumFractionDigits: 2 }) },
                      locale
                    )}
                  </span>
                </p>
              ) : (
                <p className="type-body text-muted-foreground">{t('probation.progress_agreement_none', {}, locale)}</p>
              )}
              {interval && (
                <p data-numeric className="type-small text-muted-foreground">
                  {t(
                    'probation.progress_interval',
                    {
                      n: formatNumber(status.n, locale),
                      low: formatNumber(interval.lo, locale),
                      high: formatNumber(interval.hi, locale)
                    },
                    locale
                  )}
                </p>
              )}
              <p className="mt-2 flex flex-col items-start gap-2 type-text">
                {status.probation ? (
                  <>
                    <StatusMark state="probation" locale={locale} />
                    <span>{t('probation.verdict_watching', {}, locale)}</span>
                  </>
                ) : (
                  passedAt && (
                    <span>{t('probation.verdict_passed', { date: formatDate(passedAt, locale) }, locale)}</span>
                  )
                )}
              </p>
            </div>
            <div className="flex flex-col gap-3 rounded-xl bg-card p-pad">
              <Measure
                label={t('probation.measure_frames', {}, locale)}
                value={status.n}
                target={PASS.frames}
                locale={locale}
                data-probation-frames={status.n}
              />
              <Measure
                label={t('probation.measure_obscured', {}, locale)}
                value={status.obscured_frames}
                target={PASS.obscured}
                locale={locale}
                data-probation-obscured={status.obscured_frames}
              />
              <Measure
                label={t('probation.measure_disagreements', {}, locale)}
                value={disagreements}
                locale={locale}
                data-probation-disagreements={disagreements}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-gap rounded-xl bg-card p-pad">
            <p className="type-text">{t('probation.progress_zero', {}, locale)}</p>
            <Link href={labelHref} data-slot="button" className={cn(buttonVariants({ variant: 'default' }))}>
              {t('probation.progress_cta', {}, locale)}
            </Link>
          </div>
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
