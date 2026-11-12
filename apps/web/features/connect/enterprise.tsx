'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { apiFetch } from './operations'
import { CopyButton } from './copy-button'
import { StepUp } from './step-up'
import { t, type Locale } from './i18n'
import { useResource } from './resource'
import { Glyph } from '../brand/glyph'
import { Failure } from './failure'
import { ReauthCancelledError } from '../step-up/flow'
import { useReauth } from '../reauth'

const ENTERPRISE_REDIRECT = 'https://vertexaisearch.cloud.google.com/oauth-redirect'

async function readMemberships(signal: AbortSignal) {
  const memberships = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await apiFetch('listMyMemberships', { query: { cursor }, signal })
    memberships.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated membership cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return memberships
}

export function Enterprise({ orgId, locale }: { orgId: string | null; locale: Locale }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const [memberships, retry] = useResource(readMemberships)
  const [selected, setSelected] = useState(orgId ?? '')
  const membership =
    memberships.kind === 'ready'
      ? (memberships.value.find((item) => item.org_id === selected) ?? memberships.value[0])
      : undefined
  return (
    <Card aria-labelledby="enterprise-title" role="region" className="overflow-visible">
      <CardContent className="grid min-w-0 gap-5">
        <div className="grid gap-1">
          <h2 id="enterprise-title" className="type-section" translate="no">
            {copy('connect.enterprise')}
          </h2>
          <p className="type-body text-muted-foreground">{copy('connect.preview')}</p>
        </div>
        <ol className="grid list-decimal gap-4 pl-6 marker:font-semibold marker:text-foreground">
          <li className="pl-1">
            <div className="grid gap-1.5">
              <p>{copy('connect.policy')}</p>
              <p className="font-semibold" translate="no">
                {copy('connect.policy_name')}
              </p>
              <p translate="no" className="[overflow-wrap:anywhere]">
                {copy('connect.policy_id')}
              </p>
              <p translate="no">{copy('connect.policy_role')}</p>
              <p>{copy('connect.egress')}</p>
              <p className="type-small flex flex-wrap items-center gap-x-5 gap-y-1">
                <a
                  className="inline-flex min-h-6 items-center font-medium underline underline-offset-3 hover:decoration-2"
                  href="https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores"
                >
                  {copy('connect.policy_source')}
                </a>
                <a
                  className="inline-flex min-h-6 items-center font-medium underline underline-offset-3 hover:decoration-2"
                  href="https://docs.cloud.google.com/organization-policy/reference/org-policy-constraints#discoveryengine.managed.disableCustomMcpServerConnector"
                >
                  {copy('connect.constraint_source')}
                </a>
                <span className="text-muted-foreground">{copy('connect.checked')}</span>
              </p>
            </div>
          </li>
          <li className="pl-1">
            <div className="grid gap-1.5">
              <p>{copy('connect.registration')}</p>
              <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold" translate="no">
                {t('connect.registration_path', {}, locale)
                  .split(' > ')
                  .map((step, index) => (
                    <li key={step} className="inline-flex items-center gap-1.5">
                      {index > 0 && <ChevronRightIcon className="size-3.5" aria-hidden="true" />}
                      {step}
                    </li>
                  ))}
              </ol>
            </div>
          </li>
          <li className="pl-1">
            <div className="grid gap-1.5">
              <p>{copy('connect.oauth_fields')}</p>
              <p className="font-semibold [overflow-wrap:anywhere]" translate="no">
                {copy('connect.redirect')}
              </p>
            </div>
          </li>
          <li className="pl-1">
            <p>{copy('connect.enable_tools')}</p>
          </li>
        </ol>
        {memberships.kind === 'loading' ? (
          <p role="status" className="type-body text-muted-foreground">
            {copy('connect.loading_organisations')}
          </p>
        ) : memberships.kind === 'error' ? (
          <Failure
            source={copy('connect.source_organisations')}
            error={memberships.error}
            at={memberships.at}
            retry={retry}
            locale={locale}
          />
        ) : memberships.value.length === 0 ? (
          <div className="grid justify-items-start gap-2">
            <p className="type-body">{copy('connect.no_org')}</p>
            <Link
              href="/new"
              className="type-body inline-flex min-h-6 items-center font-medium underline underline-offset-3 hover:decoration-2"
            >
              {copy('connect.create_org')}
            </Link>
          </div>
        ) : (
          <label className="type-body grid max-w-sm gap-2 font-medium">
            {copy('connect.organisation')}
            <select
              name="organisation"
              autoComplete="off"
              className="native-select"
              value={membership?.org_id ?? ''}
              onChange={(event) => setSelected(event.target.value)}
            >
              {memberships.value.map((item) => (
                <option key={item.org_id} value={item.org_id}>
                  {item.org_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <EnterpriseClient
          key={membership?.org_id ?? ''}
          locale={locale}
          orgId={membership?.org_id ?? null}
          mayCreate={membership ? membership.role === 'admin' || membership.role === 'owner' : undefined}
        />
      </CardContent>
    </Card>
  )
}

function EnterpriseClient({
  orgId,
  mayCreate,
  locale
}: {
  orgId: string | null
  mayCreate: boolean | undefined
  locale: Locale
}) {
  const copy = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [created, setCreated] = useState(false)
  const [client, setClient] = useState<{ client_id: string; client_secret: string }>()
  const [stepping, setStepping] = useState(false)
  const { withReauth } = useReauth()
  const mounted = useRef(true)
  const secretPanel = useRef<HTMLDivElement>(null)
  const createdStatus = useRef<HTMLParagraphElement>(null)
  const dismissed = useRef(false)
  useEffect(() => {
    mounted.current = true
    const forget = () => setClient(undefined)
    window.addEventListener('pagehide', forget)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', forget)
    }
  }, [])
  // The button that made the secret is gone: the panel takes focus, and its name is the warning that it is shown once.
  // Dismissing it removes the panel, so the line that says the client exists takes focus in turn.
  useEffect(() => {
    if (client) secretPanel.current?.focus()
    else if (dismissed.current) {
      dismissed.current = false
      createdStatus.current?.focus()
    }
  }, [client])
  const resolve = useCallback(() => {
    setStepping(false)
  }, [])
  const cancel = useCallback(() => {
    setStepping(false)
  }, [])

  async function create() {
    if (!orgId || !mayCreate || busy || created) return
    setBusy(true)
    setError(false)
    try {
      const result = await withReauth(
        (idempotencyKey) =>
          apiFetch('createOauthClient', {
            params: { org: orgId },
            org: orgId,
            idempotencyKey,
            body: {
              client_name: t('connect.targets.gemini_enterprise'),
              redirect_uris: [ENTERPRISE_REDIRECT],
              scopes: ['read', 'draft']
            }
          }),
        () => setStepping(true)
      )
      if (mounted.current) {
        setClient({ client_id: result.client_id, client_secret: result.client_secret })
        setCreated(true)
      }
    } catch (failure) {
      if (mounted.current && !(failure instanceof ReauthCancelledError)) setError(true)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      {mayCreate === undefined ? null : !mayCreate ? (
        <p className="type-body">{copy('connect.ask_admin')}</p>
      ) : !orgId ? (
        <p className="type-body">{copy('connect.no_org')}</p>
      ) : (
        <>
          {client ? (
            <div
              ref={secretPanel}
              role="group"
              aria-labelledby="enterprise-secret-once"
              tabIndex={-1}
              className="grid min-w-0 gap-3 rounded-md bg-raised p-4"
            >
              <p id="enterprise-secret-once" className="type-card-title">
                {copy('connect.secret_once')}
              </p>
              <h3 className="type-body font-semibold">{copy('connect.client_id')}</h3>
              <CodeBlock>
                <CodeBlockContent wrap translate="no">
                  {client.client_id}
                </CodeBlockContent>
              </CodeBlock>
              <h3 className="type-body font-semibold">{copy('connect.client_secret')}</h3>
              <CodeBlock>
                <CodeBlockContent wrap translate="no">
                  {client.client_secret}
                </CodeBlockContent>
              </CodeBlock>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton value={client.client_secret} label="copy_secret" locale={locale} />
                <Button
                  variant="outline"
                  className="h-auto min-h-9 max-w-full py-2 text-left whitespace-normal"
                  onClick={() => {
                    dismissed.current = true
                    setClient(undefined)
                  }}
                >
                  {copy('connect.dismiss_secret')}
                </Button>
              </div>
            </div>
          ) : created ? (
            <p ref={createdStatus} tabIndex={-1} role="status" className="type-body flex items-center gap-2">
              <Glyph state="fresh" />
              <span>{copy('connect.client_created')}</span>
            </p>
          ) : (
            <Button
              className="h-auto min-h-9 max-w-full justify-self-start py-2 text-left whitespace-normal"
              translate="no"
              disabled={busy}
              onClick={() => void create()}
            >
              {copy(busy ? 'connect.creating' : 'connect.create_client')}
            </Button>
          )}
          {stepping && <StepUp resolve={resolve} cancel={cancel} />}
          {error && (
            <p role="alert" className="type-body flex items-start gap-2 font-medium">
              <Glyph state="error" className="mt-1.5" />
              <span>{copy('connect.create_error')}</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
