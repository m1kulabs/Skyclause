import { formatTime } from '@skyclause/i18n/format'
import { StatusMark } from '../brand/status-mark'
import { MytClock } from '../landing/clock'
import { t } from './catalogue'
import { STATUS_PATH, type StatusRead } from './evaluate'
import { ageMinutesOf, CLOCK_SOURCE } from './window-model'
import styles from './hero.module.css'

/**
 * Live facts in the card, under the day strip (DIRECTION: live data in the frame): the time in MYT, always; the age of
 * the newest gauge reading and Bukit Jalil's mode only when the public status read gives them. A read that is not
 * built (501) adds nothing; a failed one says so.
 */
export function HeroFacts({ now, status }: { now: Date; status: StatusRead }) {
  const iso = now.toISOString()
  // Each fact is one line, its words after its figure, so nothing reads as a label above a heading.
  return (
    <div className={styles.facts}>
      <p className={styles.factNow} data-source={CLOCK_SOURCE}>
        <MytClock initial={{ iso, text: formatTime(iso, 'en') }} />{' '}
        <span className={styles.factWords}>{t('landing-hero.now_label', {}, 'en')}</span>
      </p>
      {status.kind === 'ok' && status.gaugeAt ? (
        <p className={styles.fact} data-source={STATUS_PATH}>
          {t('landing-hero.gauge_fact', { age: ageMinutesOf({ age_s: null, observed_at: status.gaugeAt }, iso) }, 'en')}
        </p>
      ) : null}
      {status.kind === 'ok' && status.mode ? (
        <p className={styles.fact} data-source={STATUS_PATH}>
          <span>{t('landing-hero.mode_fact', {}, 'en')}</span> <StatusMark state={status.mode} />
        </p>
      ) : null}
      {status.kind === 'error' ? (
        <p className={styles.fact} data-source={STATUS_PATH}>
          {t('landing-hero.status_error', { time: formatTime(iso, 'en') }, 'en')}
        </p>
      ) : null}
    </div>
  )
}
