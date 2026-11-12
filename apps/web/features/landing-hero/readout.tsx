import type { ReactNode } from 'react'
import type { InputValue } from '@skyclause/contracts/api/shared'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'
import type { EvaluateResult, LatestCallRead } from './evaluate'
import {
  ageMinutesOf,
  blockedLineOf,
  clauseNameOf,
  CLOCK_SOURCE,
  errorLineOf,
  groupedVerdicts,
  inputNameOf,
  notOpenLineOf,
  valueOf,
  type GroupedVerdict,
  type HeroWindow
} from './window-model'
import styles from './hero.module.css'

export interface HeroReadoutProps {
  result: EvaluateResult
  win: HeroWindow
  latestCall: LatestCallRead
  calendarQuery: string
  rainAnimated: boolean
  /** The labelled replay the server drew (ReplayAnswer), the answer while live verdicts are not open. */
  replay: ReactNode
  /** A read the visitor asked for is under way: the answer on screen is the last window's, dimmed and said so. */
  pending?: boolean
}

/** Retry sends the form again; while that read runs it says so and is not sent twice (it keeps focus). */
function RetryButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className={styles.retry} aria-disabled={pending || undefined}>
      {t(pending ? 'landing-hero.retrying' : 'landing-hero.retry', {}, 'en')}
    </button>
  )
}

function InputRow({ input, evaluatedAt }: { input: InputValue; evaluatedAt: string }) {
  const station = input.source_ids[0]
  const value = valueOf(input)
  const age = ageMinutesOf(input, evaluatedAt)
  const name = inputNameOf(input.name)
  return (
    <li data-source={input.source_url ?? CLOCK_SOURCE} className={styles.input}>
      <span className={styles.inputName}>{name}</span>
      {value ? <span data-numeric>{value}</span> : null}
      {station ? <span translate="no">{station}</span> : null}
      <span className={styles.age}>{age}</span>
      {input.source_url ? (
        <a
          href={input.source_url}
          target="_blank"
          rel="noreferrer"
          aria-label={t('landing-hero.open_source_named', { name }, 'en')}
        >
          {t('landing-hero.open_source', {}, 'en')}
        </a>
      ) : null}
    </li>
  )
}

/**
 * A verdict as the panel shows it, live or replayed: the label and when it was evaluated, then per pack its mode, its
 * fired clauses, each blocked or not-yet-open clause, and every input with its value, station and age.
 */
export function VerdictBody({
  groups,
  evaluatedAt,
  label,
  pending = false
}: {
  groups: readonly GroupedVerdict[]
  evaluatedAt: string
  label: string
  pending?: boolean
}) {
  const errors = groups.flatMap((group) => group.inputs.filter((input) => input.state === 'error'))
  return (
    <>
      <div className={styles.verdictHead}>
        <p className={styles.label}>{label}</p>
        <p data-source={CLOCK_SOURCE} className={styles.meta}>
          <span>
            {pending
              ? t('landing-hero.checking', {}, 'en')
              : t('landing-hero.evaluated', { time: formatTime(evaluatedAt, 'en') }, 'en')}
          </span>
        </p>
      </div>
      {groups.map((group) => (
        <section
          key={group.pack}
          className={styles.pack}
          aria-label={t(`landing-hero.${group.pack === 'sky' ? 'sky_line' : 'crowd_line'}`, {}, 'en')}
        >
          <div className={styles.packHead}>
            <p className={styles.packName}>
              {t(`landing-hero.${group.pack === 'sky' ? 'sky_line' : 'crowd_line'}`, {}, 'en')}
            </p>
            <p className={styles.mode} data-pack={group.pack}>
              <StatusMark state={group.mode ?? 'no_call'} />
            </p>
            {group.fired.map((clause) => (
              <p key={clause.key} className={styles.fired}>
                {t('landing-hero.fired_clause', { clause: clauseNameOf(clause.key) }, 'en')}
              </p>
            ))}
          </div>
          {group.blocked.flatMap((clause) =>
            clause.blocked_by.map((blocked) => (
              <p key={`${clause.key}-${blocked.name}`} translate="no" data-source={CLOCK_SOURCE}>
                <span>{blockedLineOf({ clause: clause.key, blocked })}</span>
              </p>
            ))
          )}
          {group.notOpen
            .filter((clause) => clause.openFrom)
            .map((clause) => (
              <p key={clause.key} data-source={CLOCK_SOURCE}>
                <span>{notOpenLineOf(clause.key, clause.openFrom!)}</span>
              </p>
            ))}
          <ul className={styles.inputs}>
            {group.inputs
              .filter((input) => input.state !== 'error')
              .map((input) => (
                <InputRow key={`${input.name}-${input.source_ids[0] ?? ''}`} input={input} evaluatedAt={evaluatedAt} />
              ))}
          </ul>
        </section>
      ))}
      {errors.map((input) => (
        <p key={`err-${input.name}`} data-source={CLOCK_SOURCE}>
          <span>{errorLineOf(input)}</span>
        </p>
      ))}
      {errors.length ? <RetryButton pending={pending} /> : null}
    </>
  )
}

