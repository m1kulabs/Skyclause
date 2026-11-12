import { formatDate, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'
import { EVALUATE_PATH, type EvaluateResult, type LatestCallRead } from './evaluate'
import {
  ageMinutesOf,
  blockedLineOf,
  clauseNameOf,
  inputNameOf,
  errorLineOf,
  groupedVerdicts,
  notOpenLineOf,
  valueOf,
  type HeroWindow
} from './window-model'
import { CLOCK_SOURCE } from './window-model'
import { JPS_SOURCE_URL } from '../landing/data'
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
  const name = inputNameOf(input.name, station)
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
 * The read failed, or the verdict is not built (501). A failed read can be tried again; a part that is not built cannot,
 * so its way forward is the labelled replay of a real day further down the page.
 */
function ReadError({ status, at }: { status: number | null; at: string }) {
  const notBuilt = status === 501
  return (
    <div className={styles.error}>
      <p data-source={CLOCK_SOURCE} className={styles.errorTitle}>
        <Glyph state="error" width={16} height={16} />
        <span>
          {notBuilt
            ? t('landing-hero.not_built_title', {}, 'en')
            : t('landing-hero.fetch_error', { time: formatTime(at, 'en') }, 'en')}
        </span>
      </p>
      {status !== null ? (
        <p data-source={EVALUATE_PATH} className={styles.errorDetail}>
          {notBuilt
            ? t('landing-hero.not_built', { time: formatTime(at, 'en') }, 'en')
            : t('landing-hero.answered', { status }, 'en')}
        </p>
      ) : null}
      {notBuilt ? (
        <a href="#how" className={styles.next} data-source={JPS_SOURCE_URL}>
          {t('landing-hero.see_replay', {}, 'en')}
        </a>
      ) : (
        <button type="submit" className={styles.retry}>
          {t('landing-hero.retry', {}, 'en')}
        </button>
      )}
    </div>
  )
}

/** LND-3: the latest approved call from its real read, in every state of the verdict; a 501 or a failure says so. */
function LatestCallLine({ latestCall, calendarQuery }: { latestCall: LatestCallRead; calendarQuery: string }) {
  if (latestCall === 'error' || latestCall === 'not_built') {
    return (
      <p data-source={calendarQuery} className={styles.meta}>
        <span>
          {t(
            latestCall === 'error' ? 'landing-hero.latest_call_error' : 'landing-hero.latest_call_not_built',
            {},
            'en'
          )}
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

export function HeroReadout({ result, win: _win, latestCall, calendarQuery, rainAnimated }: HeroReadoutProps) {
  if (result.kind === 'rate_limited') {
    return (
      <div className={styles.readout} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
        <p data-source={CLOCK_SOURCE} className={styles.errorTitle}>
          <span>{t('landing-hero.retry_after', { time: formatTime(result.retryAfter, 'en') }, 'en')}</span>
        </p>
        <button type="submit" className={styles.retry}>
          {t('landing-hero.retry', {}, 'en')}
        </button>
        <LatestCallLine latestCall={latestCall} calendarQuery={calendarQuery} />
      </div>
    )
  }
  if (result.kind === 'error') {
    return (
      <div className={styles.readout} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
        <ReadError status={result.status} at={result.at} />
        <LatestCallLine latestCall={latestCall} calendarQuery={calendarQuery} />
      </div>
    )
  }

  const { data } = result
  const grouped = groupedVerdicts(data.verdicts)
  const errors = grouped.flatMap((group) => group.inputs.filter((input) => input.state === 'error'))

  return (
    <div className={styles.readout} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
      <p className={styles.label}>{data.label}</p>
      {grouped.map((group) => (
        <section
          key={group.pack}
          className={styles.pack}
          aria-label={t(`landing-hero.${group.pack === 'sky' ? 'sky_line' : 'crowd_line'}`, {}, 'en')}
        >
          <p className={styles.packName}>
            {t(`landing-hero.${group.pack === 'sky' ? 'sky_line' : 'crowd_line'}`, {}, 'en')}
          </p>
          <p className={styles.mode} data-pack={group.pack}>
            <StatusMark state={group.mode ?? 'no_call'} />
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
            <p key={clause.key} className={styles.fired}>
              <span>{clauseNameOf(clause.key)}</span>
            </p>
          ))}
          <ul className={styles.inputs}>
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
        <button type="submit" className={styles.retry}>
          {t('landing-hero.retry', {}, 'en')}
        </button>
      ) : null}
      <p data-source={CLOCK_SOURCE} className={styles.meta}>
        <span>{t('landing-hero.evaluated', { time: formatTime(data.evaluated_at, 'en') }, 'en')}</span>
      </p>
      <LatestCallLine latestCall={latestCall} calendarQuery={calendarQuery} />
    </div>
  )
}
