'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { formatList, formatNumber } from '@skyclause/i18n/format'
import { Button, buttonVariants } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { cn } from '#lib/utils'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { StatusMark } from '../brand/status-mark'
import { SourceError } from '../data-components/states'
import {
  SettingsAside,
  SettingsRowMenu,
  SettingsRowMenuItem,
  SettingsStatus,
  SettingsSummaryLine
} from '../settings/parts'
import { focusWhenFree } from '../settings/focus'
import { RowPager, pageOf } from '../settings/project/row-pager'
import { ApiProblem } from '../../lib/api-fetch'
import { apiFetch, type Endpoint, type WebhookProject } from './operations'
import { RegisterForm, problemKey } from './form'
import { EndpointState, Secret, endpointMark, endpointSentence, useVerify } from './endpoint'
import { DeliveryLog, ZonedTime } from './deliveries'
import { t } from './catalogue'
import './webhooks.css'

type Locale = 'en' | 'ms'

function useQueryHref() {
  const pathname = usePathname()
  const search = useSearchParams()
  return useCallback(
    (values: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString())
      for (const [key, value] of Object.entries(values)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      const query = next.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [pathname, search]
  )
}

function useChangeQuery() {
  const router = useRouter()
  const href = useQueryHref()
  return useCallback(
    (values: Record<string, string | null>, replace = false) => {
      const url = href(values)
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [href, router]
  )
}

/** A sentence with a literal in it (a URL, event names): only the literal is kept out of browser translation. */
const MARK = '\u0001'
function Literal({ sentence, value }: { sentence: (mark: string) => string; value: string }) {
  const [before = '', after = ''] = sentence(MARK).split(MARK)
  return (
    <>
      {before}
      <span translate="no">{value}</span>
      {after}
    </>
  )
}

/** A link that a plain click handles in the app, and that opens as a link on a modified click. */
function plainClick(handle: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    handle()
  }
}

type Failed = { error: unknown; at: string }
const failedAt = (error: unknown): Failed => ({ error, at: new Date().toISOString() })
const statusOf = (failure: Failed) => (failure.error instanceof ApiProblem ? failure.error.status : null)

export function Webhooks({
  org,
  settings = false,
  locale = 'en'
}: {
  org: string
  settings?: boolean
  locale?: Locale
}) {
  const search = useSearchParams()
  const changeQuery = useChangeQuery()
  const queryHref = useQueryHref()
  const selectedId = search.get('webhook')
  const cursor = search.get('webhooks_cursor')
  const [data, setData] = useState<{ endpoints: Endpoint[]; projects: WebhookProject[]; next: string | null }>()
  const [failed, setFailed] = useState<Failed>()
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [secret, setSecret] = useState<{ id: string; value: string; url: string } | null>(null)
  const [deleting, setDeleting] = useState<Endpoint | null>(null)
  const [deleteError, setDeleteError] = useState(false)
  const [deleted, setDeleted] = useState<string | null>(null)
  const [verifyNotice, setVerifyNotice] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const hide = () => setSecret(null)
    window.addEventListener('pagehide', hide)
    return () => window.removeEventListener('pagehide', hide)
  }, [])
  useEffect(() => {
    setSecret((previous) => (previous?.id === selectedId ? previous : null))
  }, [selectedId])
  useEffect(() => {
    const controller = new AbortController()
    setData(undefined)
    setFailed(undefined)
    async function load() {
      const [endpoints, projects] = await Promise.all([
        apiFetch('listWebhooks', {
          org,
          query: { limit: 50, ...(cursor ? { cursor } : {}) },
          signal: controller.signal
        }),
        (async () => {
          const projects: WebhookProject[] = []
          const seen = new Set<string>()
          let next: string | undefined
          do {
            const page = await apiFetch('listProjects', {
              org,
              query: { limit: 50, ...(next ? { cursor: next } : {}) },
              signal: controller.signal
            })
            projects.push(...page.data)
            next = page.next_cursor ?? undefined
            if (next && seen.has(next)) throw new Error('Repeated project pagination cursor')
            if (next) seen.add(next)
          } while (next)
          return projects
        })()
      ])
      if (!controller.signal.aborted) setData({ endpoints: endpoints.data, projects, next: endpoints.next_cursor })
    }
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) setFailed(failedAt(error))
    })
    return () => controller.abort()
  }, [org, cursor, reload])

  /** Focus goes back to where the removed or closed control was: the button that opens the form, or its heading. */
  const focusEntry = () =>
    focusWhenFree(() => document.getElementById(settings ? 'webhook-add' : 'webhook-register-title'))

  function created(endpoint: Endpoint, value: string) {
    setSecret({ id: endpoint.id, value, url: endpoint.url })
    setDeleted(null)
    setData((previous) =>
      previous
        ? {
            ...previous,
            endpoints: [endpoint, ...previous.endpoints.filter((item) => item.id !== endpoint.id)].slice(0, 50)
          }
        : previous
    )
    setFormOpen(false)
    changeQuery({ webhook: endpoint.id, delivery: null, delivery_cursor: null })
  }
  async function remove() {
    if (!deleting) return
    setDeleteError(false)
    try {
      await apiFetch('deleteWebhook', { org, params: { id: deleting.id } })
      setData((previous) =>
        previous ? { ...previous, endpoints: previous.endpoints.filter((item) => item.id !== deleting.id) } : previous
      )
      if (secret?.id === deleting.id) setSecret(null)
      setDeleted(deleting.url)
      if (selectedId === deleting.id) changeQuery({ webhook: null, delivery: null, delivery_cursor: null })
      focusEntry()
    } catch (error) {
      setDeleteError(true)
      throw error
    }
  }
  function updated(endpoint: Endpoint) {
    setData((previous) =>
      previous
        ? { ...previous, endpoints: previous.endpoints.map((item) => (item.id === endpoint.id ? endpoint : item)) }
        : previous
    )
  }
  const {
    verify,
    busy: verifying,
    error: verifyError
  } = useVerify(org, (endpoint) => {
    updated(endpoint)
    setVerifyNotice(
      t('webhooks.verify_result', { url: endpoint.url, state: endpointSentence(endpoint, locale) }, locale)
    )
  })

  if (failed)
    return (
      <div className="webhooks">
        <SourceError
          source={t('webhooks.source_list', {}, locale)}
          status={statusOf(failed)}
          at={failed.at}
          locale={locale}
          retry={
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
              {t('webhooks.retry', {}, locale)}
            </Button>
          }
        />
      </div>
    )
  if (!data)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-10 w-3/4 rounded-full" />
        <p role="status" className="sr-only">
          {t('webhooks.loading', {}, locale)}
        </p>
      </div>
    )
  const registerForm = (revealed: boolean) => (
    <RegisterForm
      org={org}
      projects={data.projects}
      onCreated={created}
      onCancel={
        revealed
          ? () => {
              setFormOpen(false)
              focusEntry()
            }
          : undefined
      }
      locale={locale}
      focusOnMount={revealed}
    />
  )
  const projectNames = (endpoint: Endpoint) =>
    endpoint.project_ids.flatMap((id) => data.projects.find((project) => project.id === id)?.name ?? [])
  const lastPage = Math.min(page, Math.max(0, Math.ceil(data.endpoints.length / 50) - 1))

  return (
    <div className="webhooks" data-webhooks>
      {secret && (
        <Secret
          key={secret.value}
          value={secret.value}
          url={secret.url}
          dismiss={() => {
            setSecret(null)
            focusEntry()
          }}
          locale={locale}
        />
      )}
      {deleted && (
        <p role="status" className="type-body">
          <Literal sentence={(mark) => t('webhooks.deleted', { url: mark }, locale)} value={deleted} />
        </p>
      )}
      {settings ? (
        <>
          <SettingsAside>
            <SettingsSummaryLine label={t('webhooks.endpoints', {}, locale)}>
              <span data-numeric>{formatNumber(data.endpoints.length, locale)}</span>
            </SettingsSummaryLine>
            <SettingsSummaryLine label={t('webhooks.state_verified', {}, locale)}>
              <span data-numeric>
                {formatNumber(
                  data.endpoints.filter((endpoint) => endpoint.verified_at && !endpoint.disabled_at).length,
                  locale
                )}
              </span>
            </SettingsSummaryLine>
          </SettingsAside>
          <div>
            <Button
              id="webhook-add"
              aria-expanded={formOpen}
              aria-controls="webhook-register-card"
              onClick={() => setFormOpen(true)}
            >
              {t('webhooks.add', {}, locale)}
            </Button>
          </div>
          {formOpen && (
            <Card id="webhook-register-card">
              <CardContent>{registerForm(true)}</CardContent>
            </Card>
          )}
          {!data.endpoints.length && (
            <p className="type-body text-muted-foreground">{t('webhooks.empty', {}, locale)}</p>
          )}
          {data.endpoints.length > 0 && (
            <Table aria-label={t('webhooks.endpoints', {}, locale)} data-webhook-endpoints>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('webhooks.col_endpoint', {}, locale)}</TableHead>
                  {/* The panel is 660px wide: the counts of events and projects and the last delivery show on a phone. */}
                  <TableHead className="hidden">{t('webhooks.events', {}, locale)}</TableHead>
                  <TableHead className="hidden">{t('webhooks.projects', {}, locale)}</TableHead>
                  <TableHead>{t('webhooks.status', {}, locale)}</TableHead>
                  <TableHead className="hidden">{t('webhooks.last_delivery', {}, locale)}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('webhooks.col_actions', {}, locale)}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageOf(data.endpoints, lastPage).map((endpoint) => {
                  const mark = endpointMark(endpoint, locale)
                  const names = projectNames(endpoint)
                  return (
                    <TableRow key={endpoint.id} data-endpoint-id={endpoint.id}>
                      <TableCell truncate="36ch" title={endpoint.url}>
                        <span translate="no" className="webhook-url font-medium">
                          {endpoint.url}
                        </span>
                      </TableCell>
                      <TableCell
                        phone="meta"
                        className="hidden"
                        label={t('webhooks.events', {}, locale)}
                        title={formatList(endpoint.events, locale)}
                      >
                        {t(
                          endpoint.events.length === 1 ? 'webhooks.events_count_one' : 'webhooks.events_count_other',
                          { count: endpoint.events.length },
                          locale
                        )}
                      </TableCell>
                      <TableCell
                        phone="meta"
                        className="hidden"
                        label={t('webhooks.projects', {}, locale)}
                        title={names.length ? formatList(names, locale) : undefined}
                      >
                        {endpoint.project_ids.length
                          ? t(
                              endpoint.project_ids.length === 1
                                ? 'webhooks.projects_count_one'
                                : 'webhooks.projects_count_other',
                              { count: endpoint.project_ids.length },
                              locale
                            )
                          : t('webhooks.all_projects', {}, locale)}
                      </TableCell>
                      <TableCell phone="end" title={endpointSentence(endpoint, locale)}>
                        <StatusMark state={mark.state} variant="plain" label={mark.word} locale={locale} />
                      </TableCell>
                      <TableCell phone="meta" className="hidden" label={t('webhooks.last_delivery', {}, locale)}>
                        <ZonedTime value={endpoint.last_delivery_at} locale={locale} />
                      </TableCell>
                      <TableCell phone="meta">
                        <div className="webhook-row-actions">
                          <a
                            className={cn(buttonVariants({ variant: 'ghost' }))}
                            href={`/developers/webhooks?webhook=${encodeURIComponent(endpoint.id)}`}
                            aria-label={t('webhooks.open_named', { url: endpoint.url }, locale)}
                          >
                            {t('webhooks.open', {}, locale)}
                          </a>
                          <SettingsRowMenu label={t('webhooks.more_actions', { url: endpoint.url }, locale)}>
                            <SettingsRowMenuItem disabled={verifying} onSelect={() => void verify(endpoint)}>
                              {t('webhooks.verify', {}, locale)}
                            </SettingsRowMenuItem>
                            <SettingsRowMenuItem
                              destructive
                              onSelect={() => {
                                setDeleting(endpoint)
                                setDeleteError(false)
                              }}
                            >
                              {t('webhooks.delete', {}, locale)}
                            </SettingsRowMenuItem>
                          </SettingsRowMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <RowPager total={data.endpoints.length} page={lastPage} onPage={setPage} locale={locale} />
          <SettingsStatus>{verifyNotice}</SettingsStatus>
          {verifyError && (
            <p role="alert" className="type-body font-medium">
              {t(`webhooks.${verifyError}`, {}, locale)}
            </p>
          )}
          {deleteError && (
            <p role="alert" className="type-body font-medium">
              {t('webhooks.action_failed', {}, locale)}
            </p>
          )}
          <TypedConfirmDialog
            open={!!deleting}
            onOpenChange={(open) => {
              if (!open) setDeleting(null)
            }}
            objectName={deleting?.url ?? ''}
            title={t('webhooks.delete_title', { url: deleting?.url ?? '' }, locale)}
            confirmLabel={t('webhooks.delete_confirm', { url: deleting?.url ?? '' }, locale)}
            description={t('webhooks.delete_description', {}, locale)}
            locale={locale}
            onConfirm={remove}
          />
        </>
      ) : (
        <Inspector
          org={org}
          endpoints={data.endpoints}
          selectedId={selectedId}
          form={registerForm(false)}
          locale={locale}
          href={queryHref}
        />
      )}
      <div className="webhook-actions">
        {cursor && (
          <Button variant="outline" onClick={() => changeQuery({ webhooks_cursor: null })}>
            {t('webhooks.first_page', {}, locale)}
          </Button>
        )}
        {data.next && (
          <Button variant="outline" onClick={() => changeQuery({ webhooks_cursor: data.next })}>
            {t('webhooks.next', {}, locale)}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Endpoints as rows with their state and last delivery; the chosen one is inspected beside them. */
function Inspector({
  org,
  endpoints,
  selectedId,
  form,
  locale,
  href
}: {
  org: string
  endpoints: Endpoint[]
  selectedId: string | null
  form: ReactNode
  locale: Locale
  href: (values: Record<string, string | null>) => string
}) {
  const changeQuery = useChangeQuery()
  const id = selectedId ?? endpoints[0]?.id
  useEffect(() => {
    if (!selectedId && endpoints[0]) changeQuery({ webhook: endpoints[0].id }, true)
  }, [selectedId, endpoints, changeQuery])
  return (
    <div className="webhook-panes">
      <div className="webhook-side">
        {!!endpoints.length && (
          <section className="webhook-endpoints-section grid gap-3" aria-labelledby="webhook-endpoints-title">
            <h2 id="webhook-endpoints-title" className="type-section">
              {t('webhooks.endpoints', {}, locale)}
            </h2>
            <ul className="webhook-rows" aria-label={t('webhooks.select_endpoint', {}, locale)}>
              {endpoints.map((endpoint) => {
                const mark = endpointMark(endpoint, locale)
                const values = { webhook: endpoint.id, delivery: null, delivery_cursor: null }
                return (
                  <li key={endpoint.id}>
                    <a
                      href={href(values)}
                      className="webhook-row current-mark"
                      aria-current={endpoint.id === id ? 'true' : undefined}
                      onClick={plainClick(() => changeQuery(values))}
                    >
                      <span className="webhook-row-url" translate="no">
                        {endpoint.url}
                      </span>
                      <span className="webhook-row-state">
                        <StatusMark state={mark.state} variant="plain" label={mark.word} locale={locale} />
                        <span className="type-small inline-flex flex-wrap gap-x-1">
                          <span>{t('webhooks.last_delivery', {}, locale)}</span>
                          <ZonedTime value={endpoint.last_delivery_at} locale={locale} />
                        </span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        <section className="webhook-register-section grid gap-3" aria-labelledby="webhook-register-title">
          <h2 id="webhook-register-title" tabIndex={-1} className="type-section">
            {t('webhooks.register', {}, locale)}
          </h2>
          <Card>
            <CardContent>{form}</CardContent>
          </Card>
        </section>
      </div>
      <section className="webhook-main" aria-labelledby="webhook-log-title">
        <h2 id="webhook-log-title" className="type-section">
          {t('webhooks.delivery_log', {}, locale)}
        </h2>
        {id ? (
          <InspectedEndpoint key={id} org={org} id={id} locale={locale} />
        ) : (
          <p className="type-text text-muted-foreground">{t('webhooks.empty_inspector', {}, locale)}</p>
        )}
      </section>
    </div>
  )
}

function InspectedEndpoint({ org, id, locale }: { org: string; id: string; locale: Locale }) {
  const search = useSearchParams()
  const changeQuery = useChangeQuery()
  const [endpoint, setEndpoint] = useState<Endpoint>()
  const [failed, setFailed] = useState<Failed>()
  const [reload, setReload] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const inFlight = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    setEndpoint(undefined)
    setFailed(undefined)
    void apiFetch('getWebhook', { org, params: { id }, signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setEndpoint(value)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(failedAt(error))
      })
    return () => controller.abort()
  }, [id, org, reload])
  async function redeliver() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage(undefined)
    try {
      await apiFetch('redeliverWebhook', { org, params: { id } })
      setMessage('redelivered')
      setRefresh((value) => value + 1)
    } catch (error) {
      setMessage(problemKey(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  if (failed)
    return (
      <SourceError
        source={t('webhooks.source_endpoint', {}, locale)}
        status={statusOf(failed)}
        at={failed.at}
        locale={locale}
        retry={
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            {t('webhooks.retry', {}, locale)}
          </Button>
        }
      />
    )
  if (!endpoint)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-6 w-2/3 rounded-full" />
        <Skeleton className="h-5 w-1/2 rounded-full" />
        <p role="status" className="sr-only">
          {t('webhooks.loading_endpoint', {}, locale)}
        </p>
      </div>
    )
  return (
    <>
      <Card>
        <CardContent className="grid min-w-0 gap-3">
          <p translate="no" className="webhook-url type-card-title">
            {endpoint.url}
          </p>
          <EndpointState endpoint={endpoint} org={org} update={setEndpoint} locale={locale} />
          <div className="webhook-actions">
            <Button onClick={() => void redeliver()} disabled={busy} aria-busy={busy}>
              {t(busy ? 'webhooks.redelivering' : 'webhooks.redeliver', {}, locale)}
            </Button>
            <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>
              {t('webhooks.refresh', {}, locale)}
            </Button>
          </div>
          <div role="status" className="type-body">
            {message && <p>{t(`webhooks.${message}`, {}, locale)}</p>}
          </div>
        </CardContent>
      </Card>
      <DeliveryLog
        org={org}
        webhookId={id}
        selected={search.get('delivery')}
        cursor={search.get('delivery_cursor')}
        refresh={refresh}
        select={(value) => changeQuery({ webhook: id, delivery: value }, true)}
        paginate={(value) => changeQuery({ delivery_cursor: value, delivery: null })}
        locale={locale}
      />
    </>
  )
}
