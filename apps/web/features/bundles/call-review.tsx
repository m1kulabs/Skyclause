'use client'

import { memo, useState } from 'react'
import type { StripInput } from '@skyclause/elements'
import { Button } from '#ui/button'
import type { CallDetail } from './operations'
import type { Decision } from './model'
import { callFate, callMark, teachingLineIncluded } from './model'
import { counted, t, type Locale } from './i18n'
import { formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import { WindowStrip } from '../data-components/window-strip'
import { NoCallState } from '../data-components/states'
import { ModeBadge } from '../brand/mode-badge'
import { InputFact } from './input-fact'

/** A call by what it is for: its window's title, its Crowd night, else the whole site. Never its ID. */
export function callName(call: Pick<CallDetail, 'window' | 'night'>, locale: Locale = 'en'): string {
  if (call.window) return call.window.title
  if (call.night) return t('bundles.night_call', { date: formatDate(call.night.date, locale) }, locale)
  return t('bundles.site_call', {}, locale)
}

export function modeName(call: Pick<CallDetail, 'mode' | 'watch' | 'no_call'>, locale: Locale = 'en'): string {
  return t(`bundles.modes.${callMark(call)}`, {}, locale)
}

/** Lists never render more than 50 rows: recipients page through 50 at a time. */
const PAGE = 50

function RecipientIds({ ids, locale }: { ids: string[]; locale: Locale }) {
  const [page, setPage] = useState(0)
  const pages = Math.ceil(ids.length / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = ids.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <>
      <ul>
        {shown.map((id) => (
          <li key={id} translate="no">
            {id}
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="bundle-recipient-pager">
          <p role="status" data-numeric>
            {t(
              'bundles.recipients_page',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                count: formatNumber(ids.length, locale)
              },
              locale
            )}
          </p>
          <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t('bundles.recipients_previous', {}, locale)}
          </Button>
          <Button variant="ghost" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            {t('bundles.recipients_next', {}, locale)}
          </Button>
        </div>
      )}
    </>
  )
}

const minutes = (before: string, after: string) =>
  Math.max(0, Math.round((Date.parse(after) - Date.parse(before)) / 60000))

/**
 * The readings strip for one call: the project's readings with this call's window as the one capsule, filled by its
 * mode and edged while it is a draft. Before the readings arrive, the window alone at `now`.
 */
function callStrip(call: CallDetail, strip: StripInput | undefined, now: string): StripInput | undefined {
  if (!call.window) return undefined
  const window = { from: call.window.starts_at, to: call.window.ends_at }
  const windows = [
    {
      id: call.window.id,
      ...window,
      state: callMark(call),
      draft: ['drafted', 'edited'].includes(call.state),
      title: call.window.title
    }
  ]
  return strip ? { ...strip, window, windows } : { from: now, to: now, now, window, windows, rain5: [], rain60: [] }
}

