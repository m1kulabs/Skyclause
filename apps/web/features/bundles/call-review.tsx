import { memo } from 'react'
import type { CallDetail } from './operations'
import type { Decision } from './model'
import { teachingLineMissing } from './model'
import { t } from './i18n'
import { formatTime } from '@skyclause/i18n/format'
import { WindowStrip } from '../data-components/window-strip'
import { ModeBadge } from '../brand/mode-badge'
import { InputFact } from './input-fact'

export function callName(call: CallDetail): string {
  return call.window?.title ?? t('bundles.call', { id: call.id })
}

export function modeName(call: Pick<CallDetail, 'mode' | 'watch' | 'no_call'>): string {
  return t(
    `bundles.modes.${call.no_call?.length ? 'no_call' : (call.mode ?? (call.watch ? 'storm_watch' : 'no_call'))}`
  )
}

export const CallReview = memo(function CallReview({
  call,
  decision,
  expired,
  basePath,
  error
}: {
  call: CallDetail
  decision: Decision
  expired: boolean
  basePath: string
  error?: string
}) {
  const notices = decision.notices ?? call.notices
  const recipients = decision.recipients ?? call.recipients
  const unknown = recipients.filter((id) => !call.deliveries.some((delivery) => delivery.recipient_id === id))
  return (
    <>
      <h3>{callName(call)}</h3>
      {call.window && (
        <>
          <WindowStrip windows={[call.window]} />
          <p>
            {t('bundles.window', {
              start: formatTime(call.window.starts_at, 'en'),
              end: formatTime(call.window.ends_at, 'en')
            })}
          </p>
        </>
      )}
      <p className="bundle-mode">
        <ModeBadge mode={call.no_call?.length ? 'no_call' : (call.mode ?? 'storm_watch')} pack={call.shadow.pack} />
        <span>{modeName(call)}</span>
      </p>
      {call.recommendations.map((recommendation) => (
        <p key={recommendation}>{t(`bundles.recommendations.${recommendation}`)}</p>
      ))}
      {call.no_call?.map((name) => {
        const input = call.inputs.find((item) => item.name === name)
        return (
          <p key={name}>
            {input?.since
              ? t('bundles.since', {
                  input: name,
                  state: t(`bundles.states.${input.state}`),
                  time: formatTime(input.since, 'en')
                })
              : name}
          </p>
        )
      })}
      <h4>{t('bundles.clauses')}</h4>
      {!call.fired.length && <p>{t('bundles.no_clauses')}</p>}
      {call.fired.map((fired) => {
        const clause = call.clauses.find((item) => item.key === fired.clause)
        return (
          <div key={fired.clause}>
            <p>{clause?.wording.en ?? fired.clause}</p>
            {clause?.wording.ms && <p lang="ms">{clause.wording.ms}</p>}
            {(clause?.inputs ?? call.inputs.filter((input) => fired.inputs.includes(input.name))).map((input) => (
              <InputFact key={input.name} input={input} />
            ))}
          </div>
        )
      })}
      {call.warnings.map((warning) => (
        <div key={warning.reading_id}>
          <h4>{t('bundles.warning')}</h4>
          <blockquote lang="ms">{warning.text}</blockquote>
          {warning.gloss && <p lang="en">{warning.gloss}</p>}
          <p>
            {t('bundles.window', {
              start: formatTime(warning.valid_from, 'en'),
              end: formatTime(warning.valid_to, 'en')
            })}
          </p>
        </div>
      ))}
      <h4>{t('bundles.recipients', { count: recipients.length })}</h4>
      {!recipients.length && <p>{t('bundles.no_recipients')}</p>}
      {(['en', 'ms'] as const).map((language) => {
        const group = recipients.filter((id) =>
          call.deliveries.some((delivery) => delivery.recipient_id === id && delivery.language === language)
        )
        return group.length ? (
          <div key={language}>
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
        <>
          <p>{t('bundles.unassigned', { count: unknown.length })}</p>
          <ul>
            {unknown.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </>
      )}
      <h4>{t('bundles.wording')}</h4>
      {!notices.length && <p>{t('bundles.no_wording')}</p>}
      {notices.length === 1 && notices[0]?.language === 'en' && <p>{t('bundles.english_only')}</p>}
      {notices.map((notice) => (
        <section
          className="bundle-notice"
          key={notice.language}
          lang={notice.language}
          aria-label={t(`bundles.language.${notice.language}`)}
        >
          <h5>{t(`bundles.language.${notice.language}`)}</h5>
          <p>{notice.subject}</p>
          <blockquote>{notice.body}</blockquote>
        </section>
      ))}
      <p>{t('bundles.expires', { time: formatTime(call.expires_at, 'en') })}</p>
      {(call.state === 'expired' || (expired && ['drafted', 'edited'].includes(call.state))) && (
        <p>{t('bundles.expired')}</p>
      )}
      {decision.action === 'reject' && <p>{t('bundles.rejected')}</p>}
      {call.state === 'superseded' && <p>{t('bundles.superseded')}</p>}
      {call.superseded_by_call_id && (
        <a href={`${basePath}/calls/${encodeURIComponent(call.superseded_by_call_id)}`}>
          {t('bundles.successor_call')}
        </a>
      )}
      {teachingLineMissing(call, decision) && <p className="bundle-error">{t('bundles.teaching_required')}</p>}
      {error && <p className="bundle-error">{error}</p>}
    </>
  )
})
