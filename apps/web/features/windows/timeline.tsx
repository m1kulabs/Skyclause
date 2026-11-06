'use client'

import type { CSSProperties } from 'react'
import { formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import { ModeBadge } from '../brand/mode-badge'
import { localDate } from './model'
import type { WindowView, FeedView, BundleView, NightView, DayView } from './operations'
import { WindowEntry, callState } from './window-entry'
import { VirtualRows } from './virtual-rows'
import { t } from './catalogue'
import styles from './windows.module.css'

const DAY = 86_400_000
function position(start: string, end: string, from: string, length: number): CSSProperties {
  const origin = Date.parse(`${from}T00:00:00+08:00`)
  const left = Math.max(0, ((Date.parse(start) - origin) / DAY / length) * 100)
  const right = Math.min(100, ((Date.parse(end) - origin) / DAY / length) * 100)
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` }
}

export interface ViewProps {
  windows: WindowView[]
  dates: string[]
  root: string
  feeds: FeedView[]
  bundles: BundleView[]
  nights: NightView[]
  days?: DayView[]
  onEdit: (id: string) => void
}

export function NightPeriods({ nights, dates, root }: Pick<ViewProps, 'nights' | 'dates' | 'root'>) {
  return (
    <div className={styles.nightLabels}>
      {nights
        .filter((night) => night.date >= dates[0]! && night.date <= dates.at(-1)!)
        .map((night) => (
          <div key={night.id} className={styles.nightLabel}>
            <a href={`${root}/nights/${encodeURIComponent(night.id)}`}>
              {night.show_name
                ? t('windows.show_name', { name: night.show_name })
                : t('windows.night', { date: night.date })}
            </a>
            <span>
              {t('windows.arrival')}
              {t('windows.period', {
                from: formatTime(night.arrival_start, 'en'),
                to: formatTime(night.arrival_end, 'en')
              })}
            </span>
            {night.exit_start && night.exit_end ? (
              <span>
                {t('windows.exit')}
                {t('windows.period', {
                  from: formatTime(night.exit_start, 'en'),
                  to: formatTime(night.exit_end, 'en')
                })}
              </span>
            ) : (
              <span>{t('windows.no_exit')}</span>
            )}
          </div>
        ))}
    </div>
  )
}

export function Timeline({ windows, dates, root, feeds, bundles, nights, days = [], onEdit }: ViewProps) {
  const sorted = [...windows].sort(
    (a, b) =>
      Number(a.guest) - Number(b.guest) ||
      ['class', 'event', 'commute_wave'].indexOf(a.kind) - ['class', 'event', 'commute_wave'].indexOf(b.kind) ||
      a.starts_at.localeCompare(b.starts_at)
  )
  const kinds = new Set<string>()
  for (const window of windows) {
    kinds.add(window.guest ? 'guest' : 'window')
    for (const pack of ['sky', 'crowd'] as const) {
      const call = window.latest_calls[pack]
      if (call) kinds.add(callState(call, bundles))
    }
  }
  return (
    <>
      <NightPeriods nights={nights} dates={dates} root={root} />
      <div className={styles.legend} aria-label={t('windows.legend')}>
        {[...kinds].map((kind) => (
          <span key={kind} data-mark={kind}>
            {t(`windows.${kind}`)}
          </span>
        ))}
      </div>
      <div className={styles.timelineHeader}>
        <div>{t('windows.window')}</div>
        <div className={styles.days}>
          {dates.map((date) => (
            <div
              key={date}
              data-weekend={[0, 6].includes(new Date(date).getUTCDay())}
              data-today={date === localDate()}
            >
              <time dateTime={date} title={formatDate(`${date}T12:00:00+08:00`, 'en')}>
                <span aria-hidden="true">
                  {t('windows.day', { date: formatNumber(new Date(date).getUTCDate(), 'en') })}
                </span>
                <span className="sr-only">{formatDate(`${date}T12:00:00+08:00`, 'en')}</span>
              </time>
              {days.find((day) => day.date === date)?.storm_afternoon && (
                <a lang="ms" href={days.find((day) => day.date === date)!.storm_afternoon!.source_url}>
                  {t('windows.met_wording', {
                    wording: days.find((day) => day.date === date)!.storm_afternoon!.wording
                  })}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
      <VirtualRows
        items={sorted}
        label={t('windows.timeline')}
        className={styles.timeline}
        render={(window, index) => {
          const kind = window.guest ? 'guest_window' : window.kind
          const previous = sorted[index - 1]
          const group = !previous || kind !== (previous.guest ? 'guest_window' : previous.kind)
          return (
            <div data-window-row>
              {group && <h2 className={styles.kind}>{t(`windows.${kind}`)}</h2>}
              <div className={styles.timelineRow}>
                <WindowEntry window={window} root={root} feeds={feeds} bundles={bundles} onEdit={onEdit} />
                <div className={styles.axis}>
                  <div className={styles.dayLines} aria-hidden="true">
                    {dates.map((date) => (
                      <div
                        key={date}
                        data-weekend={[0, 6].includes(new Date(date).getUTCDay())}
                        data-today={date === localDate()}
                      />
                    ))}
                  </div>
                  {nights
                    .filter(
                      (night) =>
                        localDate(night.arrival_start) <= dates.at(-1)! &&
                        localDate(night.exit_end ?? night.arrival_end) >= dates[0]!
                    )
                    .map((night) => (
                      <div key={night.id} aria-hidden="true">
                        <span
                          data-period="arrival"
                          className={styles.arrival}
                          style={position(night.arrival_start, night.arrival_end, dates[0]!, dates.length)}
                        />
                        {night.exit_start && night.exit_end && (
                          <span
                            data-period="exit"
                            className={styles.exit}
                            style={position(night.exit_start, night.exit_end, dates[0]!, dates.length)}
                          />
                        )}
                      </div>
                    ))}
                  <button
                    type="button"
                    className={styles.bar}
                    style={{ ...position(window.starts_at, window.ends_at, dates[0]!, dates.length), top: 4 }}
                    data-mark={window.guest ? 'guest' : 'window'}
                    onClick={() => onEdit(window.id)}
                    aria-label={t('windows.bar', {
                      title: window.title,
                      start: formatTime(window.starts_at, 'en'),
                      end: formatTime(window.ends_at, 'en'),
                      state: t(window.guest ? 'windows.guest' : 'windows.window')
                    })}
                  >
                    <span className="sr-only">{window.title}</span>
                  </button>
                  {(['sky', 'crowd'] as const).map((pack, index) => {
                    const call = window.latest_calls[pack]
                    if (!call) return null
                    return (
                      <a
                        key={pack}
                        className={styles.bar}
                        style={{
                          ...position(window.starts_at, window.ends_at, dates[0]!, dates.length),
                          top: 36 + index * 32
                        }}
                        href={`${root}/bundles/${encodeURIComponent(call.bundle_id)}`}
                        data-mark={callState(call, bundles)}
                        aria-label={t('windows.bar', {
                          title: window.title,
                          start: formatTime(window.starts_at, 'en'),
                          end: formatTime(window.ends_at, 'en'),
                          state: t('windows.call', {
                            pack: t(`windows.${pack}`),
                            mode: t(`windows.${call.mode ?? 'no_call'}`),
                            state: t(`windows.${callState(call, bundles)}`)
                          })
                        })}
                      >
                        <ModeBadge mode={call.mode ?? 'no_call'} pack={pack} />
                        <span className="sr-only">{t(`windows.${pack}`)}</span>
                      </a>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        }}
      />
    </>
  )
}