/** A read that failed (no answer, a timeout, a server error) or was refused for now (429): said plainly, with Retry. */
function ReadFailure({
  title,
  detail,
  glyph,
  pending
}: {
  title: string
  detail: string
  glyph: 'error' | 'stale'
  pending: boolean
}) {
  return (
    <div className={styles.error}>
      <p className={styles.errorTitle}>
        <Glyph state={glyph} width={16} height={16} />
        <span>{title}</span>
      </p>
      <p data-source={CLOCK_SOURCE} className={styles.errorDetail}>
        {pending ? t('landing-hero.checking', {}, 'en') : detail}
      </p>
      <RetryButton pending={pending} />
    </div>
  )
}

/** LND-3: the latest approved call from its real read, in every state of the verdict. */
function LatestCallLine({ latestCall, calendarQuery }: { latestCall: LatestCallRead; calendarQuery: string }) {
  if (latestCall === 'error' || latestCall === 'not_built') {
    return (
      <p data-source={calendarQuery} className={styles.meta}>
        <span>
          {t(latestCall === 'error' ? 'landing-hero.latest_call_error' : 'landing-hero.latest_call_unopened', {}, 'en')}
        </span>
      </p>
    )
  }
  // The permalink's page (/c/{callId}, PUB-3) is not built yet: the date stands alone until it is.
  return latestCall ? (
    <p data-source={calendarQuery} className={styles.meta}>
      <span>{t('landing-hero.latest_call', {}, 'en')}</span>
      <time dateTime={latestCall.at}>{formatDate(latestCall.at, 'en')}</time>
    </p>
  ) : (
    <p data-source={calendarQuery} className={styles.meta}>
      <span>{t('landing-hero.no_approved', {}, 'en')}</span>
    </p>
  )
}

export function HeroReadout({
  result,
  latestCall,
  calendarQuery,
  rainAnimated,
  replay,
  pending = false
}: HeroReadoutProps) {
  let answer: ReactNode
  if (result.kind === 'unavailable') answer = replay
  else if (result.kind === 'rate_limited')
    answer = (
      <ReadFailure
        glyph="stale"
        pending={pending}
        title={t('landing-hero.rate_limited', {}, 'en')}
        detail={t('landing-hero.retry_after', { time: formatTime(result.retryAfter, 'en') }, 'en')}
      />
    )
  else if (result.kind === 'error')
    answer = (
      <ReadFailure
        glyph="error"
        pending={pending}
        title={t('landing-hero.fetch_error', {}, 'en')}
        detail={t('landing-hero.fetch_error_at', { time: formatTime(result.at, 'en') }, 'en')}
      />
    )
  else
    answer = (
      <VerdictBody
        groups={groupedVerdicts(result.data.verdicts)}
        evaluatedAt={result.data.evaluated_at}
        label={result.data.label}
        pending={pending}
      />
    )
  return (
    <div
      className={styles.readout}
      data-rain-animated={rainAnimated ? 'yes' : 'no'}
      data-pending={pending ? 'yes' : undefined}
    >
      {answer}
      <LatestCallLine latestCall={latestCall} calendarQuery={calendarQuery} />
    </div>
  )
}
