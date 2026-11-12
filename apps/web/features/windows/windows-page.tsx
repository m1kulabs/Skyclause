'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
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
import { t, type Locale } from './catalogue'

function viewOf(value: string | null): WindowsView {
  // `calendar` is the old name of the month view.
  return value === 'week' ? 'week' : value === 'month' || value === 'calendar' ? 'month' : 'timeline'
}

export function WindowsPage({
  org,
  project,
  firstRun,
  locale = 'en'
}: {
  org: string
  project: string
  /** The organisation's first-run steps, for those who run them. */
  firstRun?: ReactNode
  locale?: Locale
}) {
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
  // A link from the dashboard or the overview (`?window=`) opens the period that holds that window, once, and marks it
  // as a saved window is marked.
  const linked = search.get('window') ?? undefined
  const linkedWindow = data?.windows.find((window) => window.id === linked)
  const opened = useRef<string>(null)
  useEffect(() => {
    if (!linkedWindow || opened.current === linkedWindow.id) return
    opened.current = linkedWindow.id
    const date = localDate(linkedWindow.starts_at)
    if (date < dates[0]! || date > dates.at(-1)!) update({ from: date })
    // `update` only reads the current query.
  }, [linkedWindow])
  const added = changed?.id ?? linked
  const visible = !!data && data.windows.some((window) => window.id === added) && !outside
  // The API names a series by an id alone: its name is its first occurrence's title.
  const seriesNames = useMemo(() => {
    const names: Record<string, string> = {}
    const first: Record<string, string> = {}
    for (const window of data?.windows ?? []) {
      if (!window.series_id || (first[window.series_id] && first[window.series_id]! <= window.starts_at)) continue
      first[window.series_id] = window.starts_at
      names[window.series_id] = window.title
    }
    return names
  }, [data])
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
      {t('windows.declare', {}, locale)}
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
    locale,
    seriesNames,
    added
  }
  return (
    <section data-windows-page className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-title">{t('windows.title', {}, locale)}</h1>
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
                from: formatDate(`${dates[0]}T12:00:00+08:00`, locale),
                to: formatDate(`${dates.at(-1)}T12:00:00+08:00`, locale)
              },
              locale
            )}
          </span>
          {review > 0 && (
            <span>{t(review === 1 ? 'windows.review_one' : 'windows.review', { count: review }, locale)}</span>
          )}
        </p>
      )}
      {firstRun}
      {(loading || (data && !empty)) && (
        <WindowsToolbar
          view={view}
          from={from}
          onView={(next) => update({ view: next, from })}
          onFrom={(date) => update({ from: date })}
          onStep={(direction) => update({ from: period(direction) })}
          onToday={() => update({ from: localDate() })}
          locale={locale}
        />
      )}
      {failed && (
        <SourceError
          source={t('windows.source_load', {}, locale)}
          status={failed.status}
          at={failed.at}
          locale={locale}
          // A 501 is "not built": reading again cannot change the answer.
          retry={
            failed.status === 501 ? undefined : (
              <Button variant="outline" onClick={reload}>
                {t('windows.retry', {}, locale)}
              </Button>
            )
          }
        />
      )}
      {errors
        .filter((error) => error.key !== 'load')
        .map((error) => (
          <SourceError
            key={error.key}
            source={t(`windows.source_${error.key}`, {}, locale)}
            status={error.status}
            at={error.at}
            locale={locale}
            retry={
              error.status === 501 ? undefined : (
                <Button variant="outline" onClick={reload}>
                  {t('windows.retry', {}, locale)}
                </Button>
              )
            }
          />
        ))}
      {loading && (
        <>
          <p role="status" className="sr-only">
            {t('windows.loading', {}, locale)}
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
          locale={locale}
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
