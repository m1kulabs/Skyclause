'use client'

import { useEffect, useState } from 'react'
import type { CallState, Mode } from '@skyclause/contracts'
import { formatDateCompact, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableMeasure, TableRow } from '#ui/table'
import { ModeBadge } from '../brand/mode-badge'
import { StatusMark } from '../brand/status-mark'
import { SourceError } from '../data-components/states'
import { ApiProblem } from '../../lib/api-fetch'
import { apiFetch, resolveProject, type CallRowView, type CallsProject, type GradeView } from './operations'
import { t } from './i18n'
import styles from './calls.module.css'

export interface CallsFilters {
  pack?: string
  mode?: string
  state?: string
  from?: string
  to?: string
  cursor?: string
}

type Failure = { code: number | null; at: string }
type ListState =
  | { status: 'loading' }
  | { status: 'error'; failure: Failure }
  | {
      status: 'ready'
      project: CallsProject
      rows: CallRowView[]
      next: string | null
      grades: GradeView[] | Failure
    }

const modes: Mode[] = ['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'surge_night']
const states: CallState[] = [
  'drafted',
  'approved',
  'edited',
  'rejected',
  'expired',
  'superseded',
  'sending',
  'sent',
  'failed'
]
const isDate = (value?: string): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}
const validMode = (value?: string): Mode | undefined =>
  (modes as string[]).includes(value ?? '') ? (value as Mode) : undefined
const validState = (value?: string): CallState | undefined =>
  (states as string[]).includes(value ?? '') ? (value as CallState) : undefined
const failure = (error: unknown): Failure => ({
  code: error instanceof ApiProblem ? error.status : null,
  at: new Date().toISOString()
})
const minutes = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000))
const validPack = (value?: string): 'sky' | 'crowd' | undefined =>
  value === 'sky' || value === 'crowd' ? value : undefined

function pageHref(base: string, filters: CallsFilters, cursor?: string | null): string {
  const query = new URLSearchParams()
  for (const key of ['pack', 'mode', 'state', 'from', 'to'] as const) {
    const value = filters[key]
    if (value) query.set(key, value)
  }
  if (cursor) query.set('cursor', cursor)
  const search = query.toString()
  return search ? `${base}?${search}` : base
}

/**
 * The project's calls as rows that measure: when each crossed, its mode, its state, its grade and how long it took to
 * send, the delay drawn as the row's bar. Every filter applies as it changes and lives in the URL: pack and dates scope
 * the read; mode and state dim the rows that do not match instead of removing them, so nothing jumps.
 */
