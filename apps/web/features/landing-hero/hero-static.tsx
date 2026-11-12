import type { ReactNode } from 'react'
import { t } from './catalogue'
import type { EvaluateResult, LatestCallRead } from './evaluate'
import {
  CLOCK_SOURCE,
  groupedVerdicts,
  hasGaugeError,
  skyStateOf,
  TIME_INPUT_PATTERN,
  toLocalTime,
  windowLineOf
} from './window-model'
import { HeroBand } from './hero-band'
import { HeroReadout } from './readout'
import styles from './hero.module.css'
import { formatDateCompact } from '@skyclause/i18n/format'

// Server-rendered window panel (no client JavaScript): the no-JS path and the pre-interaction paint. The answer
// leads; then the visitor's window: the day strip, the dates and the times. The HeroActivator island replaces this
// markup on first intent.
export function HeroStatic({
  result,
  stripSvg,
  win,
  dates,
  latestCall,
  calendarQuery,
  now,
  replay,
  replayNote
}: {
  result: EvaluateResult
  stripSvg: string | null
  win: { date: string; startMin: number; endMin: number }
  dates: string[]
  latestCall: LatestCallRead
  calendarQuery: string
  now: string
  replay: ReactNode
  replayNote?: ReactNode
}) {
  const grouped = result.kind === 'ok' ? groupedVerdicts(result.data.verdicts) : []
  const rainAnimated =
    result.kind === 'ok' &&
    !hasGaugeError(grouped.flatMap((group) => group.inputs)) &&
    !grouped.some((group) => group.blocked.length > 0)
  return (
    <form
      method="get"
      action="/"
      className={styles.panel}
      data-ui
      id="window"
      aria-label={t('landing-hero.picker_label', {}, 'en')}
    >
      <div className={styles.answer}>
        {stripSvg ? (
          <figure className={styles.rain} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
            <div
              className={styles.rainSvg}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: stripSvg is geometry from derived readings.
              dangerouslySetInnerHTML={{ __html: stripSvg }}
            />
          </figure>
        ) : null}
        <div aria-live="polite">
          <HeroReadout
            result={result}
            win={win}
            latestCall={latestCall}
            calendarQuery={calendarQuery}
            rainAnimated={rainAnimated}
            replay={replay}
            replayNote={replayNote}
          />
        </div>
      </div>
      <fieldset className={styles.window}>
        <legend className={styles.legend}>{t('landing-hero.window_legend', {}, 'en')}</legend>
        <HeroBand win={win} state={skyStateOf(grouped)} now={now} />
        <div className={styles.dates}>
          {dates.map((date, index) => (
            <label key={date} data-source={CLOCK_SOURCE} className={styles.date}>
              <input type="radio" name="date" value={date} defaultChecked={win.date === date} />
              <span>
                {index === 0 ? t('landing-hero.today', {}, 'en') : formatDateCompact(`${date}T12:00:00+08:00`, 'en')}
              </span>
            </label>
          ))}
        </div>
        <div className={styles.times}>
          <label className={styles.field}>
            <span>{t('landing-hero.start_label', {}, 'en')}</span>
            <input
              type="text"
              inputMode="text"
              enterKeyHint="go"
              placeholder="09:45…"
              name="start"
              autoComplete="off"
              spellCheck={false}
              pattern={TIME_INPUT_PATTERN}
              title={t('landing-hero.time_error', {}, 'en')}
              required
              defaultValue={toLocalTime(win.startMin)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('landing-hero.end_label', {}, 'en')}</span>
            <input
              type="text"
              inputMode="text"
              enterKeyHint="go"
              placeholder="09:45…"
              name="end"
              autoComplete="off"
              spellCheck={false}
              pattern={TIME_INPUT_PATTERN}
              title={t('landing-hero.time_error', {}, 'en')}
              required
              defaultValue={toLocalTime(win.endMin)}
            />
          </label>
          <p
            className={styles.zone}
            data-window-line={result.kind === 'unavailable' ? '' : undefined}
            data-source={CLOCK_SOURCE}
          >
            {result.kind === 'unavailable' ? windowLineOf(win) : t('landing-hero.time_zone', {}, 'en')}
          </p>
          {/* Two text fields block implicit submission, so the no-JS form needs its own submit control. */}
          <noscript>
            <button type="submit" className={styles.retry}>
              {t('landing-hero.check_window', {}, 'en')}
            </button>
          </noscript>
        </div>
      </fieldset>
    </form>
  )
}
