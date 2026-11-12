'use client'

import { formatDate, formatDateCompact, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { WEEKDAYS, localDate } from './model'
import { WindowEntry } from './window-entry'
import { Night, Timeline, type ViewProps } from './timeline'
import { useMedia } from './use-media'
import { t } from './catalogue'

const CAPS = { week: 6, month: 3 } as const

/**
 * The same windows by week or month: a grid of days on a wide screen, and on a phone the days that have windows as
 * the timeline's rows, because seven columns of 50px cannot hold a title.
 */
export function CalendarView({
  span,
  month,
  onMore,
  ...props
}: ViewProps & {
  span: 'week' | 'month'
  /** The month whose days are not dimmed (month view). */ month: string
  onMore: (date: string) => void
}) {
  const wide = useMedia('(min-width: 768px)')
  const { windows, dates, root, feeds, bundles, nights, onEdit, added } = props
  if (!wide) return <Timeline {...props} hideEmpty />
  return (
    <div
      role="region"
      aria-label={t(span === 'week' ? 'windows.view_week' : 'windows.view_month')}
      data-calendar={span}
    >
      <div aria-hidden="true" className="mb-2 grid grid-cols-7 gap-2 type-small text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <span key={day} className="px-2.5">
            {t(`windows.${day}`)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {dates.map((date, index) => {
          const dayWindows = windows
            .filter((window) => localDate(window.starts_at) <= date && localDate(window.ends_at) >= date)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          const today = date === localDate()
          const outside = span === 'month' && date.slice(0, 7) !== month.slice(0, 7)
          const cap = CAPS[span]
          const number = formatNumber(new Date(date).getUTCDate(), 'en')
          const label =
            (index === 0 && span === 'month') || date.endsWith('-01')
              ? formatDateCompact(`${date}T12:00:00+08:00`, 'en')
              : t('windows.day', { date: number })
          return (
            <section
              key={date}
              data-calendar-day={date}
              data-today={today}
              data-outside={outside}
              className="flex min-h-36 min-w-0 flex-col gap-2 rounded-xl bg-card p-2.5 data-[outside=true]:bg-transparent data-[outside=true]:text-muted-foreground"
            >
              <h2
                aria-current={today ? 'date' : undefined}
                className="type-body relative w-fit pb-2 font-medium current-mark"
                aria-label={formatDate(`${date}T12:00:00+08:00`, 'en')}
              >
                <time dateTime={date} aria-hidden="true">
                  {label}
                </time>
              </h2>
              {nights
                .filter((night) => night.date === date)
                .map((night) => (
                  <ul key={night.id}>
                    <Night night={night} />
                  </ul>
                ))}
              {dayWindows.slice(0, cap).map((window) => (
                <div key={window.id} data-calendar-window>
                  <WindowEntry
                    window={window}
                    root={root}
                    feeds={feeds}
                    bundles={bundles}
                    onEdit={onEdit}
                    added={window.id === added}
                    compact
                  />
                </div>
              ))}
              {dayWindows.length > cap && (
                <Button
                  data-calendar-more
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  aria-label={t('windows.show_all', { date: formatDate(`${date}T12:00:00+08:00`, 'en') })}
                  onClick={() => onMore(date)}
                >
                  {t('windows.more', { count: dayWindows.length - cap })}
                </Button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
