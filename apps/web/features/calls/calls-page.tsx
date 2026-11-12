'use client'

import { useEffect, useState } from 'react'
import type { CallState, Mode } from '@skyclause/contracts'
import { formatDateCompact, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
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
 * send, the delay drawn as the row's bar. Pack and dates scope the read; mode and state dim the rows that do not match
 * instead of removing them, so nothing jumps.
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
  const pack = filters.pack === 'sky' || filters.pack === 'crowd' ? filters.pack : undefined
  const from = isDate(filters.from) ? filters.from : undefined
  const to = isDate(filters.to) ? filters.to : undefined
  const [mode, setMode] = useState(validMode(filters.mode))
  const [callState, setCallState] = useState(validState(filters.state))
  useEffect(() => {
    setMode(validMode(filters.mode))
    setCallState(validState(filters.state))
  }, [filters.mode, filters.state])

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void resolveProject(org, projectSlug, controller.signal)
      .then(async (project) => {
        const [page, grades] = await Promise.all([
          apiFetch('listProjectCalls', {
            org,
            params: { id: project.id },
            query: { limit: 50, cursor: filters.cursor, pack, from, to },
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
  }, [org, projectSlug, filters.cursor, pack, from, to, attempt])

  // Mode and state only dim rows; the URL keeps them so a reload or a shared link shows the same highlight.
  function highlight(key: 'mode' | 'state', value: string) {
    if (key === 'mode') setMode(validMode(value))
    else setCallState(validState(value))
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
    window.history.replaceState(window.history.state, '', url)
  }

  const matches = (call: CallRowView) => (!mode || call.mode === mode) && (!callState || call.state === callState)
  const ready = state.status === 'ready' ? state : null
  const matching = ready ? ready.rows.filter(matches).length : 0
  const delays = ready ? ready.rows.map((call) => (call.sent_at ? minutes(call.triggered_at, call.sent_at) : null)) : []
  const longest = Math.max(1, ...delays.map((value) => value ?? 0))

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
                ? t('calls.count_match', { matching, count: ready.rows.length }, locale)
                : t('calls.count', { count: ready.rows.length }, locale)}
            </span>
          </p>
        ) : null}
      </header>

      <form className={styles.filters} action={base} method="get" aria-label={t('calls.filters', {}, locale)}>
        <label className={styles.field} htmlFor="calls-pack">
          <span>{t('calls.pack', {}, locale)}</span>
          <select id="calls-pack" name="pack" className="native-select" autoComplete="off" defaultValue={pack ?? ''}>
            <option value="">{t('calls.all_packs', {}, locale)}</option>
            <option value="sky">{t('calls.packs.sky', {}, locale)}</option>
            <option value="crowd">{t('calls.packs.crowd', {}, locale)}</option>
          </select>
        </label>
        <label className={styles.field} htmlFor="calls-from">
          <span>{t('calls.from', {}, locale)}</span>
          <input
            id="calls-from"
            name="from"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
            placeholder="YYYY-MM-DD"
            spellCheck={false}
            autoComplete="off"
            defaultValue={from ?? ''}
          />
        </label>
        <label className={styles.field} htmlFor="calls-to">
          <span>{t('calls.to', {}, locale)}</span>
          <input
            id="calls-to"
            name="to"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
            placeholder="YYYY-MM-DD"
            spellCheck={false}
            autoComplete="off"
            defaultValue={to ?? ''}
          />
        </label>
        <Button type="submit" variant="outline" className={`h-10 ${styles.filterButton}`}>
          {t('calls.apply_filters', {}, locale)}
        </Button>
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

      {state.status === 'loading' && (
        <div className={styles.tableWrap} role="status">
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
          <p>{t('calls.empty', {}, locale)}</p>
          <a
            className={styles.actionLink}
            href={`/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/windows?declare=window`}
          >
            {t('calls.declare_window', {}, locale)}
          </a>
        </div>
      )}
      {ready && ready.rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.callsTable}>
            <caption className="sr-only">{t('calls.table_caption', {}, locale)}</caption>
            <thead>
              <tr>
                <th scope="col">{t('calls.col_crossing', {}, locale)}</th>
                <th scope="col">{t('calls.mode', {}, locale)}</th>
                <th scope="col">{t('calls.state', {}, locale)}</th>
                <th scope="col">{t('calls.grade', {}, locale)}</th>
                <th scope="col" className={styles.numeric}>
                  {t('calls.col_delay', {}, locale)}
                </th>
              </tr>
            </thead>
            <tbody>
              {ready.rows.map((call, index) => {
                const grade = Array.isArray(ready.grades)
                  ? ready.grades.find((item) => item.call_id === call.id)
                  : undefined
                const delay = delays[index]
                const dimmed = !matches(call)
                const mark = call.no_call?.length ? 'no_call' : (call.mode ?? (call.watch ? 'storm_watch' : 'no_call'))
                return (
                  <tr key={call.id} data-call={call.id} data-dimmed={dimmed || undefined}>
                    <th scope="row">
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
                      <span className={styles.rowSub}>
                        {call.night_id
                          ? t('calls.night', {}, locale)
                          : t('calls.expires_short', { time: formatTime(call.expires_at, locale) }, locale)}
                        {dimmed ? <span className="sr-only">{t('calls.dimmed', {}, locale)}</span> : null}
                      </span>
                    </th>
                    <td>
                      {dimmed ? (
                        <StatusMark state={mark} variant="plain" locale={locale} />
                      ) : (
                        <ModeBadge mode={mark} locale={locale} />
                      )}
                    </td>
                    <td>{t(`calls.states.${call.state}`, {}, locale)}</td>
                    <td>
                      {grade ? (
                        t(`calls.grades.${grade.outcome}`, {}, locale)
                      ) : (
                        <span className={styles.dash} aria-label={t('calls.ungraded', {}, locale)}>
                          {t('calls.dash', {}, locale)}
                        </span>
                      )}
                    </td>
                    <td className={styles.numeric}>
                      {delay === null || delay === undefined ? (
                        <span className={styles.dash} aria-label={t('calls.not_sent', {}, locale)}>
                          {t('calls.dash', {}, locale)}
                        </span>
                      ) : (
                        <span className={styles.delay} data-numeric>
                          <span
                            className={styles.delayBar}
                            aria-hidden="true"
                            style={{ width: `${Math.max(8, (delay / longest) * 100).toFixed(1)}%` }}
                          />
                          <span className={styles.delayFigure}>{t('calls.minutes', { count: delay }, locale)}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {ready && (ready.next || filters.cursor) && (
        <nav className={styles.pagination} aria-label={t('calls.pages', {}, locale)}>
          {filters.cursor ? (
            <a className={styles.actionLink} href={pageHref(base, { ...filters, mode, state: callState })}>
              {t('calls.first_page', {}, locale)}
            </a>
          ) : null}
          {ready.next ? (
            <a className={styles.actionLink} href={pageHref(base, { ...filters, mode, state: callState }, ready.next)}>
              {t('calls.next', {}, locale)}
            </a>
          ) : null}
        </nav>
      )}
    </section>
  )
}