export function CallsPage({
  org,
  projectSlug,
  filters,
  locale = 'en'
}: {
  org: string
  projectSlug: string
  filters: CallsFilters
  locale?: 'en' | 'ms'
}) {
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const base = `/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/calls`
  const [pack, setPack] = useState(validPack(filters.pack))
  const [from, setFrom] = useState(isDate(filters.from) ? filters.from : undefined)
  const [to, setTo] = useState(isDate(filters.to) ? filters.to : undefined)
  const [cursor, setCursor] = useState(filters.cursor)
  const [rangeInvalid, setRangeInvalid] = useState(false)
  const [mode, setMode] = useState(validMode(filters.mode))
  const [callState, setCallState] = useState(validState(filters.state))
  useEffect(() => {
    setPack(validPack(filters.pack))
    setFrom(isDate(filters.from) ? filters.from : undefined)
    setTo(isDate(filters.to) ? filters.to : undefined)
    setCursor(filters.cursor)
    setMode(validMode(filters.mode))
    setCallState(validState(filters.state))
  }, [filters.pack, filters.from, filters.to, filters.cursor, filters.mode, filters.state])

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void resolveProject(org, projectSlug, controller.signal)
      .then(async (project) => {
        const [page, grades] = await Promise.all([
          apiFetch('listProjectCalls', {
            org,
            params: { id: project.id },
            query: { limit: 50, cursor, pack, from, to },
            signal: controller.signal
          }),
          apiFetch('listGrades', {
            org,
            params: { id: project.id },
            query: { limit: 200, pack, from, to },
            signal: controller.signal
          }).then(
            (result) => result.data,
            (error: unknown) => failure(error)
          )
        ])
        return { project, page, grades }
      })
      .then(({ project, page, grades }) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', project, rows: page.data.slice(0, 50), next: page.next_cursor, grades })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', failure: failure(error) })
      })
    return () => controller.abort()
  }, [org, projectSlug, cursor, pack, from, to, attempt])

  // The URL keeps every filter, so a reload or a shared link shows the same rows. Editing a field replaces the entry.
  function remember(changes: Record<string, string | undefined>) {
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(changes)) {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }
    window.history.replaceState(window.history.state, '', url)
  }
  // Mode and state only dim rows.
  function highlight(key: 'mode' | 'state', value: string) {
    if (key === 'mode') setMode(validMode(value))
    else setCallState(validState(value))
    remember({ [key]: value })
  }
  // Pack and dates scope the read: a change reads the first page again. A half-typed date waits; a reversed range says so.
  function scope(key: 'pack' | 'from' | 'to', value: string) {
    if (key === 'pack') setPack(validPack(value))
    else if (value && !isDate(value)) return
    const next = { from, to, [key]: value || undefined }
    if (key !== 'pack') {
      const reversed = !!next.from && !!next.to && next.from > next.to
      setRangeInvalid(reversed)
      if (reversed) return
      setFrom(next.from)
      setTo(next.to)
    }
    setCursor(undefined)
    remember({ [key]: value, cursor: undefined })
  }

  const matches = (call: CallRowView) => (!mode || call.mode === mode) && (!callState || call.state === callState)
  const ready = state.status === 'ready' ? state : null
  const matching = ready ? ready.rows.filter(matches).length : 0
  const delays = ready ? ready.rows.map((call) => (call.sent_at ? minutes(call.triggered_at, call.sent_at) : null)) : []
  const longest = Math.max(1, ...delays.map((value) => value ?? 0))
  const scoped = { ...filters, pack, from, to, mode, state: callState }
  const counted = (key: string, count: number) => (count === 1 ? `${key}_one` : key)

  return (
    <section
      className={styles.page}
      aria-label={t('calls.region_list', {}, locale)}
      aria-busy={state.status === 'loading'}
      data-calls-ready={state.status === 'loading' ? undefined : 'true'}
    >
      <header className={styles.titleRow}>
        <h1>{t('calls.title', {}, locale)}</h1>
        {ready ? (
          <p className={styles.projectName}>
            <span>{ready.project.name}</span>
            <span className={styles.count} aria-live="polite" data-numeric>
              {mode || callState
                ? t(
                    counted('calls.count_match', ready.rows.length),
                    { matching: formatNumber(matching, locale), count: formatNumber(ready.rows.length, locale) },
                    locale
                  )
                : t(
                    counted('calls.count', ready.rows.length),
                    { count: formatNumber(ready.rows.length, locale) },
                    locale
                  )}
            </span>
          </p>
        ) : null}
      </header>

      <form
        className={styles.filters}
        action={base}
        method="get"
        aria-label={t('calls.filters', {}, locale)}
        onSubmit={(event) => event.preventDefault()}
      >
        <label className={styles.field} htmlFor="calls-pack">
          <span>{t('calls.pack', {}, locale)}</span>
          <select
            id="calls-pack"
            name="pack"
            className="native-select"
            autoComplete="off"
            value={pack ?? ''}
            onChange={(event) => scope('pack', event.target.value)}
          >
            <option value="">{t('calls.all_packs', {}, locale)}</option>
            <option value="sky">{t('calls.packs.sky', {}, locale)}</option>
            <option value="crowd">{t('calls.packs.crowd', {}, locale)}</option>
          </select>
        </label>
        {(['from', 'to'] as const).map((key) => (
          <label className={styles.field} htmlFor={`calls-${key}`} key={key}>
            <span>{t(`calls.${key}`, {}, locale)}</span>
            {/* The wrapper draws the ring: Chromium drops :focus-visible on a date field's last segment. */}
            <span className={styles.fieldRing} data-focus-ring>
              <Input
                id={`calls-${key}`}
                name={key}
                type="date"
                autoComplete="off"
                defaultValue={(key === 'from' ? from : to) ?? ''}
                aria-invalid={rangeInvalid || undefined}
                aria-describedby={rangeInvalid ? 'calls-range-error' : undefined}
                onChange={(event) => scope(key, event.target.value)}
              />
            </span>
          </label>
        ))}
        <label className={styles.field} htmlFor="calls-mode">
          <span>{t('calls.mode', {}, locale)}</span>
          <select
            id="calls-mode"
            name="mode"
            className="native-select"
            autoComplete="off"
            value={mode ?? ''}
            onChange={(event) => highlight('mode', event.target.value)}
          >
            <option value="">{t('calls.all_modes', {}, locale)}</option>
            {modes.map((value) => (
              <option key={value} value={value}>
                {t(`calls.modes.${value}`, {}, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field} htmlFor="calls-state">
          <span>{t('calls.state', {}, locale)}</span>
          <select
            id="calls-state"
            name="state"
            className="native-select"
            autoComplete="off"
            value={callState ?? ''}
            onChange={(event) => highlight('state', event.target.value)}
          >
            <option value="">{t('calls.all_states', {}, locale)}</option>
            {states.map((value) => (
              <option key={value} value={value}>
                {t(`calls.states.${value}`, {}, locale)}
              </option>
            ))}
          </select>
        </label>
      </form>
      {rangeInvalid && (
        <p id="calls-range-error" role="alert" className={styles.reason}>
          {t('calls.range_invalid', {}, locale)}
        </p>
      )}

      {state.status === 'loading' && (
        <div className={styles.loading} role="status">
          <span className="sr-only">{t('calls.loading', {}, locale)}</span>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={styles.skeletonRow}>
              <Skeleton className="h-5 w-32 rounded-full" />
              <Skeleton className="h-6 w-40 rounded-full" />
              <Skeleton className="ml-auto h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      )}
      {state.status === 'error' && (
        <SourceError
          source={t('calls.calls_source', {}, locale)}
          status={state.failure.code}
          at={state.failure.at}
          locale={locale}
          retry={
            <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t('calls.retry', {}, locale)}
            </Button>
          }
        />
      )}
      {ready && !Array.isArray(ready.grades) && ready.rows.length > 0 && (
        <SourceError
          source={t('calls.grades_source', {}, locale)}
          status={ready.grades.code}
          at={ready.grades.at}
          locale={locale}
        />
      )}
      {ready && ready.rows.length === 0 && (
        <div className={styles.empty}>
          <p>{t(pack || from || to ? 'calls.empty' : 'calls.empty_all', {}, locale)}</p>
          <a
            className={styles.actionLink}
            href={`/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/windows?declare=window`}
          >
            {t('calls.declare_window', {}, locale)}
          </a>
        </div>
      )}
      {ready && ready.rows.length > 0 && (
        <Table>
          <TableCaption className="sr-only">{t('calls.table_caption', {}, locale)}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('calls.col_crossing', {}, locale)}</TableHead>
              <TableHead scope="col">{t('calls.mode', {}, locale)}</TableHead>
              <TableHead scope="col">{t('calls.state', {}, locale)}</TableHead>
              <TableHead scope="col">{t('calls.grade', {}, locale)}</TableHead>
              <TableHead scope="col" numeric className="w-48">
                {t('calls.col_delay', {}, locale)}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ready.rows.map((call, index) => {
              const grade = Array.isArray(ready.grades)
                ? ready.grades.find((item) => item.call_id === call.id)
                : undefined
              const delay = delays[index]
              const dimmed = !matches(call)
              const mark = call.no_call?.length ? 'no_call' : (call.mode ?? (call.watch ? 'storm_watch' : 'no_call'))
              const stateWord = t(`calls.states.${call.state}`, {}, locale)
              return (
                <TableRow key={call.id} data-call={call.id} data-dimmed={dimmed || undefined} dimmed={dimmed}>
                  <TableCell phone="primary">
                    <a href={`${base}/${encodeURIComponent(call.id)}`} data-open-call className={styles.rowLink}>
                      <time dateTime={call.triggered_at}>
                        {t(
                          'calls.crossing_at',
                          {
                            date: formatDateCompact(call.triggered_at, locale),
                            time: formatTime(call.triggered_at, locale)
                          },
                          locale
                        )}
                      </time>
                    </a>
                    {dimmed ? <span className="sr-only">{t('calls.dimmed', {}, locale)}</span> : null}
                  </TableCell>
                  <TableCell phone="end">
                    {dimmed ? (
                      <StatusMark state={mark} variant="plain" locale={locale} />
                    ) : (
                      <ModeBadge mode={mark} locale={locale} />
                    )}
                  </TableCell>
                  <TableCell label={t('calls.state', {}, locale)}>
                    {['drafted', 'edited'].includes(call.state) ? (
                      <time dateTime={call.expires_at}>
                        {t(
                          'calls.state_expires',
                          { state: stateWord, time: formatTime(call.expires_at, locale) },
                          locale
                        )}
                      </time>
                    ) : (
                      stateWord
                    )}
                  </TableCell>
                  <TableCell label={t('calls.grade', {}, locale)}>
                    {grade ? (
                      t(`calls.grades.${grade.outcome}`, {}, locale)
                    ) : (
                      <>
                        <span className={styles.dash} aria-hidden="true">
                          {t('calls.dash', {}, locale)}
                        </span>
                        <span className="sr-only">{t('calls.ungraded', {}, locale)}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell numeric label={t('calls.col_delay', {}, locale)}>
                    {delay === null || delay === undefined ? (
                      <>
                        <span className={styles.dash} aria-hidden="true">
                          {t('calls.dash', {}, locale)}
                        </span>
                        <span className="sr-only">{t('calls.not_sent', {}, locale)}</span>
                      </>
                    ) : (
                      <TableMeasure value={delay} max={longest}>
                        <span data-numeric>{t('calls.minutes', { count: formatNumber(delay, locale) }, locale)}</span>
                      </TableMeasure>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {ready && (ready.next || cursor) && (
        <nav className={styles.pagination} aria-label={t('calls.pages', {}, locale)}>
          {cursor ? (
            <a className={styles.actionLink} href={pageHref(base, scoped)}>
              {t('calls.first_page', {}, locale)}
            </a>
          ) : null}
          {ready.next ? (
            <a className={styles.actionLink} href={pageHref(base, scoped, ready.next)}>
              {t('calls.next', {}, locale)}
            </a>
          ) : null}
        </nav>
      )}
    </section>
  )
}
