'use client'

import { Fragment, useEffect, useState } from 'react'
import { AUDIT_ACTIONS } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import {
  NativeSelect,
  SettingsAside,
  SettingsError,
  SettingsField,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsSummaryLine
} from '../settings/parts'
import {
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTERS,
  entryMatchesFilters,
  formatAuditTime,
  readAuditFilters,
  toApiAuditFilters,
  writeAuditFilters,
  type AuditFilterState
} from './model'
import { apiFetch, type AuditEntry } from './operations'
import styles from './panel.module.css'
import '../settings/catalogue'

type Page = { data: AuditEntry[]; next_cursor: string | null }

/** A slug with a break opportunity after each dot and underscore, so a long action wraps at its own joints. */
function breakable(slug: string) {
  const parts = slug.split(/(?<=[._])/)
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ))
}

/**
 * The audit log: filters, then the records as a ledger, never more than one page (50) on screen. Older and newer move
 * by cursor and replace the page; while an answer is on its way the rows already shown stay, dimmed where they no
 * longer match.
 */
export function AuditPanel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS)
  const [hydrated, setHydrated] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [exportError, setExportError] = useState(false)
  const [exporting, setExporting] = useState(false)

  const cursor = cursors[cursors.length - 1] ?? null
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(`settings.audit.${key}`, vars, locale)

  useEffect(() => {
    setFilters(readAuditFilters(new URLSearchParams(window.location.search)))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const controller = new AbortController()
    setLoading(true)
    setFailure(null)
    apiFetch('listAuditEntries', {
      params: { org },
      query: { limit: AUDIT_PAGE_SIZE, ...(cursor ? { cursor } : {}), ...toApiAuditFilters(filters) },
      signal: controller.signal
    })
      .then((page) => {
        const result = page as Page
        setEntries(result.data.slice(0, AUDIT_PAGE_SIZE))
        setNextCursor(result.next_cursor)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setFailure({ error: cause, at: new Date().toISOString() })
        setLoading(false)
      })
    return () => controller.abort()
  }, [filters, cursor, hydrated, org, attempt])

  const update = (key: keyof AuditFilterState, value: string) => {
    const next = { ...filters, [key]: value }
    const params = writeAuditFilters(new URLSearchParams(window.location.search), next)
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    setCursors([null])
    setFilters(next)
  }

  const exportCsv = async () => {
    setExporting(true)
    setExportError(false)
    try {
      const csv = await apiFetch('exportAuditLog', {
        params: { org },
        query: { ...toApiAuditFilters(filters), format: 'csv' },
        headers: { Accept: 'text/csv' }
      })
      const url = URL.createObjectURL(new Blob([String(csv)], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-${org}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  const first = (cursors.length - 1) * AUDIT_PAGE_SIZE + 1
  const range = entries?.length ? copy('range', { from: first, to: first + entries.length - 1 }) : null
  const active = Object.values(filters).filter(Boolean).length

  return (
    <div aria-busy={loading}>
      <SettingsAside>
        <SettingsSummaryLine label={copy('summaryShowing')}>{range ?? copy('summaryNone')}</SettingsSummaryLine>
        <SettingsSummaryLine label={copy('filters')}>
          {active ? copy('summaryFilters', { count: active }) : copy('summaryNoFilters')}
        </SettingsSummaryLine>
      </SettingsAside>
      <SettingsParts>
        <SettingsPart title={copy('filters')} description={copy('dateHint')} id="audit-filters-title">
          <div role="group" aria-labelledby="audit-filters-title" className={styles.filters}>
            <SettingsField label={copy('actor')}>
              {(aria) => (
                <Input
                  {...aria}
                  name="actor_id"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={filters.actor_id}
                  disabled={!hydrated}
                  onChange={(event) => update('actor_id', event.target.value)}
                />
              )}
            </SettingsField>
            <SettingsField label={copy('action')}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="action"
                  autoComplete="off"
                  value={filters.action}
                  disabled={!hydrated}
                  onChange={(event) => update('action', event.target.value)}
                >
                  <option value="">{copy('allActions')}</option>
                  {AUDIT_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </SettingsField>
            <SettingsField label={copy('targetType')}>
              {(aria) => (
                <Input
                  {...aria}
                  name="target_type"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={filters.target_type}
                  disabled={!hydrated}
                  onChange={(event) => update('target_type', event.target.value)}
                />
              )}
            </SettingsField>
            <SettingsField label={copy('targetId')}>
              {(aria) => (
                <Input
                  {...aria}
                  name="target_id"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={filters.target_id}
                  disabled={!hydrated}
                  onChange={(event) => update('target_id', event.target.value)}
                />
              )}
            </SettingsField>
            <SettingsField label={copy('projectId')}>
              {(aria) => (
                <Input
                  {...aria}
                  name="project_id"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={filters.project_id}
                  disabled={!hydrated}
                  onChange={(event) => update('project_id', event.target.value)}
                />
              )}
            </SettingsField>
            <SettingsField label={copy('from')}>
              {(aria) => (
                <Input
                  {...aria}
                  name="from"
                  type="date"
                  autoComplete="off"
                  value={filters.from}
                  disabled={!hydrated}
                  onChange={(event) => update('from', event.target.value)}
                />
              )}
            </SettingsField>
            <SettingsField label={copy('to')}>
              {(aria) => (
                <Input
                  {...aria}
                  name="to"
                  type="date"
                  autoComplete="off"
                  value={filters.to}
                  disabled={!hydrated}
                  onChange={(event) => update('to', event.target.value)}
                />
              )}
            </SettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="disabled:opacity-100"
              onClick={exportCsv}
              disabled={!hydrated || exporting}
            >
              {exporting ? copy('exporting') : copy('export')}
            </Button>
            {exportError ? <SettingsError>{copy('exportError')}</SettingsError> : null}
          </div>
        </SettingsPart>

        <SettingsPart title={copy('records')} id="audit-records-title">
          {failure ? (
            <SettingsReadError
              source={copy('source')}
              error={failure.error}
              at={failure.at}
              locale={locale}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          ) : entries === null ? (
            <div className="grid gap-0.5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="type-body">{loading ? copy('loading') : active ? copy('emptyFiltered') : copy('empty')}</p>
          ) : (
            <div role="region" aria-label={copy('entriesRegion')}>
              <div className={styles.head} aria-hidden="true">
                <span>{copy('time')}</span>
                <span>{copy('actorColumn')}</span>
                <span>{copy('action')}</span>
                <span>{copy('object')}</span>
              </div>
              <ol className={styles.ledger}>
                {entries.map((entry) => (
                  <li
                    className={styles.row}
                    data-audit-row
                    data-dim={loading && !entryMatchesFilters(entry, filters) ? '' : undefined}
                    key={entry.id}
                  >
                    <div className={styles.cell}>
                      <span className={styles.label}>{copy('time')}</span>
                      <time dateTime={entry.created_at}>{formatAuditTime(entry.created_at, locale)}</time>
                    </div>
                    <div className={styles.cell}>
                      <span className={styles.label}>{copy('actorColumn')}</span>
                      {entry.actor_name ?? entry.actor_id ?? copy('actorUnknown')}
                      <span className={styles.sub}>{entry.actor_role ?? entry.actor_type}</span>
                    </div>
                    <div className={styles.cell}>
                      <span className={styles.label}>{copy('action')}</span>
                      {breakable(entry.action)}
                    </div>
                    <div className={styles.cell}>
                      <span className={styles.label}>{copy('object')}</span>
                      {entry.target_type && entry.target_id
                        ? `${entry.target_type} · ${entry.target_id}`
                        : (entry.target_id ?? entry.target_type ?? copy('objectUnknown'))}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {entries !== null && !failure && (cursors.length > 1 || nextCursor) ? (
            <div className={styles.pager}>
              {range ? <span className={styles.range}>{range}</span> : null}
              <Button
                type="button"
                variant="outline"
                className="disabled:text-muted-foreground disabled:opacity-100"
                disabled={loading || cursors.length < 2}
                onClick={() => setCursors((current) => current.slice(0, -1))}
              >
                {copy('newer')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="disabled:text-muted-foreground disabled:opacity-100"
                disabled={loading || !nextCursor}
                onClick={() => nextCursor && setCursors((current) => [...current, nextCursor])}
              >
                {copy('older')}
              </Button>
            </div>
          ) : null}
        </SettingsPart>
      </SettingsParts>
    </div>
  )
}

export default AuditPanel
