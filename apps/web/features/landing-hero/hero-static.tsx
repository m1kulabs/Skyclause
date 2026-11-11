import { t } from './catalogue'
import type { EvaluateResult, LatestCall } from './evaluate'
import { CLOCK_SOURCE, groupedVerdicts, hasGaugeError, toLocalTime, windowInstants } from './window-model'
import { HeroReadout } from './readout'
import styles from './hero.module.css'
import { formatDate, formatTime } from '@skyclause/i18n/format'

// Server-rendered picker (no client JavaScript): the no-JS path and the pre-interaction paint.
// The HeroActivator island replaces this markup on first intent.
export function HeroStatic({
  result,
  stripSvg,
  win,
  dates,
  latestCall,
  calendarQuery
}: {
  result: EvaluateResult
  stripSvg: string | null
  win: { date: string; startMin: number; endMin: number }
  dates: string[]
  latestCall: LatestCall | null
  calendarQuery: string
}) {
  const grouped = result.kind === 'ok' ? groupedVerdicts(result.data.verdicts) : []
  const rainAnimated =
    result.kind === 'ok' &&
    !hasGaugeError(grouped.flatMap((group) => group.inputs)) &&
    !grouped.some((group) => group.blocked.length > 0)
  const hours = [0, 6, 12, 18]
  const instants = windowInstants(win)
  return (
    <form
      method="get"
      action="/"
      className={styles.heroPicker}
      data-ui
      aria-label={t('landing-hero.picker_label', {}, 'en')}
    >
      <fieldset className={styles.heroDates}>
        <legend>{t('landing-hero.date_label', {}, 'en')}</legend>
        {dates.map((date, index) => (
          <label key={date} data-source={CLOCK_SOURCE} className={styles.heroDate}>
            <input type="radio" name="date" value={date} defaultChecked={win.date === date} />
            <span>{index === 0 ? t('landing-hero.today', {}, 'en') : formatDate(`${date}T12:00:00+08:00`, 'en')}</span>
          </label>
        ))}
      </fieldset>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('landing-hero.strip_label', {}, 'en')}
        aria-valuemin={0}
        aria-valuemax={1425}
        aria-valuenow={win.startMin}
        aria-valuetext={t(
          'landing-hero.window_text',
          { start: formatTime(instants.from, 'en'), end: formatTime(instants.to, 'en') },
          'en'
        )}
        className={styles.heroSlider}
      >
        {stripSvg ? (
          <figure className={styles.heroStrip} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
            <div
              className={styles.heroStripSvg}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: stripSvg is geometry from derived readings.
              dangerouslySetInnerHTML={{ __html: stripSvg }}
            />
          </figure>
        ) : (
          <div className={styles.heroHours} aria-hidden="true">
            {hours.map((hour) => (
              <span key={hour} data-source={CLOCK_SOURCE}>
                {formatTime(
                  new Date(Date.parse(instants.from) - win.startMin * 60_000 + hour * 3600_000).toISOString(),
                  'en'
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={styles.heroTimes}>
        <label>
          {t('landing-hero.start_label', {}, 'en')}
          <input
            type="text"
            inputMode="numeric"
            placeholder="09:45…"
            name="start"
            autoComplete="off"
            step={900}
            required
            defaultValue={toLocalTime(win.startMin)}
          />
        </label>
        <label>
          {t('landing-hero.end_label', {}, 'en')}
          <input
            type="text"
            inputMode="numeric"
            placeholder="09:45…"
            name="end"
            autoComplete="off"
            step={900}
            required
            defaultValue={toLocalTime(win.endMin)}
          />
        </label>
      </div>
      <div>
        <HeroReadout
          result={result}
          win={win}
          latestCall={latestCall}
          calendarQuery={calendarQuery}
          rainAnimated={rainAnimated}
        />
      </div>
    </form>
  )
}
