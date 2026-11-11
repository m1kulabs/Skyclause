import { brandStates } from '@skyclause/elements'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { t } from './catalogue'
import type { EvaluateResult, LatestCallRead } from './evaluate'
import {
  ageMinutesOf,
  blockedLineOf,
  errorLineOf,
  groupedVerdicts,
  notOpenLineOf,
  valueOf,
  type HeroWindow
} from './window-model'
import { CLOCK_SOURCE } from './window-model'
import type { InputValue } from '@skyclause/contracts/api/shared'
import styles from './hero.module.css'

export interface HeroReadoutProps {
  result: EvaluateResult
  win: HeroWindow
  latestCall: LatestCallRead
  calendarQuery: string
  rainAnimated: boolean
}

function InputRow({ input, evaluatedAt }: { input: InputValue; evaluatedAt: string }) {
  const station = input.source_ids[0]
  const value = valueOf(input)
  const age = ageMinutesOf(input, evaluatedAt)
  return (
    <li data-source={input.source_url ?? CLOCK_SOURCE} className={styles.heroInput}>
      <span>{input.name}</span>
      {value ? <span>{value}</span> : null}
      {station ? <span translate="no">{station}</span> : null}
      <span>{age}</span>
      {input.source_url ? (
        <a href={input.source_url} target="_blank" rel="noreferrer">
          {t('landing-hero.open_source', {}, 'en')}
        </a>
      ) : null}
    </li>
  )
}

export function HeroReadout({ result, win: _win, latestCall, calendarQuery, rainAnimated }: HeroReadoutProps) {
  if (result.kind === 'rate_limited') {
    return (
      <div className={styles.heroReadout} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
        <p data-source={CLOCK_SOURCE}>
          <span>{t('landing-hero.retry_after', { time: formatTime(result.retryAfter, 'en') }, 'en')}</span>
        </p>
        <button type="submit" className={styles.heroRetry}>
          {t('landing-hero.retry', {}, 'en')}
        </button>
      </div>
    )
  }
  if (result.kind === 'error') {
    return (
      <div className={styles.heroReadout} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
        <p data-source={CLOCK_SOURCE}>
          <span>{t('landing-hero.fetch_error', { time: formatTime(new Date().toISOString(), 'en') }, 'en')}</span>
        </p>
        <button type="submit" className={styles.heroRetry}>
          {t('landing-hero.retry', {}, 'en')}
        </button>
      </div>
    )
  }

  const { data } = result
  const grouped = groupedVerdicts(data.verdicts)
  const errors = grouped.flatMap((group) => group.inputs.filter((input) => input.state === 'error'))

  return (
    <div className={styles.heroReadout} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
      {grouped.map((group) => (
        <section
          key={group.pack}
          aria-label={t(`landing-hero.${group.pack === 'sky' ? 'sky_line' : 'crowd_line'}`, {}, 'en')}
        >
          <p>{t(`landing-hero.${group.pack === 'sky' ? 'sky_line' : 'crowd_line'}`, {}, 'en')}</p>
          <p className={styles.heroModeWord} data-pack={group.pack}>
            {group.mode ? (
              <>
                <Glyph state={group.mode} />
                <span>{t(brandStates[group.mode].word, {}, 'en')}</span>
              </>
            ) : (
              <>
                <Glyph state="no_call" />
                <span>{t(brandStates.no_call.word, {}, 'en')}</span>
              </>
            )}
          </p>
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
          {group.fired.map((clause) => (
            <p key={clause.key}>
              <span>{clause.key}</span>
            </p>
          ))}
          <ul>
            {group.inputs
              .filter((input) => input.state !== 'error')
              .map((input) => (
                <InputRow
                  key={`${input.name}-${input.source_ids[0] ?? ''}`}
                  input={input}
                  evaluatedAt={data.evaluated_at}
                />
              ))}
          </ul>
        </section>
      ))}
      {errors.map((input) => (
        <p key={`err-${input.name}`} data-source={CLOCK_SOURCE}>
          <span>{errorLineOf(input)}</span>
        </p>
      ))}
      {errors.length ? (
        <button type="submit" className={styles.heroRetry}>
          {t('landing-hero.retry', {}, 'en')}
        </button>
      ) : null}
      <p>{data.label}</p>
      <p data-source={CLOCK_SOURCE}>
        <span>{t('landing-hero.evaluated', { time: formatTime(data.evaluated_at, 'en') }, 'en')}</span>
      </p>
      {latestCall === 'error' ? (
        <p data-source={calendarQuery}>
          <span>{t('landing-hero.latest_call_error', {}, 'en')}</span>
        </p>
      ) : latestCall ? (
        <p data-source={calendarQuery}>
          <a href={latestCall.permalink}>
            <span>{t('landing-hero.latest_call', {}, 'en')}</span>
            <time dateTime={latestCall.at}>{formatDate(latestCall.at, 'en')}</time>
          </a>
        </p>
      ) : (
        <p data-source={calendarQuery}>
          <span>{t('landing-hero.no_approved', {}, 'en')}</span>
        </p>
      )}
    </div>
  )
}
