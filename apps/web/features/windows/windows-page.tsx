'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatDate } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { EmptyDay, SourceError } from '../data-components'
import { addDays, calendarDays, localDate, validDate } from './model'
import { DAY_MS, callState, dayStart, weekDays } from './day-model'
import { useWindows } from './use-windows'
import { Timeline, TimelineSkeleton } from './timeline'
import { CalendarView } from './calendar-view'
import { WindowsToolbar, type WindowsView } from './windows-toolbar'
import { t } from './catalogue'

function viewOf(value: string | null): WindowsView {
  // `calendar` is the old name of the month view.
  return value === 'week' ? 'week' : value === 'month' || value === 'calendar' ? 'month' : 'timeline'
}

export function WindowsPage({ org, project }: { org: string; project: string }) {
  const search = useSearchParams()
  const view = viewOf(search.get('view'))
  const from = validDate(search.get('from') ?? '') ? search.get('from')! : localDate()
  const dates =
    view === 'month'
      ? calendarDays(from)
      : view === 'week'
        ? weekDays(from)
        : Array.from({ length: 14 }, (_, index) => addDays(from, index))
  const { data, loading, errors, reload, changed } = useWindows(org, project)
  const root = `/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(search)
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    // The query holds the view; the native call syncs with useSearchParams without refetching the route.
    window.history.replaceState(null, '', `?${next}`)
  }
  function period(direction: -1 | 1) {
    if (view === 'timeline') return addDays(from, direction * 14)
    if (view === 'week') return addDays(from, direction * 7)
    const date = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + direction)
    return date.toISOString().slice(0, 10)
  }
  // A window just saved outside the period brings its date into view; the row is marked where it lands.
  const addedDate = changed?.date
  const outside = !!addedDate && (addedDate < dates[0]! || addedDate > dates.at(-1)!)
  useEffect(() => {
    if (outside && addedDate) update({ from: addedDate })
    // `update` only reads the current query.
  }, [outside, addedDate])
  const added = changed?.id
  const visible = !!data && data.windows.some((window) => window.id === added) && !outside
  useEffect(() => {
    if (visible) document.querySelector('[data-added]')?.scrollIntoView({ block: 'center' })
  }, [visible, data])

  const windows =
    data?.windows.filter(
      (window) => localDate(window.ends_at) >= dates[0]! && localDate(window.starts_at) <= dates.at(-1)!
    ) ?? []
  const failed = errors.find((error) => error.key === 'load')
  const bundlesKnown = !errors.some((error) => error.key === 'bundles')
  const review = bundlesKnown
    ? windows.flatMap((window) =>
        (['sky', 'crowd'] as const).flatMap((pack) => {
          const call = window.latest_calls[pack]
          return call && callState(call, data!.bundles) === 'needs_review' ? [call] : []
        })
      ).length
    : 0
  const empty = !!data && !data.windows.length
  const declare = (
    <Button data-declare-window onClick={() => update({ declare: 'window', edit: null })}>
      {t('windows.declare')}
    </Button>
  )
  const today = dayStart(localDate())
  const edit = (id: string) => update({ edit: id, declare: null })
  const props = data && {
    windows,
    dates,
    root,
    feeds: data.feeds,
    bundles: data.bundles,
    nights: data.nights,
    days: data.days,
    onEdit: edit,
    added
  }
  return (
    <section data-windows-page className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-title">{t('windows.title')}</h1>
        {!empty && declare}
      </div>
      {data && !empty && (
        <p className="flex flex-wrap gap-x-1.5 type-text">
          <span>
            {t(
              windows.length === 1
                ? 'windows.summary_one'
                : windows.length
                  ? 'windows.summary'
                  : 'windows.summary_none',
              {
                count: windows.length,
                from: formatDate(`${dates[0]}T12:00:00+08:00`, 'en'),
                to: formatDate(`${dates.at(-1)}T12:00:00+08:00`, 'en')
              }
            )}
          </span>
          {review > 0 && <span>{t(review === 1 ? 'windows.review_one' : 'windows.review', { count: review })}</span>}
        </p>
      )}
      {(loading || (data && !empty)) && (
        <WindowsToolbar
          view={view}
          from={from}
          onView={(next) => update({ view: next, from })}
          onFrom={(date) => update({ from: date })}
          onStep={(direction) => update({ from: period(direction) })}
          onToday={() => update({ from: localDate() })}
        />
      )}
      {failed && (
        <SourceError
          source={t('windows.source_load')}
          status={failed.status}
          at={failed.at}
          retry={
            <Button variant="outline" onClick={reload}>
              {t('windows.retry')}
            </Button>
          }
        />
      )}
      {errors
        .filter((error) => error.key !== 'load')
        .map((error) => (
          <SourceError
            key={error.key}
            source={t(`windows.source_${error.key}`)}
            status={error.status}
            at={error.at}
            retry={
              <Button variant="outline" onClick={reload}>
                {t('windows.retry')}
              </Button>
            }
          />
        ))}
      {loading && (
        <>
          <p role="status" className="sr-only">
            {t('windows.loading')}
          </p>
          <TimelineSkeleton />
        </>
      )}
      {empty && (
        <EmptyDay
          from={new Date(today).toISOString()}
          to={new Date(today + DAY_MS).toISOString()}
          now={new Date().toISOString()}
          action={declare}
        />
      )}
      {props &&
        !empty &&
        (view === 'timeline' ? (
          <Timeline {...props} />
        ) : (
          <CalendarView
            {...props}
            span={view}
            month={from}
            onMore={(date) => update({ view: 'timeline', from: date })}
          />
        ))}
    </section>
  )
}
