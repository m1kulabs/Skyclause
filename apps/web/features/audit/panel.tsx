'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatNumber } from '@skyclause/i18n/format'
import { t } from '@skyclause/i18n'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import '../members/i18n'
import {
  NativeSelect,
  SettingsAside,
  SettingsError,
  SettingsField,
  SettingsLoading,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsRowMenu,
  SettingsRowMenuItem,
  SettingsSummaryLine
} from '../settings/parts'
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_FILTER_DELAY_MS,
  AUDIT_PAGE_SIZE,
  AUDIT_TARGET_TYPES,
  EMPTY_AUDIT_FILTERS,
  auditActionKey,
  describeActor,
  entryMatchesFilters,
  formatAuditTime,
  readAuditFilters,
  targetName,
  targetTypeKey,
  toApiAuditFilters,
  truncatedId,
  writeAuditFilters,
  type AuditFilterState
} from './model'
import { apiFetch, type AuditEntry } from './operations'
import styles from './panel.module.css'
import '../settings/catalogue'

type Page<T> = { data: T[]; next_cursor: string | null }
type Query = { filters: AuditFilterState; cursor: string | null }
type Person = { account_id: string; id: string; name: string }
type Directory = { people: Person[]; projects: Array<{ id: string; name: string }> }

/** The most pages of people or projects a filter list reads: far beyond any organisation's size. */
const DIRECTORY_PAGES = 5

async function readAll<T>(read: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  for (let pages = 0; pages < DIRECTORY_PAGES; pages++) {
    const page = await read(cursor)
    rows.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (!cursor) break
  }
  return rows
}

/**
 * The audit log: filters, then the records as one table, never more than one page (50) on screen. Older and newer move
 * by cursor and replace the page; while an answer is on its way the rows already shown stay, dimmed where they no
 * longer match. People, actions and projects are chosen from lists and every record reads in words: the actor and the
 * object by name, the action as a sentence. An identifier is only ever behind a copy control.
 */
