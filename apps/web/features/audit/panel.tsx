'use client'

import { useEffect, useMemo, useState } from 'react'
import { AUDIT_ACTIONS } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { Button } from '../../components/ui/button'
import {
  EMPTY_AUDIT_FILTERS,
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

export function AuditPanel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS)
  const [hydrated, setHydrated] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    setFilters(readAuditFilters(new URLSearchParams(window.location.search)))
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const controller = new AbortController()
    setLoading(true)
    setEntries([])
    setNextCursor(null)
    setScrollTop(0)
    setError(false)
    apiFetch('listAuditEntries', {
      params: { org },
      query: { limit: 50, ...toApiAuditFilters(filters) },
      signal: controller.signal
    })
      .then((page) => {
        const result = page as Page
        setEntries(result.data)
        setNextCursor(result.next_cursor)
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(true)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [filters, hydrated, org])

  const tSettings = (key: string, vars: Record<string, string | number> = {}) =>
    t(`settings.audit.${key}`, vars, locale)
  const update = (key: keyof AuditFilterState, value: string) => {
    const next = { ...filters, [key]: value }
    const params = writeAuditFilters(new URLSearchParams(window.location.search), next)
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    setFilters(next)
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError(false)
    try {
      const page = (await apiFetch('listAuditEntries', {
        params: { org },
        query: { limit: 50, cursor: nextCursor, ...toApiAuditFilters(filters) }
      })) as Page
      setEntries((current) => [...current, ...page.data])
      setNextCursor(page.next_cursor)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
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

  const virtual = entries.length > 50
  const rowHeight = typeof window !== 'undefined' && window.matchMedia('(width < 640px)').matches ? 104 : 76
  const visible = useMemo(() => {
    if (!virtual) return { start: 0, rows: entries, before: 0, after: 0 }
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3)
    const count = 15
    const rows = entries.slice(start, start + count)
    return {
      start,
      rows,
      before: start * rowHeight,
      after: Math.max(0, (entries.length - start - rows.length) * rowHeight)
    }
  }, [entries, rowHeight, scrollTop, virtual])

  const fieldClass = 'grid min-w-0 gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm'
  const inputClass =
    'h-8 min-w-0 border-0 bg-transparent p-0 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="grid gap-5">
      <h2 className="text-base font-semibold">{tSettings('title')}</h2>
      <div
        role="group"
        aria-label={tSettings('filters')}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <label className={fieldClass}>
          {tSettings('actor')}
          <input
            className={inputClass}
            name="actor_id"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={filters.actor_id}
            disabled={!hydrated}
            onChange={(event) => update('actor_id', event.target.value)}
          />
        </label>
        <label className={fieldClass}>
          {tSettings('action')}
          <select
            className={inputClass}
            aria-label={tSettings('action')}
            name="action"
            autoComplete="off"
            value={filters.action}
            disabled={!hydrated}
            onChange={(event) => update('action', event.target.value)}
          >
            <option value="">{tSettings('allActions')}</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass}>
          {tSettings('targetType')}
          <input
            className={inputClass}
            name="target_type"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={filters.target_type}
            disabled={!hydrated}
            onChange={(event) => update('target_type', event.target.value)}
          />
        </label>
        <label className={fieldClass}>
          {tSettings('targetId')}
          <input
            className={inputClass}
            name="target_id"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={filters.target_id}
            disabled={!hydrated}
            onChange={(event) => update('target_id', event.target.value)}
          />
        </label>
        <label className={fieldClass}>
          {tSettings('projectId')}
          <input
            className={inputClass}
            name="project_id"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={filters.project_id}
            disabled={!hydrated}
            onChange={(event) => update('project_id', event.target.value)}
          />
        </label>
        <label className={fieldClass}>
          {tSettings('from')}
          <input
            className={inputClass}
            name="from"
            autoComplete="off"
            type="date"
            value={filters.from}
            disabled={!hydrated}
            onChange={(event) => update('from', event.target.value)}
          />
        </label>
        <label className={fieldClass}>
          {tSettings('to')}
          <input
            className={inputClass}
            name="to"
            autoComplete="off"
            type="date"
            value={filters.to}
            disabled={!hydrated}
            onChange={(event) => update('to', event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 disabled:opacity-100"
          onClick={exportCsv}
          disabled={!hydrated || exporting}
        >
          {exporting ? tSettings('exporting') : tSettings('export')}
        </Button>
        {exportError && (
          <p role="alert" className="text-sm text-destructive">
            {tSettings('exportError')}
          </p>
        )}
      </div>

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {tSettings('loading')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {tSettings('error')}
        </p>
      )}
      {!loading && !error && entries.length === 0 && <p>{tSettings('empty')}</p>}

      {entries.length > 0 && (
        <div>
          <div
            className={styles.scrollRegion}
            role="region"
            aria-label={tSettings('entriesRegion')}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div role="list">
              {virtual && <div aria-hidden="true" className={styles.spacer} style={{ height: visible.before }} />}
              {visible.rows.map((entry) => (
                <div role="listitem" className={styles.row} data-audit-row key={entry.id}>
                  <div className={styles.cell}>
                    <span className={styles.label}>{tSettings('time')}</span>
                    <time dateTime={entry.created_at}>{formatAuditTime(entry.created_at, locale)}</time>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.label}>{tSettings('actor')}</span>
                    {tSettings('actorRole', {
                      actor: entry.actor_name ?? entry.actor_id ?? tSettings('actorUnknown'),
                      role: entry.actor_role ?? entry.actor_type
                    })}
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.label}>{tSettings('action')}</span>
                    {entry.action}
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.label}>{tSettings('object')}</span>
                    {entry.target_type && entry.target_id
                      ? `${entry.target_type} · ${entry.target_id}`
                      : (entry.target_id ?? entry.target_type ?? tSettings('objectUnknown'))}
                  </div>
                </div>
              ))}
              {virtual && <div aria-hidden="true" className={styles.spacer} style={{ height: visible.after }} />}
            </div>
          </div>
          {nextCursor && (
            <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? tSettings('loading') : tSettings('loadMore')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default AuditPanel
