'use client'

import { useCallback, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Principal, Project } from '@skyclause/contracts'
import { CallState, Mode, Pack } from '@skyclause/contracts'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { XIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Field, FieldGroup, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#ui/tabs'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '#ui/empty'
import { Alert, AlertDescription } from '#ui/alert'
import { RequestEvidence, type EvidenceTarget } from '../evidence/request'
import { EvidenceSheet } from '../evidence/pack'
import { EvidenceList } from '../evidence/list'
import { apiFetch } from './operations'
import { readLedgerPage } from './read-page'
import { useRead } from './use-read'
import { Failure, Loading } from './feedback'
import { t } from './i18n'
import { filtersFromSearch, ledgerHref } from './model'
import { LedgerTable } from './table'
import { ArchiveSheet } from './archive'
import { saveDownload } from './download'
import { problemMessage } from './problem'
import './ledger.css'

export function LedgerPage({
  org,
  projectSlug,
  principal,
  locale
}: {
  org: string
  projectSlug: string
  principal: Principal | null
  locale: 'en' | 'ms'
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
      throw new Error('Project unavailable')
    },
    [org, projectSlug]
  )
  const project = useRead(read)
  return (
    <div className="ledger-page" lang={locale}>
      <h1>{t('ledger.title', {}, locale)}</h1>
      {project.loading ? (
        <Loading locale={locale} />
      ) : project.data ? (
        <LedgerContent key={project.data.id} project={project.data} principal={principal} locale={locale} />
      ) : (
        <Failure error={project.error} retry={project.retry} locale={locale} />
      )}
    </div>
  )
}