/** One call in the open bundle: its window on the strip, its mode, the clauses that fired with each input's age. */
export const CallReview = memo(function CallReview({
  call,
  strip,
  now,
  decision,
  expired,
  basePath,
  error,
  reviewing = false,
  locale = 'en'
}: {
  call: CallDetail
  strip?: StripInput
  /** The review's instant to the minute, for the strip before its readings arrive. */
  now?: string
  decision: Decision
  expired: boolean
  basePath: string
  error?: string
  /** The call is still open in a bundle the viewer can approve: print its fate under its badge. */
  reviewing?: boolean
  locale?: Locale
}) {
  const at = now ?? call.drafted_at
  const failing = (call.no_call ?? []).map((name) => call.inputs.find((item) => item.name === name))
  const since = failing
    .map((input) => input?.since)
    .filter((value): value is string => !!value)
    .sort()[0]
  return (
    <>
      <header className="bundle-call-head">
        <h3 id={`bundle-call-${call.id}`}>{callName(call, locale)}</h3>
        <span className="bundle-call-mark">
          <ModeBadge mode={callMark(call)} locale={locale} />
          {reviewing && (
            <span className="bundle-call-fate" data-fate={callFate(decision)}>
              {t(`bundles.fate.${callFate(decision)}`, {}, locale)}
            </span>
          )}
        </span>
      </header>
      <p className="bundle-call-meta">
        {call.window && (
          <time dateTime={call.window.starts_at}>
            {t(
              'bundles.window',
              { start: formatTime(call.window.starts_at, locale), end: formatTime(call.window.ends_at, locale) },
              locale
            )}
          </time>
        )}
        <time dateTime={call.expires_at}>
          {t('bundles.expires', { time: formatTime(call.expires_at, locale) }, locale)}
        </time>
      </p>
      {call.window && (
        <div className="bundle-call-strip">
          <WindowStrip windows={[call.window]} strip={callStrip(call, strip, at)} list={false} locale={locale} />
        </div>
      )}
      {call.recommendations.length > 0 && (
        <ul className="bundle-recommendations">
          {call.recommendations.map((recommendation) => (
            <li key={recommendation}>{t(`bundles.recommendations.${recommendation}`, {}, locale)}</li>
          ))}
        </ul>
      )}
      {call.no_call?.length ? <NoCallState inputs={call.no_call} since={since ?? null} locale={locale} /> : null}
      <h4>{t('bundles.clauses', {}, locale)}</h4>
      {!call.fired.length && <p className="bundle-quiet">{t('bundles.no_clauses', {}, locale)}</p>}
      {call.fired.length > 0 && (
        <ul className="bundle-clauses">
          {call.fired.map((fired) => {
            const clause = call.clauses.find((item) => item.key === fired.clause)
            return (
              <li key={fired.clause}>
                <p className="bundle-clause-name">{clause?.wording.en ?? fired.clause}</p>
                {clause?.wording.ms && (
                  <p className="bundle-quiet" lang="ms">
                    {clause.wording.ms}
                  </p>
                )}
                {(clause?.inputs ?? call.inputs.filter((input) => fired.inputs.includes(input.name))).map((input) => (
                  <InputFact key={input.name} input={input} locale={locale} />
                ))}
              </li>
            )
          })}
        </ul>
      )}
      {call.warnings.map((warning) => (
        <div key={warning.reading_id} className="bundle-warning">
          <h4>{t('bundles.warning', {}, locale)}</h4>
          <blockquote lang="ms">{warning.text}</blockquote>
          {warning.gloss && <p lang="en">{warning.gloss}</p>}
          <p className="bundle-quiet">
            <time dateTime={warning.valid_from}>
              {t(
                'bundles.window',
                { start: formatTime(warning.valid_from, locale), end: formatTime(warning.valid_to, locale) },
                locale
              )}
            </time>
          </p>
        </div>
      ))}
      {(call.state === 'expired' || (expired && ['drafted', 'edited'].includes(call.state))) && (
        <p className="bundle-status">{t('bundles.expired', {}, locale)}</p>
      )}
      {!reviewing && decision.action === 'reject' && (
        <p className="bundle-status">{t('bundles.rejected', {}, locale)}</p>
      )}
      {call.state === 'superseded' && <p className="bundle-status">{t('bundles.superseded', {}, locale)}</p>}
      {call.superseded_by_call_id && (
        <a
          className="bundle-link"
          href={`${basePath}/calls/${encodeURIComponent(call.superseded_by_call_id)}`}
          aria-describedby={`bundle-call-${call.id}`}
        >
          {t('bundles.successor_call', {}, locale)}
        </a>
      )}
      {teachingLineIncluded(call, decision) && (
        <p className="bundle-error">{t('bundles.teaching_forbidden', {}, locale)}</p>
      )}
      {error && <p className="bundle-error">{error}</p>}
    </>
  )
})

