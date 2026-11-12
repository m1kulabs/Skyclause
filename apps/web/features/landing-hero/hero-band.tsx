import type { HTMLAttributes, Ref } from 'react'
import { brandStates, type BrandState } from '@skyclause/elements'
import { formatClock, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { t } from './catalogue'
import { CLOCK_SOURCE, DAY_MIN, localDateOf, windowInstants, type HeroWindow } from './window-model'
import styles from './hero.module.css'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const TICKS = [0, 6, 12, 18, 24]

export interface HeroBandProps {
  win: HeroWindow
  /** The Sky verdict's mode for this window, when a read answered; the capsule takes its tone and glyph. */
  state: BrandState | null
  /** The picker's pointer and key handlers; the server render has none and its first intent wakes the picker. */
  sliderProps?: HTMLAttributes<HTMLDivElement>
  sliderRef?: Ref<HTMLDivElement>
  /** Now, as an instant: marked on the strip when the window's date is today in MYT. */
  now: string
}

/**
 * The hero's stripe band: one day of 24 hours as alternating bars, and the visitor's window lying on it as the capsule.
 * The track is the slider; the capsule is its picture. Without a verdict the capsule is the ink of a selection.
 */
export function HeroBand({ win, state, sliderProps, sliderRef, now }: HeroBandProps) {
  const instants = windowInstants(win)
  const left = (win.startMin / DAY_MIN) * 100
  const width = ((win.endMin - win.startMin) / DAY_MIN) * 100
  const midnight = Date.parse(instants.from) - win.startMin * 60_000
  const tone = state ? brandStates[state].tone : null
  const nowAt = Date.parse(now)
  const nowLeft = localDateOf(new Date(nowAt)) === win.date ? ((nowAt - midnight) / 86_400_000) * 100 : null
  return (
    <div className={styles.band}>
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label={t('landing-hero.strip_label', {}, 'en')}
        aria-describedby="hero-strip-help"
        aria-valuemin={0}
        aria-valuemax={1425}
        aria-valuenow={win.startMin}
        aria-valuetext={t(
          'landing-hero.window_text',
          { start: formatTime(instants.from, 'en'), end: formatTime(instants.to, 'en') },
          'en'
        )}
        className={styles.track}
        {...sliderProps}
      >
        <span className={styles.hours} aria-hidden="true">
          {HOURS.map((hour) => (
            <span key={hour} className={styles.hour} />
          ))}
        </span>
        <span
          className={styles.capsule}
          data-tone={tone ?? undefined}
          data-state={state ?? 'selection'}
          aria-hidden="true"
          style={{ left: `${left.toFixed(3)}%`, width: `max(28px, ${width.toFixed(3)}%)` }}
        >
          {state ? <Glyph state={state} width={14} height={14} /> : null}
        </span>
        {nowLeft !== null ? (
          <span className={styles.now} data-now aria-hidden="true" style={{ left: `${nowLeft.toFixed(3)}%` }} />
        ) : null}
      </div>
      <p id="hero-strip-help" className="sr-only" data-source={CLOCK_SOURCE}>
        {t('landing-hero.strip_help', {}, 'en')}
      </p>
      <div className={styles.ticks} data-source={CLOCK_SOURCE}>
        {TICKS.map((hour) => {
          const at = new Date(midnight + hour * 3_600_000).toISOString()
          return (
            <time key={hour} dateTime={at} style={{ left: `${((hour / 24) * 100).toFixed(3)}%` }}>
              {hour === 24 ? t('landing-hero.midnight', {}, 'en') : formatClock(at, 'en')}
            </time>
          )
        })}
      </div>
    </div>
  )
}
