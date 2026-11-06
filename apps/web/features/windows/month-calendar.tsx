'use client'

import { Button } from '#ui/button'
import { localDate } from './model'
import { WindowEntry, WindowDate } from './window-entry'
import { NightPeriods, type ViewProps } from './timeline'
import { t } from './catalogue'
import { formatDate } from '@skyclause/i18n/format'
import styles from './windows.module.css'

export function MonthCalendar({
  windows,
  dates,
  root,
  feeds,
  bundles,
  nights,
  onEdit,
  onMore
}: ViewProps & { onMore: (date: string) => void }) {
  return (
    <div className={styles.calendar} role="region" aria-label={t('windows.calendar')}>
      {dates.map((date) => {
        const dayWindows = windows
          .filter((window) => localDate(window.starts_at) <= date && localDate(window.ends_at) >= date)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        return (
          <section key={date} className={styles.calendarDay} data-today={date === localDate()}>
            <h2>
              <WindowDate value={date} />
            </h2>
            <NightPeriods nights={nights} dates={[date]} root={root} />
            {dayWindows.slice(0, 3).map((window) => (
              <div key={window.id} data-calendar-window>
                <WindowEntry window={window} root={root} feeds={feeds} bundles={bundles} onEdit={onEdit} compact />
              </div>
            ))}
            {dayWindows.length > 3 && (
              <Button
                data-calendar-more
                variant="ghost"
                aria-label={t('windows.show_all', { date: formatDate(`${date}T12:00:00+08:00`, 'en') })}
                onClick={() => onMore(date)}
              >
                {t('windows.more', { count: dayWindows.length - 3 })}
              </Button>
            )}
          </section>
        )
      })}
    </div>
  )
}
