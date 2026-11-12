import { formatDateLong, formatTime } from '@skyclause/i18n/format'
import { ReplayMark } from '../brand/replay-mark'
import { JPS_SOURCE_URL } from '../landing/data'
import { t } from './catalogue'
import { VerdictBody } from './readout'
import { REPLAY_EVALUATED_AT, REPLAY_GROUPS, REPLAY_WINDOW } from './replay'
import { CLOCK_SOURCE } from './window-model'
import styles from './hero.module.css'

/**
 * The window panel's answer while live verdicts for a chosen window are not open (the read answers 501): the
 * labelled replay of 2 November, drawn on the server and handed to the picker as a node, so its script never ships.
 * What the visitor sees and why sits first; then the replay's window under its Replay mark, and its verdict as a live
 * one would read.
 */
export function ReplayAnswer() {
  return (
    <div className={styles.replay} data-replay>
      <p className={styles.replayLead} data-source={JPS_SOURCE_URL}>
        {t('landing-hero.replay_lead', {}, 'en')}
      </p>
      <p className={styles.replayWindow} data-source={CLOCK_SOURCE}>
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
      <VerdictBody
        groups={REPLAY_GROUPS}
        evaluatedAt={REPLAY_EVALUATED_AT}
        label={t('landing-hero.verdict_label', {}, 'en')}
      />
    </div>
  )
}
