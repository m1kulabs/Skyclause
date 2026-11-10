'use client'

import { useEffect, useState } from 'react'
import type { CallState, Mode } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { Alert, AlertDescription } from '#ui/alert'
import { CallRow } from '../data-components/call-row'
import { apiFetch, resolveProject, type CallRowView, type CallsProject } from './operations'
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

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: CallsProject; rows: CallRowView[]; next: string | null }

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
  const mode = validMode(filters.mode)
  const callState = validState(filters.state)
  const from = isDate(filters.from) ? filters.from : undefined
  const to = isDate(filters.to) ? filters.to : undefined

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void resolveProject(org, projectSlug, controller.signal)
      .then(async (project) => {
        const page = await apiFetch('listProjectCalls', {
          org,
          params: { id: project.id },
          query: { limit: 50, cursor: filters.cursor, pack, mode, state: callState, from, to },
          signal: controller.signal
        })
        return { project, page }
      })
      .then(({ project, page }) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', project, rows: page.data.slice(0, 50), next: page.next_cursor })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: String(error) })
      })
    return () => controller.abort()
  }, [org, projectSlug, filters.cursor, pack, mode, callState, from, to, attempt])

  return (
    <section
      className={styles.page}
      aria-label={t('calls.region_list', {}, locale)}
      aria-busy={state.status === 'loading'}
      data-calls-ready={state.status === 'loading' ? undefined : 'true'}
    >
      <header className={styles.titleRow}>
        <div>
          <h1>{t('calls.title', {}, locale)}</h1>
          {state.status === 'ready' && <p className={styles.projectName}>{state.project.name}</p>}
        </div>
      </header>

      <form className={styles.filters} action={base} method="get" aria-label={t('calls.filters', {}, locale)}>
        <label className={styles.field} htmlFor="calls-pack">
          <span>{t('calls.pack', {}, locale)}</span>
          <select id="calls-pack" name="pack" autoComplete="off" defaultValue={pack ?? ''}>
            <option value="">{t('calls.all_packs', {}, locale)}</option>
            <option value="sky">{t('calls.packs.sky', {}, locale)}</option>
            <option value="crowd">{t('calls.packs.crowd', {}, locale)}</option>
          </select>
        </label>
        <label className={styles.field} htmlFor="calls-mode">
          <span>{t('calls.mode', {}, locale)}</span>
          <select id="calls-mode" name="mode" autoComplete="off" defaultValue={mode ?? ''}>
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
          <select id="calls-state" name="state" autoComplete="off" defaultValue={callState ?? ''}>
            <option value="">{t('calls.all_states', {}, locale)}</option>
            {states.map((value) => (
              <option key={value} value={value}>
                {t(`calls.states.${value}`, {}, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field} htmlFor="calls-from">
          <span>{t('calls.from', {}, locale)}</span>
          <input
            id="calls-from"
            name="from"
            type="text"
            inputMode="text"
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
            inputMode="text"
            pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
            placeholder="YYYY-MM-DD"
            spellCheck={false}
            autoComplete="off"
            defaultValue={to ?? ''}
          />
        </label>
        <Button type="submit" variant="outline" className={styles.filterButton}>
          {t('calls.apply_filters', {}, locale)}
        </Button>
      </form>

      {state.status === 'loading' && <p role="status">{t('calls.loading', {}, locale)}</p>}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>
            <span>{t('calls.load_error', {}, locale)}</span>
            <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t('calls.retry', {}, locale)}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.status === 'ready' && (
        <>
          <p className={styles.count} aria-live="polite">
            {t('calls.count', { count: state.rows.length }, locale)}
          </p>
          {state.rows.length === 0 ? (
            <div className={styles.empty}>
              <p>{t('calls.empty', {}, locale)}</p>
              <a
                className={styles.actionLink}
                href={`/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/windows?declare=window`}
              >
                {t('calls.declare_window', {}, locale)}
              </a>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.callsTable}>
                <caption>{t('calls.table_caption', {}, locale)}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('calls.table_mode_window', {}, locale)}</th>
                    <th scope="col">{t('calls.table_reason', {}, locale)}</th>
                    <th scope="col">{t('calls.table_state', {}, locale)}</th>
                    <th scope="col">{t('calls.table_open', {}, locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((call) => (
                    <CallRow
                      key={call.id}
                      call={call}
                      locale={locale}
                      actions={
                        <a className={styles.actionLink} href={`${base}/${encodeURIComponent(call.id)}`} data-open-call>
                          {t('calls.open_call', {}, locale)}
                        </a>
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(state.next || filters.cursor) && (
            <nav className={styles.pagination} aria-label={t('calls.table_caption', {}, locale)}>
              {filters.cursor ? (
                <a className={styles.actionLink} href={pageHref(base, filters)}>
                  {t('calls.first_page', {}, locale)}
                </a>
              ) : null}
              {state.next ? (
                <a className={styles.actionLink} href={pageHref(base, filters, state.next)}>
                  {t('calls.next', {}, locale)}
                </a>
              ) : null}
            </nav>
          )}
        </>
      )}
    </section>
  )
}
