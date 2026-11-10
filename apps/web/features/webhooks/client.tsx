'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '#ui/button'
import { Field, FieldLabel } from '#ui/field'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '#ui/resizable'
import { Empty, EmptyHeader, EmptyDescription } from '#ui/empty'
import { TypedConfirmDialog } from '../settings/set-7/confirm-dialog'
import { useIsMobile } from '../../components/hooks/use-mobile'
import { apiFetch, type Endpoint, type WebhookProject } from './operations'
import { RegisterForm, problemKey } from './form'
import { EndpointState, Secret } from './endpoint'
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

export function Webhooks({ org, settings = false }: { org: string; settings?: boolean }) {
  const search = useSearchParams()
  const changeQuery = useChangeQuery()
  const selectedId = search.get('webhook')
  const cursor = search.get('webhooks_cursor')
  const [data, setData] = useState<{ endpoints: Endpoint[]; projects: WebhookProject[]; next: string | null }>()
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<Endpoint | null>(null)
  const [deleteError, setDeleteError] = useState(false)

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
    setFailed(false)
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
    void load().catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => controller.abort()
  }, [org, cursor, reload])

  function created(endpoint: Endpoint, value: string) {
    setSecret({ id: endpoint.id, value })
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
        <p role="alert">{t('webhooks.load_failed')}</p>
        <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
          {t('webhooks.retry')}
        </Button>
      </div>
    )
  if (!data) return <p role="status">{t('webhooks.loading')}</p>
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
      {settings ? (
        <>
          <Button onClick={() => setFormOpen(true)}>{t('webhooks.add')}</Button>
          {formOpen && form}
          {!data.endpoints.length && (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>{t('webhooks.empty')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ul className="webhook-endpoints" aria-label={t('webhooks.endpoints')}>
            {data.endpoints.map((endpoint) => (
              <li key={endpoint.id}>
                <p translate="no" className="webhook-url">
                  {endpoint.url}
                </p>
                <p translate="no">{t('webhooks.all_events', { events: endpoint.events.join(', ') })}</p>
                <p>
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
                <dl>
                  <dt>{t('webhooks.last_delivery')}</dt>
                  <dd>
                    <ZonedTime value={endpoint.last_delivery_at} />
                  </dd>
                </dl>
                <div className="webhook-actions">
                  <a href={`/developers/webhooks?webhook=${encodeURIComponent(endpoint.id)}`}>{t('webhooks.open')}</a>
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
          {deleteError && <p role="alert">{t('webhooks.action_failed')}</p>}
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
  const mobile = useIsMobile()
  const changeQuery = useChangeQuery()
  const id = selectedId ?? endpoints[0]?.id
  useEffect(() => {
    if (!selectedId && endpoints[0]) changeQuery({ webhook: endpoints[0].id }, true)
  }, [selectedId, endpoints, changeQuery])
  return (
    <ResizablePanelGroup orientation={mobile ? 'vertical' : 'horizontal'} className="webhook-panes">
      <ResizablePanel defaultSize="43%" minSize={mobile ? '0%' : '25%'} className="webhook-register-pane">
        <h2>{t('webhooks.register')}</h2>
        {form}
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t('webhooks.resize')} />
      <ResizablePanel defaultSize="57%" minSize={mobile ? '0%' : '25%'} className="webhook-delivery-pane">
        <h2>{t('webhooks.delivery_log')}</h2>
        {!!endpoints.length && (
          <Field>
            <FieldLabel htmlFor="webhook-selection">{t('webhooks.select_endpoint')}</FieldLabel>
            <select
              id="webhook-selection"
              name="webhook-selection"
              translate="no"
              value={id ?? ''}
              onChange={(event) => changeQuery({ webhook: event.target.value, delivery: null, delivery_cursor: null })}
            >
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.url}
                </option>
              ))}
            </select>
          </Field>
        )}
        {id ? (
          <InspectedEndpoint key={id} org={org} id={id} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyDescription>{t('webhooks.empty_inspector')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function InspectedEndpoint({ org, id }: { org: string; id: string }) {
  const search = useSearchParams()
  const changeQuery = useChangeQuery()
  const [endpoint, setEndpoint] = useState<Endpoint>()
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const inFlight = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    setEndpoint(undefined)
    setFailed(false)
    void apiFetch('getWebhook', { org, params: { id }, signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setEndpoint(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
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
      <div>
        <p role="alert">{t('webhooks.endpoint_failed')}</p>
        <Button onClick={() => setReload((value) => value + 1)}>{t('webhooks.retry')}</Button>
      </div>
    )
  if (!endpoint) return <p role="status">{t('webhooks.loading_endpoint')}</p>
  return (
    <>
      <p translate="no" className="webhook-url">
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
      <div role="status">{message && <p>{t(`webhooks.${message}`)}</p>}</div>
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
