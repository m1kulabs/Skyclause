'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonVariants } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { Skeleton } from '#ui/skeleton'
import { cn } from '#lib/utils'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { StatusMark } from '../brand/status-mark'
import { SourceError } from '../data-components/states'
import { SettingsAside, SettingsSummaryLine } from '../settings/parts'
import { ApiProblem } from '../../lib/api-fetch'
import { apiFetch, type Endpoint, type WebhookProject } from './operations'
import { RegisterForm, problemKey } from './form'
import { EndpointState, Secret, endpointMark } from './endpoint'
import { DeliveryLog, ZonedTime } from './deliveries'
import { t } from './catalogue'
import './webhooks.css'

function useChangeQuery() {
  const pathname = usePathname()
  const router = useRouter()
  const search = useSearchParams()
  return useCallback(
    (values: Record<string, string | null>, replace = false) => {
      const next = new URLSearchParams(search.toString())
      for (const [key, value] of Object.entries(values)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      const query = next.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [pathname, router, search]
  )
}

type Failed = { error: unknown; at: string }
const failedAt = (error: unknown): Failed => ({ error, at: new Date().toISOString() })
const statusOf = (failure: Failed) => (failure.error instanceof ApiProblem ? failure.error.status : null)

export function Webhooks({ org, settings = false }: { org: string; settings?: boolean }) {
  const search = useSearchParams()
  const changeQuery = useChangeQuery()
  const selectedId = search.get('webhook')
  const cursor = search.get('webhooks_cursor')
  const [data, setData] = useState<{ endpoints: Endpoint[]; projects: WebhookProject[]; next: string | null }>()
  const [failed, setFailed] = useState<Failed>()
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<Endpoint | null>(null)
  const [deleteError, setDeleteError] = useState(false)
  const [deleted, setDeleted] = useState<string | null>(null)

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

  function created(endpoint: Endpoint, value: string) {
    setSecret({ id: endpoint.id, value })
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

  if (failed)
    return (
      <div className="webhooks">
        <SourceError
          source={t('webhooks.source_list')}
          status={statusOf(failed)}
          at={failed.at}
          retry={
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
              {t('webhooks.retry')}
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
          {t('webhooks.loading')}
        </p>
      </div>
    )
  const form = (
    <RegisterForm
      org={org}
      projects={data.projects}
      onCreated={created}
      onCancel={settings ? () => setFormOpen(false) : undefined}
    />
  )

  return (
    <div className="webhooks" data-webhooks>
      {secret && <Secret key={secret.value} value={secret.value} dismiss={() => setSecret(null)} />}
      {deleted && (
        <p role="status" className="type-body" translate="no">
          {t('webhooks.deleted', { url: deleted })}
        </p>
      )}
      {settings ? (
        <>
          <SettingsAside>
            <SettingsSummaryLine label={t('webhooks.endpoints')}>
              <span data-numeric>{data.endpoints.length}</span>
            </SettingsSummaryLine>
            <SettingsSummaryLine label={t('webhooks.state_verified')}>
              <span data-numeric>
                {data.endpoints.filter((endpoint) => endpoint.verified_at && !endpoint.disabled_at).length}
              </span>
            </SettingsSummaryLine>
          </SettingsAside>
          <div>
            <Button onClick={() => setFormOpen(true)}>{t('webhooks.add')}</Button>
          </div>
          {formOpen && (
            <Card>
              <CardContent>{form}</CardContent>
            </Card>
          )}
          {!data.endpoints.length && <p className="type-body text-muted-foreground">{t('webhooks.empty')}</p>}
          <ul className="webhook-endpoints" aria-label={t('webhooks.endpoints')}>
            {data.endpoints.map((endpoint) => (
              <li key={endpoint.id}>
                <p translate="no" className="webhook-url type-card-title">
                  {endpoint.url}
                </p>
                <p translate="no" className="type-small text-muted-foreground">
                  {t('webhooks.all_events', { events: endpoint.events.join(', ') })}
                </p>
                <p className="type-small text-muted-foreground">
                  {t('webhooks.project_list', {
                    projects: endpoint.project_ids.length
                      ? endpoint.project_ids
                          .map(
                            (id) =>
                              data.projects.find((project) => project.id === id)?.name ??
                              t('webhooks.project_id', { id })
                          )
                          .join(', ')
                      : t('webhooks.all_projects')
                  })}
                </p>
                <EndpointState endpoint={endpoint} org={org} update={updated} />
                <dl className="webhook-last">
                  <dt>{t('webhooks.last_delivery')}</dt>
                  <dd>
                    <ZonedTime value={endpoint.last_delivery_at} />
                  </dd>
                </dl>
                <div className="webhook-actions">
                  <a
                    className={cn(buttonVariants({ variant: 'outline' }))}
                    href={`/developers/webhooks?webhook=${encodeURIComponent(endpoint.id)}`}
                  >
                    {t('webhooks.open')}
                  </a>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleting(endpoint)
                      setDeleteError(false)
                    }}
                  >
                    {t('webhooks.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {deleteError && (
            <p role="alert" className="type-body font-medium">
              {t('webhooks.action_failed')}
            </p>
          )}
          <TypedConfirmDialog
            open={!!deleting}
            onOpenChange={(open) => {
              if (!open) setDeleting(null)
            }}
            objectName={deleting?.url ?? ''}
            title={t('webhooks.delete_title', { url: deleting?.url ?? '' })}
            confirmLabel={t('webhooks.delete_confirm', { url: deleting?.url ?? '' })}
            description={t('webhooks.delete_description')}
            onConfirm={remove}
          />
        </>
      ) : (
        <Inspector org={org} endpoints={data.endpoints} selectedId={selectedId} form={form} />
      )}
      <div className="webhook-actions">
        {cursor && (
          <Button variant="outline" onClick={() => changeQuery({ webhooks_cursor: null })}>
            {t('webhooks.previous')}
          </Button>
        )}
        {data.next && (
          <Button variant="outline" onClick={() => changeQuery({ webhooks_cursor: data.next })}>
            {t('webhooks.next')}
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
  form
}: {
  org: string
  endpoints: Endpoint[]
  selectedId: string | null
  form: React.ReactNode
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
              {t('webhooks.endpoints')}
            </h2>
            <ul className="webhook-rows" aria-label={t('webhooks.select_endpoint')}>
              {endpoints.map((endpoint) => {
                const mark = endpointMark(endpoint)
                return (
                  <li key={endpoint.id}>
                    <button
                      type="button"
                      className="webhook-row current-mark"
                      aria-current={endpoint.id === id ? 'true' : undefined}
                      onClick={() => changeQuery({ webhook: endpoint.id, delivery: null, delivery_cursor: null })}
                    >
                      <span className="webhook-row-url" translate="no">
                        {endpoint.url}
                      </span>
                      <span className="webhook-row-state">
                        <StatusMark state={mark.state} variant="plain" label={mark.word} />
                        <span className="type-small">
                          {t('webhooks.last_delivery')} <ZonedTime value={endpoint.last_delivery_at} />
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        <section className="webhook-register-section grid gap-3" aria-labelledby="webhook-register-title">
          <h2 id="webhook-register-title" className="type-section">
            {t('webhooks.register')}
          </h2>
          <Card>
            <CardContent>{form}</CardContent>
          </Card>
        </section>
      </div>
      <section className="webhook-main" aria-labelledby="webhook-log-title">
        <h2 id="webhook-log-title" className="type-section">
          {t('webhooks.delivery_log')}
        </h2>
        {id ? (
          <InspectedEndpoint key={id} org={org} id={id} />
        ) : (
          <p className="type-text text-muted-foreground">{t('webhooks.empty_inspector')}</p>
        )}
      </section>
    </div>
  )
}

function InspectedEndpoint({ org, id }: { org: string; id: string }) {
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
        source={t('webhooks.source_endpoint')}
        status={statusOf(failed)}
        at={failed.at}
        retry={
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            {t('webhooks.retry')}
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
          {t('webhooks.loading_endpoint')}
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
          <EndpointState endpoint={endpoint} org={org} update={setEndpoint} />
          <div className="webhook-actions">
            <Button onClick={() => void redeliver()} disabled={busy} aria-busy={busy}>
              {t(busy ? 'webhooks.redelivering' : 'webhooks.redeliver')}
            </Button>
            <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>
              {t('webhooks.refresh')}
            </Button>
          </div>
          <div role="status" className="type-body">
            {message && <p>{t(`webhooks.${message}`)}</p>}
          </div>
        </CardContent>
      </Card>
      <DeliveryLog
        org={org}
        webhookId={id}
        selected={search.get('delivery')}
        cursor={search.get('delivery_cursor')}
        refresh={refresh}
        select={(value) => changeQuery({ webhook: id, delivery: value })}
        paginate={(value) => changeQuery({ delivery_cursor: value, delivery: null })}
      />
    </>
  )
}