export function AuditPanel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS)
  const [query, setQuery] = useState<Query | null>(null)
  const [trail, setTrail] = useState<Array<string | null>>([])
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [directoryFailure, setDirectoryFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [directoryAttempt, setDirectoryAttempt] = useState(0)
  const [exportError, setExportError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)

  const hydrated = query !== null
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(`settings.audit.${key}`, vars, locale)
  const number = (value: number) => formatNumber(value, locale)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initial = readAuditFilters(params)
    setFilters(initial)
    setQuery({ filters: initial, cursor: params.get('cursor') })
  }, [])

  // The fields answer at once; the log is asked again once they rest, so a date typed digit by digit asks once.
  useEffect(() => {
    if (!query || filters === query.filters) return
    const timer = setTimeout(() => {
      setTrail([])
      setQuery({ filters, cursor: null })
    }, AUDIT_FILTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [filters, query])

  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    setLoading(true)
    setFailure(null)
    apiFetch('listAuditEntries', {
      params: { org },
      query: {
        limit: AUDIT_PAGE_SIZE,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...toApiAuditFilters(query.filters)
      },
      signal: controller.signal
    })
      .then((page) => {
        const result = page as Page<AuditEntry>
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
  }, [query, org, attempt])

  useEffect(() => {
    const controller = new AbortController()
    setDirectory(null)
    setDirectoryFailure(null)
    Promise.all([
      readAll((cursor) =>
        apiFetch('listMembers', {
          org,
          params: { org },
          query: { limit: 200, ...(cursor ? { cursor } : {}) },
          signal: controller.signal
        })
      ),
      readAll((cursor) =>
        apiFetch('listProjects', {
          org,
          query: { limit: 200, ...(cursor ? { cursor } : {}) },
          signal: controller.signal
        })
      )
    ])
      .then(([people, projects]) => {
        if (controller.signal.aborted) return
        setDirectory({
          people: people as Person[],
          projects: projects.map((project) => ({ id: project.id, name: project.name }))
        })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDirectoryFailure({ error, at: new Date().toISOString() })
      })
    return () => controller.abort()
  }, [org, directoryAttempt])

  const names = useMemo(
    () => ({
      members: new Map((directory?.people ?? []).map((person) => [person.id, person.name])),
      projects: new Map((directory?.projects ?? []).map((project) => [project.id, project.name]))
    }),
    [directory]
  )

  const syncUrl = (next: AuditFilterState, cursor: string | null) => {
    const query = writeAuditFilters(new URLSearchParams(window.location.search), next, cursor).toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }

  const update = (key: keyof AuditFilterState, value: string) => {
    const next = { ...filters, [key]: value }
    syncUrl(next, null)
    setFilters(next)
  }

  const goOlder = () => {
    if (!query || !nextCursor) return
    setTrail((current) => [...current, query.cursor])
    setQuery({ filters: query.filters, cursor: nextCursor })
    syncUrl(query.filters, nextCursor)
  }

  const goNewer = () => {
    if (!query) return
    const before = trail.length ? (trail[trail.length - 1] ?? null) : null
    setTrail((current) => current.slice(0, -1))
    setQuery({ filters: query.filters, cursor: before })
    syncUrl(query.filters, before)
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

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  // Where the page sits is known from the first page onwards; a page reached from a shared link knows only its size.
  const positionKnown = query !== null && (query.cursor === null || trail.length > 0)
  const first = trail.length * AUDIT_PAGE_SIZE + 1
  const range = !entries?.length
    ? null
    : positionKnown
      ? copy('range', { from: number(first), to: number(first + entries.length - 1) })
      : copy('pageOf', { count: number(entries.length) })
  const active = Object.values(filters).filter(Boolean).length
  const actionName = (action: string) => copy(`actions.${auditActionKey(action)}`)
  const objectNoun = (type: string) => {
    const key = targetTypeKey(type)
    return key === 'unknown' ? copy('objectUnknown') : copy(`targets.${key}`)
  }
  const roleName = (role: string) => t(`members.role_names.${role}`, {}, locale)
  const people = directory?.people ?? []
  const projects = directory?.projects ?? []
  const settled = directory !== null || directoryFailure !== null

  const actorCell = (entry: AuditEntry) => {
    const actor = describeActor(entry)
    if (actor.kind === 'deleted') return copy('deletedAccount')
    if (actor.kind === 'other') return copy(`actorTypes.${actor.type}`)
    return actor.role ? `${actor.name} · ${roleName(actor.role)}` : actor.name
  }
  const objectCell = (entry: AuditEntry) => {
    const name = targetName(entry, names)
    const noun = objectNoun(entry.target_type)
    return name ? copy('objectNamed', { type: noun, name }) : noun
  }
  const projectCell = (entry: AuditEntry) => {
    if (!entry.project_id) return copy('whole')
    return names.projects.get(entry.project_id) ?? (settled ? copy('otherProject') : '')
  }

  return (
    <div>
      <SettingsAside>
        <SettingsSummaryLine label={copy('summaryShowing')}>{range ?? copy('summaryNone')}</SettingsSummaryLine>
        <SettingsSummaryLine label={copy('filters')}>
          {active ? copy('summaryFilters', { count: active }) : copy('summaryNoFilters')}
        </SettingsSummaryLine>
      </SettingsAside>
      <p role="status" className="sr-only">
        {loading ? copy('loading') : (range ?? copy('summaryNone'))}
      </p>
      <SettingsParts>
        <SettingsPart title={copy('filters')} description={copy('dateHint')} id="audit-filters-title">
          {directoryFailure ? (
            <SettingsReadError
              source={copy('directorySource')}
              error={directoryFailure.error}
              at={directoryFailure.at}
              locale={locale}
              onRetry={() => setDirectoryAttempt((value) => value + 1)}
            />
          ) : null}
          <div role="group" aria-labelledby="audit-filters-title" className={styles.filters}>
            <SettingsField label={copy('actor')}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="actor_id"
                  autoComplete="off"
                  value={filters.actor_id}
                  disabled={!hydrated || !directory}
                  onChange={(event) => update('actor_id', event.target.value)}
                >
                  <option value="">{copy('anyone')}</option>
                  {people.map((person) => (
                    <option key={person.account_id} value={person.account_id}>
                      {person.name}
                    </option>
                  ))}
                  {filters.actor_id && directory && !people.some((person) => person.account_id === filters.actor_id) ? (
                    <option value={filters.actor_id}>{copy('formerPerson')}</option>
                  ) : null}
                </NativeSelect>
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
                  {AUDIT_ACTION_OPTIONS.map((action) => (
                    <option key={action} value={action}>
                      {actionName(action)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </SettingsField>
            <SettingsField label={copy('projectId')}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="project_id"
                  autoComplete="off"
                  value={filters.project_id}
                  disabled={!hydrated || !directory}
                  onChange={(event) => update('project_id', event.target.value)}
                >
                  <option value="">{copy('allProjects')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                  {filters.project_id && directory && !projects.some((project) => project.id === filters.project_id) ? (
                    <option value={filters.project_id}>{copy('otherProject')}</option>
                  ) : null}
                </NativeSelect>
              )}
            </SettingsField>
            <SettingsField label={copy('targetType')}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="target_type"
                  autoComplete="off"
                  value={filters.target_type}
                  disabled={!hydrated}
                  onChange={(event) => update('target_type', event.target.value)}
                >
                  <option value="">{copy('anyObject')}</option>
                  {AUDIT_TARGET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {copy(`targets.${type}`)}
                    </option>
                  ))}
                  {filters.target_type && !(AUDIT_TARGET_TYPES as readonly string[]).includes(filters.target_type) ? (
                    <option value={filters.target_type}>{objectNoun(filters.target_type)}</option>
                  ) : null}
                </NativeSelect>
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
              className="transition-none"
              onClick={exportCsv}
              disabled={!hydrated || exporting}
            >
              {exporting ? copy('exporting') : copy('export')}
            </Button>
            {exportError ? <SettingsError>{copy('exportError')}</SettingsError> : null}
          </div>
        </SettingsPart>

        <SettingsPart title={copy('records')} id="audit-records-title">
          <p role="status" className="type-small text-muted-foreground empty:hidden">
            {copied ? copy(copied === 'copied' ? 'copied' : 'copyFailed') : null}
          </p>
          {failure ? (
            <SettingsReadError
              source={copy('source')}
              error={failure.error}
              at={failure.at}
              locale={locale}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          ) : entries === null ? (
            <SettingsLoading locale={locale} className="grid gap-1">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full rounded-full" />
              ))}
            </SettingsLoading>
          ) : entries.length === 0 ? (
            <p className="type-body">{loading ? copy('loading') : active ? copy('emptyFiltered') : copy('empty')}</p>
          ) : (
            <div
              role="region"
              className="min-w-0"
              aria-label={copy('entriesRegion')}
              aria-busy={loading}
              /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable requires the scroll container to be keyboard-focusable. */
              tabIndex={0}
            >
              <Table sticky>
                <TableHeader>
                  <TableRow>
                    <TableHead className="lg:w-52">{copy('time')}</TableHead>
                    <TableHead className="lg:w-52">{copy('actorColumn')}</TableHead>
                    <TableHead>{copy('what')}</TableHead>
                    <TableHead className="lg:w-56">{copy('object')}</TableHead>
                    <TableHead className="lg:w-40 max-lg:hidden">{copy('project')}</TableHead>
                    <TableHead className="lg:w-14">
                      <span className="sr-only">{copy('copyColumn')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const sentence = actionName(entry.action)
                    const time = formatAuditTime(entry.created_at, locale)
                    return (
                      <TableRow key={entry.id} data-audit-row dimmed={loading && !entryMatchesFilters(entry, filters)}>
                        <TableCell phone="meta" label={copy('time')}>
                          <time dateTime={entry.created_at}>{time}</time>
                        </TableCell>
                        <TableCell truncate="30ch" phone="meta" label={copy('actorColumn')}>
                          {actorCell(entry)}
                        </TableCell>
                        <TableCell phone="primary" className="whitespace-normal">
                          {sentence}
                        </TableCell>
                        <TableCell truncate="30ch" phone="meta" label={copy('object')}>
                          {objectCell(entry)}
                        </TableCell>
                        <TableCell truncate="22ch" phone="hide" className="max-lg:hidden">
                          {projectCell(entry)}
                        </TableCell>
                        <TableCell phone="end" className="text-right">
                          <SettingsRowMenu label={copy('copyMenu', { what: sentence, time })}>
                            {entry.actor_id ? (
                              <SettingsRowMenuItem onSelect={() => void copyId(entry.actor_id!)}>
                                {copy('copyActorId', { id: truncatedId(entry.actor_id) })}
                              </SettingsRowMenuItem>
                            ) : null}
                            <SettingsRowMenuItem onSelect={() => void copyId(entry.target_id)}>
                              {copy('copyObjectId', { id: truncatedId(entry.target_id) })}
                            </SettingsRowMenuItem>
                            <SettingsRowMenuItem onSelect={() => void copyId(entry.id)}>
                              {copy('copyRecordId', { id: truncatedId(entry.id) })}
                            </SettingsRowMenuItem>
                          </SettingsRowMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {entries !== null && !failure && (query?.cursor || nextCursor) ? (
            <div className={styles.pager}>
              {range ? <span className={styles.range}>{range}</span> : null}
              <Button type="button" variant="outline" disabled={loading || !query?.cursor} onClick={goNewer}>
                {positionKnown ? copy('newer') : copy('first')}
              </Button>
              <Button type="button" variant="outline" disabled={loading || !nextCursor} onClick={goOlder}>
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