/** What one call sends and how long it took: recipients by language, the wording per language, the delay record. */
export const CallDetails = memo(function CallDetails({
  call,
  decision,
  locale = 'en'
}: {
  call: CallDetail
  decision: Decision
  locale?: Locale
}) {
  const notices = decision.notices ?? call.notices
  const recipients = decision.recipients ?? call.recipients
  const unknown = recipients.filter((id) => !call.deliveries.some((delivery) => delivery.recipient_id === id))
  const heading = `bundle-sends-${call.id}`
  return (
    <section className="bundle-call-details" aria-labelledby={heading} data-call-id={call.id}>
      <h3 id={heading}>{callName(call, locale)}</h3>
      <h4>{t('bundles.recipients', { count: formatNumber(recipients.length, locale) }, locale)}</h4>
      {!recipients.length && <p className="bundle-quiet">{t('bundles.no_recipients', {}, locale)}</p>}
      {(['en', 'ms'] as const).map((language) => {
        const group = recipients.filter((id) =>
          call.deliveries.some((delivery) => delivery.recipient_id === id && delivery.language === language)
        )
        return group.length ? (
          <div key={language} className="bundle-recipients">
            <p>
              {t(
                counted('bundles.language_group', group.length),
                { language: t(`bundles.language.${language}`, {}, locale), count: formatNumber(group.length, locale) },
                locale
              )}
            </p>
            <RecipientIds ids={group} locale={locale} />
          </div>
        ) : null
      })}
      {unknown.length > 0 && (
        <div className="bundle-recipients">
          <p>
            {t(counted('bundles.unassigned', unknown.length), { count: formatNumber(unknown.length, locale) }, locale)}
          </p>
          <RecipientIds ids={unknown} locale={locale} />
        </div>
      )}
      <h4>{t('bundles.wording', {}, locale)}</h4>
      {!notices.length && <p className="bundle-quiet">{t('bundles.no_wording', {}, locale)}</p>}
      {notices.length === 1 && notices[0]?.language === 'en' && (
        <p className="bundle-quiet">{t('bundles.english_only', {}, locale)}</p>
      )}
      {notices.map((notice) => (
        <div className="bundle-notice" key={notice.language} lang={notice.language}>
          <h5>{t(`bundles.language.${notice.language}`, {}, locale)}</h5>
          <p className="bundle-notice-subject">{notice.subject}</p>
          <blockquote>{notice.body}</blockquote>
        </div>
      ))}
      <h4>{t('bundles.delay', {}, locale)}</h4>
      <ol className="bundle-delay">
        <li>
          <time dateTime={call.triggered_at}>
            {t('bundles.crossing', { time: formatTime(call.triggered_at, locale) }, locale)}
          </time>
        </li>
        <li>
          <time dateTime={call.drafted_at}>
            {t(
              'bundles.drafted',
              {
                time: formatTime(call.drafted_at, locale),
                minutes: formatNumber(minutes(call.triggered_at, call.drafted_at), locale)
              },
              locale
            )}
          </time>
        </li>
        <li>
          {call.approved_at ? (
            <time dateTime={call.approved_at}>
              {t(
                'bundles.approved_time',
                {
                  time: formatTime(call.approved_at, locale),
                  minutes: formatNumber(minutes(call.drafted_at, call.approved_at), locale)
                },
                locale
              )}
            </time>
          ) : (
            t('bundles.not_approved', {}, locale)
          )}
        </li>
        <li>
          {call.sent_at && call.approved_at ? (
            <time dateTime={call.sent_at}>
              {t(
                'bundles.sent_time',
                {
                  time: formatTime(call.sent_at, locale),
                  minutes: formatNumber(minutes(call.approved_at, call.sent_at), locale)
                },
                locale
              )}
            </time>
          ) : (
            t('bundles.not_sent', {}, locale)
          )}
        </li>
      </ol>
    </section>
  )
})
