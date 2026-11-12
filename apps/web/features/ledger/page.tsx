'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Principal, Project } from '@skyclause/contracts'
import { CallState, Mode, Pack } from '@skyclause/contracts'
import { formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import { ArchiveIcon, DownloadIcon, ShieldAlertIcon, ShieldCheckIcon, XIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Field, FieldGroup, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#ui/tabs'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '#ui/empty'
import { ApiProblem } from '../../lib/api-fetch'
import { RequestEvidence, type EvidenceTarget } from '../evidence/request'
import { EvidenceSheet } from '../evidence/pack'
import { EvidenceList } from '../evidence/list'
import { apiFetch } from './operations'
import { readLedgerPage } from './read-page'
import { useRead } from './use-read'
import { Failure, Loading } from './feedback'
import { t } from './i18n'
import {
  KIND_GROUPS,
  filtersFromSearch,
  invalidFilters,
  kindGroupFromSearch,
  ledgerHref,
  matchesKind,
  targetEntry,
  type KindGroup
} from './model'
import { LedgerTable } from './table'
import { ArchiveSheet } from './archive'
import { saveDownload } from './download'
import { problemMessage } from './problem'
import './ledger.css'

type Locale = 'en' | 'ms'

/** The title row: the h1 with the chain's state under it, and the page's actions at its right end. */
function Title({ locale, integrity, actions }: { locale: Locale; integrity?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ledger-title">
      <div className="ledger-title-text">
        <h1>{t('ledger.title', {}, locale)}</h1>
        {integrity}
      </div>
      {actions && <div className="ledger-actions">{actions}</div>}
    </header>
  )
}

export function LedgerPage({
  org,
  projectSlug,
  principal,
  locale
}: {
  org: string
  projectSlug: string
  principal: Principal | null
  locale: Locale
}) {
  const read = useCallback(
    async (signal: AbortSignal) => {
      let cursor: string | undefined
      const seen = new Set<string>()
      do {
        const page = await apiFetch('listProjects', { query: { slug: projectSlug, limit: 200, cursor }, signal, org })
        const project = page.data.find((project) => project.slug === projectSlug)
        if (project) return project
        cursor = page.next_cursor ?? undefined
        if (cursor && seen.has(cursor)) throw new Error('Repeated project cursor')
        if (cursor) seen.add(cursor)
      } while (cursor)
      // The project list answered without this project: name it as not found, not as a silent empty ledger.
      throw new ApiProblem(404, {})
    },
    [org, projectSlug]
  )
  const project = useRead(read)
  return (
    <div className="ledger-page" lang={locale}>
      {project.loading ? (
        <>
          <Title locale={locale} />
          <Loading locale={locale} rows={8} />
        </>
      ) : project.data ? (
        <LedgerContent key={project.data.id} project={project.data} principal={principal} locale={locale} />
      ) : (
        <>
          <Title locale={locale} />
          <Failure source="project" error={project.error} at={project.failedAt} retry={project.retry} locale={locale} />
        </>
      )}
    </div>
  )
}

const SELECTS = [
  { key: 'pack', values: Pack.options, catalogue: 'packs' },
  { key: 'mode', values: Mode.options, catalogue: 'modes' },
  { key: 'state', values: CallState.options, catalogue: 'states' }
] as const

function LedgerContent({
  project,
  principal,
  locale
}: {
  project: Project
  principal: Principal | null
  locale: Locale
}) {
  const search = useSearchParams()
  const path = usePathname()
  const tab = search.get('tab') === 'evidence' ? 'evidence' : 'entries'
  const guest = principal?.kind === 'guest_token' || (principal?.kind === 'session' && principal.isGuest)
  // `?request=evidence` (a link from the window form) opens the request form on arrival.
  const [target, setTarget] = useState<EvidenceTarget | null>(() => (search.get('request') === 'evidence' ? {} : null))
  const [actionError, setActionError] = useState('')
  const [exporting, setExporting] = useState(false)
  const archiveTrigger = useRef<HTMLAnchorElement>(null)
  const requestTrigger = useRef<HTMLButtonElement>(null)
  const packTrigger = useRef<HTMLElement | null>(null)
  const evidenceTab = useRef<HTMLButtonElement>(null)
  const href = (changes: Record<string, string | null>) => ledgerHref(path, search, changes)
  // Native history integrates with Next's search hook and avoids server work for each local filter edit. A field edit
  // replaces the entry (a date field fires once per typed digit); pages, tabs and sheets push one.
  const navigate = (changes: Record<string, string | null>, replace = false) =>
    window.history[replace ? 'replaceState' : 'pushState'](null, '', href(changes))
  let filters: ReturnType<typeof filtersFromSearch> = {}
  let invalid = false
  try {
    filters = filtersFromSearch(search)
  } catch {
    invalid = true
  }
  const invalidKeys = invalid ? invalidFilters(search) : new Set<string>()
  const kindGroup = kindGroupFromSearch(search)
  const filterKey = JSON.stringify(filters)
  const cursor = search.get('cursor') ?? undefined
  const offset = Math.max(0, Number(search.get('offset')) || 0)
  const selectedEntry = search.get('entry')
  const selectedCall = search.get('call')
  const readLedger = useCallback(
    async (signal: AbortSignal) => {
      const query = JSON.parse(filterKey) as ReturnType<typeof filtersFromSearch>
      let page = await readLedgerPage({
        params: { id: project.id },
        query: { ...query, cursor, limit: 50 },
        signal
      })
      if (selectedEntry || selectedCall) {
        const seen = new Set<string>()
        while (!targetEntry(page.data, selectedEntry, selectedCall) && page.next_cursor) {
          if (seen.has(page.next_cursor)) throw new Error('Repeated ledger cursor')
          seen.add(page.next_cursor)
          const next = await readLedgerPage({
            params: { id: project.id },
            query: { ...query, cursor: page.next_cursor, limit: 50 },
            signal
          })
          page = { ...next, data: [...page.data, ...next.data] }
        }
      }
      return { ...page, view: { key: `${filterKey}-${cursor ?? ''}`, offset } }
    },
    [project.id, filterKey, cursor, selectedEntry, selectedCall, offset]
  )
  const ledger = useRead(readLedger, false, { keepPreviousData: true })
  const verification = useRead(
    useCallback((signal) => apiFetch('verifyLedger', { params: { id: project.id }, signal }), [project.id])
  )
  const archive = useRead(
    useCallback((signal) => apiFetch('getPilotArchive', { params: { id: project.id }, signal }), [project.id])
  )
  const openRequest = useCallback((target: EvidenceTarget) => {
    requestTrigger.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    setTarget(target)
  }, [])
  const correctionHref = useCallback((id: string) => ledgerHref(path, new URLSearchParams(), { entry: id }), [path])
  const callHref = useCallback(
    (id: string) => `${path.replace(/\/ledger$/, '')}/calls/${encodeURIComponent(id)}`,
    [path]
  )
  const closeRequest = () => {
    setTarget(null)
    if (search.get('request')) navigate({ request: null }, true)
    requestAnimationFrame(() => requestTrigger.current?.focus())
  }
  const changeFilter = (key: string, value: string) =>
    navigate({ [key]: value || null, cursor: null, offset: null, entry: null, call: null }, true)
  const filterLabel = (key: 'from' | 'to' | 'pack' | 'mode' | 'state', value: string) =>
    t(
      'ledger.filter',
      {
        name: t(`ledger.${key}`, {}, locale),
        value:
          key === 'from' || key === 'to'
            ? formatDate(value, locale)
            : t(`ledger.${key === 'pack' ? 'packs' : key === 'mode' ? 'modes' : 'states'}.${value}`, {}, locale)
      },
      locale
    )
  const chips = (['from', 'to', 'pack', 'mode', 'state'] as const).filter((key) => filters[key])
  const rows = ledger.data?.data ?? []
  const matching = kindGroup ? rows.filter((row) => matchesKind(row.kind, kindGroup)).length : 0
  const selected = targetEntry(rows, selectedEntry, selectedCall)
  const integrity = (
    <div className="ledger-integrity">
      <p role="status" data-valid={verification.data ? String(verification.data.valid) : undefined}>
        {verification.data ? (
          <>
            {verification.data.valid ? (
              <ShieldCheckIcon aria-hidden="true" focusable="false" />
            ) : (
              <ShieldAlertIcon aria-hidden="true" focusable="false" />
            )}
            <span>
              {verification.data.valid
                ? t('ledger.ok', { count: formatNumber(verification.data.checked_entries, locale) }, locale)
                : t(
                    'ledger.bad',
                    { id: verification.data.first_bad_entry_id ?? t('ledger.noValue', {}, locale) },
                    locale
                  )}
            </span>
            <time dateTime={verification.data.verified_at}>
              {t('ledger.checkedAt', { time: formatTime(verification.data.verified_at, locale) }, locale)}
            </time>
          </>
        ) : verification.loading ? (
          <span>{t('ledger.checking', {}, locale)}</span>
        ) : null}
      </p>
      <Button variant="ghost" size="sm" onClick={verification.retry} disabled={verification.loading}>
        {t('ledger.verify', {}, locale)}
      </Button>
    </div>
  )
  return (
    <>
      <Title
        locale={locale}
        integrity={integrity}
        actions={
          <>
            {archive.data?.data.length ? (
              <a
                ref={archiveTrigger}
                className="ledger-archive-link"
                href={href({ archive: '1' })}
                onClick={(event) => {
                  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                    event.preventDefault()
                    navigate({ archive: '1' })
                  }
                }}
              >
                <ArchiveIcon aria-hidden="true" focusable="false" />
                {t('ledger.archive', {}, locale)}
              </a>
            ) : null}
            <Button onClick={() => openRequest({})}>{t('evidence.request', {}, locale)}</Button>
          </>
        }
      />
      {verification.error && (
        <Failure
          source="integrity"
          error={verification.error}
          at={verification.failedAt}
          retry={verification.retry}
          locale={locale}
        />
      )}
      <Tabs value={tab} onValueChange={(value) => navigate({ tab: value === 'entries' ? null : String(value) })}>
        <div className="ledger-tabs">
          <TabsList aria-label={t('ledger.title', {}, locale)}>
            <TabsTrigger value="entries">{t('ledger.entries', {}, locale)}</TabsTrigger>
            <TabsTrigger ref={evidenceTab} value="evidence">
              {t('ledger.evidence', {}, locale)}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="entries" className="ledger-entries">
          <FieldGroup className="ledger-filters" role="group" aria-label={t('ledger.filters', {}, locale)}>
            {(['from', 'to'] as const).map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`ledger-${key}`}>{t(`ledger.${key}`, {}, locale)}</FieldLabel>
                <span className="ledger-field-ring" data-focus-ring>
                  <Input
                    id={`ledger-${key}`}
                    name={key}
                    type="date"
                    autoComplete="off"
                    value={search.get(key) ?? ''}
                    aria-invalid={invalidKeys.has(key) || undefined}
                    aria-describedby={invalidKeys.has(key) ? 'ledger-invalid' : undefined}
                    onChange={(event) => changeFilter(key, event.target.value)}
                  />
                </span>
              </Field>
            ))}
            {SELECTS.map(({ key, values, catalogue }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`ledger-${key}`}>{t(`ledger.${key}`, {}, locale)}</FieldLabel>
                <select
                  id={`ledger-${key}`}
                  name={key}
                  className="native-select"
                  autoComplete="off"
                  value={search.get(key) ?? ''}
                  aria-invalid={invalidKeys.has(key) || undefined}
                  aria-describedby={invalidKeys.has(key) ? 'ledger-invalid' : undefined}
                  onChange={(event) => changeFilter(key, event.target.value)}
                >
                  <option value="">{t('ledger.all', {}, locale)}</option>
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {t(`ledger.${catalogue}.${value}`, {}, locale)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor="ledger-kind">{t('ledger.show', {}, locale)}</FieldLabel>
              <select
                id="ledger-kind"
                name="kind"
                className="native-select"
                autoComplete="off"
                value={kindGroup ?? ''}
                // Dims the rows of other kinds in place; the range and the CSV export stay as they are.
                onChange={(event) => navigate({ kind: event.target.value || null }, true)}
              >
                <option value="">{t('ledger.all', {}, locale)}</option>
                {(Object.keys(KIND_GROUPS) as KindGroup[]).map((group) => (
                  <option key={group} value={group}>
                    {t(`ledger.kindOptions.${group}`, {}, locale)}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGroup>
          {chips.length > 0 && (
            <div className="ledger-chips-row">
              <div className="ledger-chips" data-ledger-filter-chips>
                {chips.map((key) => {
                  const label = filterLabel(key, filters[key]!)
                  return (
                    <Button
                      key={key}
                      variant="outline"
                      size="sm"
                      aria-label={t('ledger.removeFilter', { label }, locale)}
                      onClick={() => {
                        changeFilter(key, '')
                        document.getElementById(`ledger-${key}`)?.focus()
                      }}
                    >
                      {label}
                      <XIcon data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate({
                    from: null,
                    to: null,
                    pack: null,
                    mode: null,
                    state: null,
                    cursor: null,
                    offset: null,
                    entry: null
                  })
                }
              >
                {t('ledger.clear', {}, locale)}
              </Button>
            </div>
          )}
          {invalid ? (
            <p role="alert" className="ledger-invalid" id="ledger-invalid">
              {t('ledger.invalid', {}, locale)}
            </p>
          ) : (
            <>
              <div className="ledger-toolbar">
                <div className="ledger-counts">
                  {/* While the first page loads, the skeleton's own status says so; this line waits for a count. */}
                  <p data-ledger-total aria-live="polite">
                    {ledger.loading && !ledger.data
                      ? null
                      : ledger.data &&
                        t(
                          'ledger.total',
                          {
                            from: formatNumber(ledger.data.data.length ? offset + 1 : 0, locale),
                            to: formatNumber(offset + ledger.data.data.length, locale),
                            n: formatNumber(ledger.data.total, locale)
                          },
                          locale
                        )}
                  </p>
                  {kindGroup && ledger.data && rows.length > 0 && (
                    <p className="ledger-matching" aria-live="polite">
                      {t(
                        'ledger.matching',
                        {
                          n: formatNumber(matching, locale),
                          total: formatNumber(rows.length, locale),
                          group: t(`ledger.kindGroups.${kindGroup}`, {}, locale)
                        },
                        locale
                      )}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true)
                    setActionError('')
                    try {
                      const csv = await apiFetch('exportLedger', { params: { id: project.id }, query: filters })
                      saveDownload(csv, 'text/csv', t('ledger.exportFile', {}, locale))
                    } catch (error) {
                      setActionError(problemMessage(error, locale, 'ledger.exportFailed'))
                    } finally {
                      setExporting(false)
                    }
                  }}
                >
                  <DownloadIcon data-icon="inline-start" aria-hidden="true" />
                  {t(exporting ? 'ledger.exporting' : 'ledger.export', {}, locale)}
                </Button>
              </div>
              {actionError && (
                <p role="alert" className="ledger-invalid">
                  {actionError}
                </p>
              )}
              {ledger.loading && !ledger.data ? (
                <Loading locale={locale} rows={8} />
              ) : ledger.error ? (
                <Failure
                  source="entries"
                  error={ledger.error}
                  at={ledger.failedAt}
                  retry={ledger.retry}
                  locale={locale}
                />
              ) : (
                ledger.data &&
                (ledger.data.data.length ? (
                  <LedgerTable
                    key={ledger.data.view.key}
                    rows={ledger.data.data}
                    total={ledger.data.total}
                    offset={ledger.data.view.offset}
                    locale={locale}
                    onRequest={openRequest}
                    correctionHref={correctionHref}
                    callHref={callHref}
                    selectedEntry={selected}
                    kindGroup={kindGroup}
                    busy={ledger.loading}
                  />
                ) : (
                  <Empty className="ledger-empty">
                    <EmptyHeader>
                      <EmptyTitle>{t(chips.length ? 'ledger.emptyFiltered' : 'ledger.empty', {}, locale)}</EmptyTitle>
                      <EmptyDescription>
                        {t(chips.length ? 'ledger.emptyFilteredNext' : 'ledger.next', {}, locale)}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ))
              )}
              {(cursor || ledger.data?.next_cursor) && (
                <div className="ledger-pager">
                  {cursor && (
                    <Button
                      variant="outline"
                      disabled={ledger.loading}
                      onClick={() => navigate({ cursor: null, offset: null })}
                    >
                      {t('ledger.firstPage', {}, locale)}
                    </Button>
                  )}
                  {ledger.data?.next_cursor && (
                    <Button
                      variant="outline"
                      disabled={ledger.loading}
                      onClick={() =>
                        navigate({
                          cursor: ledger.data!.next_cursor!,
                          offset: String(offset + ledger.data!.data.length)
                        })
                      }
                    >
                      {t('ledger.nextPage', {}, locale)}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceList
            projectId={project.id}
            guest={!!guest}
            locale={locale}
            cursor={search.get('requests_cursor') ?? undefined}
            onNext={(cursor) => navigate({ requests_cursor: cursor })}
            evidenceHref={(id) => href({ tab: 'evidence', evidence: id })}
            onOpen={(id, trigger) => {
              packTrigger.current = trigger
              navigate({ tab: 'evidence', evidence: id })
            }}
          />
        </TabsContent>
      </Tabs>
      {archive.error && (
        <Failure source="archive" error={archive.error} at={archive.failedAt} retry={archive.retry} locale={locale} />
      )}
      <ArchiveSheet
        files={archive.data?.data ?? []}
        open={search.get('archive') === '1' && !!archive.data?.data.length}
        locale={locale}
        onClose={() => {
          navigate({ archive: null })
          requestAnimationFrame(() => archiveTrigger.current?.focus())
        }}
      />
      <RequestEvidence
        projectId={project.id}
        target={target}
        locale={locale}
        onClose={closeRequest}
        onCreated={(request) => {
          packTrigger.current = requestTrigger.current
          setTarget(null)
          navigate({ tab: 'evidence', evidence: request.id, request: null })
        }}
      />
      <EvidenceSheet
        id={search.get('evidence')}
        projectId={project.id}
        projectName={project.name}
        principal={principal}
        guest={!!guest}
        locale={locale}
        finalFocus={() => (packTrigger.current?.isConnected ? packTrigger.current : evidenceTab.current)}
        onClose={() => {
          navigate({ evidence: null })
        }}
      />
    </>
  )
}