function LedgerContent({
  project,
  principal,
  locale
}: {
  project: Project
  principal: Principal | null
  locale: 'en' | 'ms'
}) {
  const search = useSearchParams()
  const path = usePathname()
  const tab = search.get('tab') === 'evidence' ? 'evidence' : 'entries'
  const guest = principal?.kind === 'guest_token' || (principal?.kind === 'session' && principal.isGuest)
  const [target, setTarget] = useState<EvidenceTarget | null>(null)
  const [actionError, setActionError] = useState('')
  const [exporting, setExporting] = useState(false)
  const archiveTrigger = useRef<HTMLAnchorElement>(null)
  const requestTrigger = useRef<HTMLButtonElement>(null)
  const packTrigger = useRef<HTMLElement | null>(null)
  const evidenceTab = useRef<HTMLButtonElement>(null)
  const href = (changes: Record<string, string | null>) => ledgerHref(path, search, changes)
  // Native history integrates with Next's search hook and avoids server work for each local filter edit.
  const navigate = (changes: Record<string, string | null>) => window.history.pushState(null, '', href(changes))
  let filters: ReturnType<typeof filtersFromSearch> = {}
  let invalid = false
  try {
    filters = filtersFromSearch(search)
  } catch {
    invalid = true
  }
  const filterKey = JSON.stringify(filters)
  const cursor = search.get('cursor') ?? undefined
  const offset = Math.max(0, Number(search.get('offset')) || 0)
  const selectedEntry = search.get('entry')
  const readLedger = useCallback(
    async (signal: AbortSignal) => {
      const query = JSON.parse(filterKey) as ReturnType<typeof filtersFromSearch>
      let page = await readLedgerPage({
        params: { id: project.id },
        query: { ...query, cursor, limit: 50 },
        signal
      })
      if (selectedEntry) {
        const seen = new Set<string>()
        while (!page.data.some((row) => row.id === selectedEntry) && page.next_cursor) {
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
    [project.id, filterKey, cursor, selectedEntry, offset]
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
  const closeRequest = () => {
    setTarget(null)
    requestAnimationFrame(() => requestTrigger.current?.focus())
  }
  const changeFilter = (key: string, value: string) =>
    navigate({ [key]: value || null, cursor: null, offset: null, entry: null })
  return (
    <>
      <header className="ledger-heading">
        <p>{t('ledger.question', {}, locale)}</p>
        <div className="ledger-actions">
          {archive.data?.data.length ? (
            <a
              ref={archiveTrigger}
              href={href({ archive: '1' })}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && event.button === 0) {
                  event.preventDefault()
                  navigate({ archive: '1' })
                }
              }}
            >
              {t('ledger.archive', {}, locale)}
            </a>
          ) : null}
          <Button onClick={() => openRequest({})}>{t('evidence.request', {}, locale)}</Button>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(value) => navigate({ tab: value === 'entries' ? null : String(value) })}>
        <TabsList variant="line" className="ledger-tabs" aria-label={t('ledger.title', {}, locale)}>
          <TabsTrigger value="entries">{t('ledger.entries', {}, locale)}</TabsTrigger>
          <TabsTrigger ref={evidenceTab} value="evidence">
            {t('ledger.evidence', {}, locale)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          <FieldGroup className="ledger-filters">
            {(['from', 'to'] as const).map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`ledger-${key}`}>{t(`ledger.${key}`, {}, locale)}</FieldLabel>
                <Input
                  id={`ledger-${key}`}
                  name={key}
                  type="date"
                  autoComplete="off"
                  value={search.get(key) ?? ''}
                  aria-invalid={invalid}
                  onChange={(event) => changeFilter(key, event.target.value)}
                />
              </Field>
            ))}
            {(
              [
                { key: 'pack', values: Pack.options, catalogue: 'packs' },
                { key: 'mode', values: Mode.options, catalogue: 'modes' },
                { key: 'state', values: CallState.options, catalogue: 'states' }
              ] as const
            ).map(({ key, values, catalogue }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`ledger-${key}`}>{t(`ledger.${key}`, {}, locale)}</FieldLabel>
                <select
                  id={`ledger-${key}`}
                  name={key}
                  value={search.get(key) ?? ''}
                  aria-invalid={invalid}
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
            <Button
              variant="ghost"
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
          </FieldGroup>
          <div className="ledger-actions" data-ledger-filter-chips>
            {(['from', 'to', 'pack', 'mode', 'state'] as const).map((key) => {
              const value = filters[key]
              if (!value) return null
              const label = t(
                'ledger.filter',
                {
                  name: t(`ledger.${key}`, {}, locale),
                  value:
                    key === 'from' || key === 'to'
                      ? formatDate(value, locale)
                      : t(
                          `ledger.${key === 'pack' ? 'packs' : key === 'mode' ? 'modes' : 'states'}.${value}`,
                          {},
                          locale
                        )
                },
                locale
              )
              return (
                <Button
                  key={key}
                  variant="outline"
                  aria-label={t('ledger.removeFilter', { label }, locale)}
                  onClick={() => {
                    changeFilter(key, '')
                    document.getElementById(`ledger-${key}`)?.focus()
                  }}
                >
                  {label}
                  <XIcon data-icon="inline-end" />
                </Button>
              )
            })}
          </div>
          {invalid ? (
            <Alert>
              <AlertDescription>{t('ledger.invalid', {}, locale)}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="ledger-toolbar">
                <p data-ledger-total aria-live="polite">
                  {ledger.loading
                    ? t('ledger.loading', {}, locale)
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
                <div className="ledger-actions">
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
                        setActionError(problemMessage(error, locale))
                      } finally {
                        setExporting(false)
                      }
                    }}
                  >
                    {t('ledger.export', {}, locale)}
                  </Button>
                  <Button variant="outline" onClick={verification.retry}>
                    {t('ledger.verify', {}, locale)}
                  </Button>
                </div>
              </div>
              {actionError && <p role="alert">{actionError}</p>}
              {verification.data && (
                <p role="status">
                  {verification.data.valid
                    ? t('ledger.ok', { count: formatNumber(verification.data.checked_entries, locale) }, locale)
                    : t(
                        'ledger.bad',
                        { id: verification.data.first_bad_entry_id ?? t('ledger.noValue', {}, locale) },
                        locale
                      )}
                </p>
              )}
              {verification.error && <Failure error={verification.error} retry={verification.retry} locale={locale} />}
              {ledger.loading && !ledger.data ? (
                <Loading locale={locale} />
              ) : ledger.error ? (
                <Failure error={ledger.error} retry={ledger.retry} locale={locale} />
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
                    selectedEntry={selectedEntry}
                    busy={ledger.loading}
                  />
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t('ledger.empty', {}, locale)}</EmptyTitle>
                      <EmptyDescription>{t('ledger.next', {}, locale)}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ))
              )}
              <div className="ledger-actions">
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
                      navigate({ cursor: ledger.data!.next_cursor!, offset: String(offset + ledger.data!.data.length) })
                    }
                  >
                    {t('ledger.nextPage', {}, locale)}
                  </Button>
                )}
              </div>
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
      {archive.error && <Failure error={archive.error} retry={archive.retry} locale={locale} />}
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
          navigate({ tab: 'evidence', evidence: request.id })
        }}
      />
      <EvidenceSheet
        id={search.get('evidence')}
        projectId={project.id}
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
