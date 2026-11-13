import { formatDateLong, formatTime } from '@skyclause/i18n/format'
import { ReplayMark } from '../brand/replay-mark'
import { StatusMark } from '../brand/status-mark'
import { JPS_SOURCE_URL, JPS_STATION } from '../landing/data'
import { t } from './catalogue'
import { ReplayBand } from './hero-band'
import { REPLAY_EVALUATED_AT, REPLAY_GROUPS, REPLAY_WINDOW } from './replay'
import { ageMinutesOf, clauseNameOf, CLOCK_SOURCE, valueOf } from './window-model'
import styles from './hero.module.css'

/**
 * The window panel's answer while live verdicts for a chosen window are not open (the read answers 501): the
 * labelled replay of 2 November, drawn on the server and handed to the picker as a node, so its script never ships.
 * It reads as the product would say it: the call first (its mode, and the window it is for), the clause that fired on
 * the gauge's reading, the label every verdict wears, then the replay's date and window on a strip of its own day.
 */
export function ReplayAnswer() {
  const sky = REPLAY_GROUPS[0]!
  const gauge = sky.inputs[0]!
  const mode = sky.mode ?? 'no_call'
  const call = t('landing-hero.replay_call', { time: formatTime(REPLAY_WINDOW.from, 'en') }, 'en')
  return (
    <div className={styles.replay} data-replay>
      <p className={styles.statement} data-statement data-pack="sky" data-source={CLOCK_SOURCE}>
        <StatusMark state={mode} /> <span>{call}</span>
      </p>
      {sky.fired.map((clause) => (
        <p key={clause.key} className={styles.fired}>
          {t('landing-hero.fired_clause', { clause: clauseNameOf(clause.key) }, 'en')}
        </p>
      ))}
      <ul className={styles.inputs}>
        <li data-source={JPS_SOURCE_URL} className={styles.input}>
          <span className={styles.inputName}>{t('landing-hero.replay_gauge', { station: JPS_STATION }, 'en')}</span>
          <span data-numeric>{t('landing-hero.replay_reading', { value: valueOf(gauge) ?? '' }, 'en')}</span>
          <span className={styles.age}>{ageMinutesOf(gauge, REPLAY_EVALUATED_AT)}</span>
          <a
            href={JPS_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={t('landing-hero.replay_source_named', { station: JPS_STATION }, 'en')}
          >
            {t('landing-hero.replay_source', {}, 'en')}
          </a>
        </li>
      </ul>
      <div className={styles.verdictHead}>
        <p className={styles.label}>{t('landing-hero.verdict_label', {}, 'en')}</p>
        <p data-source={CLOCK_SOURCE} className={styles.meta}>
          <span>{t('landing-hero.evaluated', { time: formatTime(REPLAY_EVALUATED_AT, 'en') }, 'en')}</span>
        </p>
      </div>
      <div className={styles.replayDay}>
        <p className={styles.replayWindow} data-replay-window data-source={CLOCK_SOURCE}>
          <ReplayMark data-source={JPS_SOURCE_URL} />
          <span>
            {t(
              'landing-hero.replay_window',
              {
                date: formatDateLong(REPLAY_WINDOW.from, 'en'),
                start: formatTime(REPLAY_WINDOW.from, 'en'),
                end: formatTime(REPLAY_WINDOW.to, 'en')
              },
              'en'
            )}
          </span>
        </p>
        <ReplayBand from={REPLAY_WINDOW.from} to={REPLAY_WINDOW.to} state={mode} />
      </div>
    </div>
  )
}

/** Why the answer is a replay, said last and small in the product's words: live verdicts for a chosen window open later. */
export function ReplayNote() {
  return (
    <p className={styles.replayNote} data-source={JPS_SOURCE_URL}>
      {t('landing-hero.replay_lead', {}, 'en')}
    </p>
  )
}
