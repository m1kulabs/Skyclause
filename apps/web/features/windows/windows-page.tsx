'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Empty, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Alert, AlertDescription } from '#ui/alert'
import { addDays, calendarDays, localDate, validDate } from './model'
import { useWindows } from './use-windows'
import { Timeline } from './timeline'
import { MonthCalendar } from './month-calendar'
import { WindowDate } from './window-entry'
import { t } from './catalogue'
import styles from './windows.module.css'

export function WindowsPage({ org, project }: { org: string; project: string }) {
  const search = useSearchParams()
  const router = useRouter()
  const view = search.get('view') === 'calendar' ? 'calendar' : 'timeline'
  const from = validDate(search.get('from') ?? '') ? search.get('from')! : localDate()
  const dates =
    view === 'calendar' ? calendarDays(from) : Array.from({ length: 14 }, (_, index) => addDays(from, index))
  const { data, loading, errors, reload } = useWindows(org, project)
  const root = `/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(search)
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    router.replace(`?${next}`, { scroll: false })
  }
  function period(direction: number) {
    if (view === 'timeline') return addDays(from, direction * 14)
    const date = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + direction)
    return date.toISOString().slice(0, 10)
  }
  const windows =
    data?.windows.filter(
      (window) => localDate(window.ends_at) >= dates[0]! && localDate(window.starts_at) <= dates.at(-1)!
    ) ?? []
  const edit = (id: string) => update({ edit: id, declare: null })
  return (
    <section className={styles.page}>
      <div className={styles.titleRow}>
        <h1>{t('windows.title')}</h1>
        <Button data-declare-window onClick={() => update({ declare: 'window', edit: null })}>
          {t('windows.declare')}
        </Button>
      </div>
      <div className={styles.toolbar}>
        <ToggleGroup
          value={[view]}
          onValueChange={(values) => {
            if (values[0]) update({ view: String(values[0]), from })
          }}
          aria-label={t('windows.view')}
        >
          <ToggleGroupItem value="timeline">{t('windows.timeline')}</ToggleGroupItem>
          <ToggleGroupItem value="calendar">{t('windows.calendar')}</ToggleGroupItem>
        </ToggleGroup>
        <label className={styles.dateField}>
          {t('windows.from')}
          <Input
            type="date"
            name="from"
            value={from}
            onChange={(event) => {
              if (validDate(event.target.value)) update({ from: event.target.value })
            }}
          />
        </label>
        <Button variant="outline" onClick={() => update({ from: period(-1) })}>
          {t('windows.previous')}
        </Button>
        <Button variant="outline" onClick={() => update({ from: localDate() })}>
          {t('windows.today')}
        </Button>
        <Button variant="outline" onClick={() => update({ from: period(1) })}>
          {t('windows.next')}
        </Button>
      </div>
      <p className={styles.period}>
        <WindowDate value={dates[0]!} />
        <span aria-hidden="true">{t('windows.period', { from: '', to: '' })}</span>
        <WindowDate value={dates.at(-1)!} />
      </p>
      {loading && <p role="status">{t('windows.loading')}</p>}
      {errors.map((error) => (
        <Alert key={error} variant="destructive">
          <AlertDescription>
            {t(`windows.${error}`)}
            <Button variant="outline" onClick={reload}>
              {t('windows.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ))}
      {data && (
        <>
          {!windows.length && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('windows.empty')}</EmptyTitle>
              </EmptyHeader>
              <Button variant="outline" onClick={() => update({ declare: 'window', import: 'ics' })}>
                {t('windows.import')}
              </Button>
            </Empty>
          )}
          {!!windows.length && <p>{t('windows.count', { count: windows.length })}</p>}
          {view === 'timeline' ? (
            <Timeline
              windows={windows}
              dates={dates}
              root={root}
              feeds={data.feeds}
              bundles={data.bundles}
              nights={data.nights}
              days={data.days}
              onEdit={edit}
            />
          ) : (
            <MonthCalendar
              windows={windows}
              dates={dates}
              root={root}
              feeds={data.feeds}
              bundles={data.bundles}
              nights={data.nights}
              onEdit={edit}
              onMore={(date) => update({ view: 'timeline', from: date })}
            />
          )}
        </>
      )}
    </section>
  )
}
