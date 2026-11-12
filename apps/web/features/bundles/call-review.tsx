import { memo } from 'react'
import type { StripInput } from '@skyclause/elements'
import type { CallDetail } from './operations'
import type { Decision } from './model'
import { callMark, teachingLineIncluded } from './model'
import { t } from './i18n'
import { formatTime } from '@skyclause/i18n/format'
import { WindowStrip } from '../data-components/window-strip'
import { NoCallState } from '../data-components/states'
import { ModeBadge } from '../brand/mode-badge'
import { InputFact } from './input-fact'

export function callName(call: CallDetail): string {
  return call.window?.title ?? t('bundles.call', { id: call.id })
}

export function modeName(call: Pick<CallDetail, 'mode' | 'watch' | 'no_call'>): string {
  return t(`bundles.modes.${callMark(call)}`)
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
  error
}: {
  call: CallDetail
  strip?: StripInput
  /** The review's instant to the minute, for the strip before its readings arrive. */
  now?: string
  decision: Decision
  expired: boolean
  basePath: string
  error?: string
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
        <h3>{callName(call)}</h3>
        <ModeBadge mode={callMark(call)} />
      </header>
      <p className="bundle-call-meta">
        {call.window && (
          <time dateTime={call.window.starts_at}>
            {t('bundles.window', {
              start: formatTime(call.window.starts_at, 'en'),
              end: formatTime(call.window.ends_at, 'en')
            })}
          </time>
        )}
        <time dateTime={call.expires_at}>{t('bundles.expires', { time: formatTime(call.expires_at, 'en') })}</time>
      </p>
      {call.window && (
        <div className="bundle-call-strip">
          <WindowStrip windows={[call.window]} strip={callStrip(call, strip, at)} list={false} />
        </div>
      )}
      {call.recommendations.length > 0 && (
        <ul className="bundle-recommendations">
          {call.recommendations.map((recommendation) => (
            <li key={recommendation}>{t(`bundles.recommendations.${recommendation}`)}</li>
          ))}
        </ul>
      )}
      {call.no_call?.length ? <NoCallState inputs={call.no_call} since={since ?? null} /> : null}
      <h4>{t('bundles.clauses')}</h4>
      {!call.fired.length && <p className="bundle-quiet">{t('bundles.no_clauses')}</p>}
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
                  <InputFact key={input.name} input={input} />
                ))}
              </li>
            )
          })}
        </ul>
      )}
      {call.warnings.map((warning) => (
        <div key={warning.reading_id} className="bundle-warning">
          <h4>{t('bundles.warning')}</h4>
          <blockquote lang="ms">{warning.text}</blockquote>
          {warning.gloss && <p lang="en">{warning.gloss}</p>}
          <p className="bundle-quiet">
            <time dateTime={warning.valid_from}>
              {t('bundles.window', {
                start: formatTime(warning.valid_from, 'en'),
                end: formatTime(warning.valid_to, 'en')
              })}
            </time>
          </p>
        </div>
      ))}
      {(call.state === 'expired' || (expired && ['drafted', 'edited'].includes(call.state))) && (
        <p className="bundle-status">{t('bundles.expired')}</p>
      )}
      {decision.action === 'reject' && <p className="bundle-status">{t('bundles.rejected')}</p>}
      {call.state === 'superseded' && <p className="bundle-status">{t('bundles.superseded')}</p>}
      {call.superseded_by_call_id && (
        <a className="bundle-link" href={`${basePath}/calls/${encodeURIComponent(call.superseded_by_call_id)}`}>
          {t('bundles.successor_call')}
        </a>
      )}
      {teachingLineIncluded(call, decision) && <p className="bundle-error">{t('bundles.teaching_forbidden')}</p>}
      {error && <p className="bundle-error">{error}</p>}
    </>
  )
})

/** What one call sends and how long it took: recipients by language, the wording per language, the delay record. */
export const CallDetails = memo(function CallDetails({ call, decision }: { call: CallDetail; decision: Decision }) {
  const notices = decision.notices ?? call.notices
  const recipients = decision.recipients ?? call.recipients
  const unknown = recipients.filter((id) => !call.deliveries.some((delivery) => delivery.recipient_id === id))
  return (
    <section className="bundle-call-details" aria-label={callName(call)} data-call-id={call.id}>
      <h3>{callName(call)}</h3>
      <h4>{t('bundles.recipients', { count: recipients.length })}</h4>
      {!recipients.length && <p className="bundle-quiet">{t('bundles.no_recipients')}</p>}
      {(['en', 'ms'] as const).map((language) => {
        const group = recipients.filter((id) =>
          call.deliveries.some((delivery) => delivery.recipient_id === id && delivery.language === language)
        )
        return group.length ? (
          <div key={language} className="bundle-recipients">
            <p>{t('bundles.language_group', { language: t(`bundles.language.${language}`), count: group.length })}</p>
            <ul>
              {group.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </div>
        ) : null
      })}
      {unknown.length > 0 && (
        <div className="bundle-recipients">
          <p>{t('bundles.unassigned', { count: unknown.length })}</p>
          <ul>
            {unknown.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}
      <h4>{t('bundles.wording')}</h4>
      {!notices.length && <p className="bundle-quiet">{t('bundles.no_wording')}</p>}
      {notices.length === 1 && notices[0]?.language === 'en' && (
        <p className="bundle-quiet">{t('bundles.english_only')}</p>
      )}
      {notices.map((notice) => (
        <section
          className="bundle-notice"
          key={notice.language}
          lang={notice.language}
          aria-label={t(`bundles.language.${notice.language}`)}
        >
          <h5>{t(`bundles.language.${notice.language}`)}</h5>
          <p className="bundle-notice-subject">{notice.subject}</p>
          <blockquote>{notice.body}</blockquote>
        </section>
      ))}
      <h4>{t('bundles.delay')}</h4>
      <ol className="bundle-delay">
        <li>
          <time dateTime={call.triggered_at}>
            {t('bundles.crossing', { time: formatTime(call.triggered_at, 'en') })}
          </time>
        </li>
        <li>
          <time dateTime={call.drafted_at}>
            {t('bundles.drafted', {
              time: formatTime(call.drafted_at, 'en'),
              minutes: minutes(call.triggered_at, call.drafted_at)
            })}
          </time>
        </li>
        <li>
          {call.approved_at ? (
            <time dateTime={call.approved_at}>
              {t('bundles.approved_time', {
                time: formatTime(call.approved_at, 'en'),
                minutes: minutes(call.drafted_at, call.approved_at)
              })}
            </time>
          ) : (
            t('bundles.not_approved')
          )}
        </li>
        <li>
          {call.sent_at && call.approved_at ? (
            <time dateTime={call.sent_at}>
              {t('bundles.sent_time', {
                time: formatTime(call.sent_at, 'en'),
                minutes: minutes(call.approved_at, call.sent_at)
              })}
            </time>
          ) : (
            t('bundles.not_sent')
          )}
        </li>
      </ol>
    </section>
  )
})
