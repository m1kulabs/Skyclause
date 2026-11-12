'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '@skyclause/i18n/format'
import { ChevronRightIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { apiFetch } from './operations'
import { CopyButton } from './copy-button'
import { StepUp } from './step-up'
import { t } from './i18n'
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

export function Enterprise({ orgId }: { orgId: string | null }) {
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
            {t('connect.enterprise')}
          </h2>
          <p className="type-body text-muted-foreground">{t('connect.preview')}</p>
        </div>
        <ol className="grid list-decimal gap-4 pl-6 marker:font-semibold marker:text-foreground">
          <li className="pl-1">
            <div className="grid gap-1.5">
              <p>{t('connect.policy')}</p>
              <p className="font-semibold" translate="no">
                {t('connect.policy_name')}
              </p>
              <p translate="no" className="[overflow-wrap:anywhere]">
                {t('connect.policy_id')}
              </p>
              <p translate="no">{t('connect.policy_role')}</p>
              <p>{t('connect.egress')}</p>
              <p className="type-small flex flex-wrap items-center gap-x-5 gap-y-1">
                <a
                  className="inline-flex min-h-6 items-center font-medium underline underline-offset-3"
                  href="https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores"
                >
                  {t('connect.policy_source')}
                </a>
                <a
                  className="inline-flex min-h-6 items-center font-medium underline underline-offset-3"
                  href="https://docs.cloud.google.com/organization-policy/reference/org-policy-constraints#discoveryengine.managed.disableCustomMcpServerConnector"
                >
                  {t('connect.constraint_source')}
                </a>
                <span className="text-muted-foreground">
                  {t('connect.checked', { date: formatDate('2026-11-06T00:00:00Z', 'en') })}
                </span>
              </p>
            </div>
          </li>
          <li className="pl-1">
            <div className="grid gap-1.5">
              <p>{t('connect.registration')}</p>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold" translate="no">
                {t('connect.registration_path')
                  .split(' > ')
                  .map((step, index) => (
                    <span key={step} className="inline-flex items-center gap-1.5">
                      {index > 0 && <ChevronRightIcon className="size-3.5" aria-hidden="true" />}
                      {step}
                    </span>
                  ))}
              </p>
            </div>
          </li>
          <li className="pl-1">
            <div className="grid gap-1.5">
              <p>{t('connect.oauth_fields')}</p>
              <p className="font-semibold [overflow-wrap:anywhere]" translate="no">
                {t('connect.redirect')}
              </p>
            </div>
          </li>
          <li className="pl-1">
            <p>{t('connect.enable_tools')}</p>
          </li>
        </ol>
        {memberships.kind === 'loading' ? (
          <p role="status" className="type-body text-muted-foreground">
            {t('connect.loading_organisations')}
          </p>
        ) : memberships.kind === 'error' ? (
          <Failure
            source={t('connect.source_organisations')}
            error={memberships.error}
            at={memberships.at}
            retry={retry}
          />
        ) : memberships.value.length === 0 ? (
          <div className="grid justify-items-start gap-2">
            <p className="type-body">{t('connect.no_org')}</p>
            <Link
              href="/new"
              className="type-body inline-flex min-h-6 items-center font-medium underline underline-offset-3"
            >
              {t('connect.create_org')}
            </Link>
          </div>
        ) : (
          <label className="type-body grid max-w-sm gap-2 font-medium">
            {t('connect.organisation')}
            <select
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
          orgId={membership?.org_id ?? null}
          mayCreate={membership ? membership.role === 'admin' || membership.role === 'owner' : undefined}
        />
      </CardContent>
    </Card>
  )
}

function EnterpriseClient({ orgId, mayCreate }: { orgId: string | null; mayCreate: boolean | undefined }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [created, setCreated] = useState(false)
  const [client, setClient] = useState<{ client_id: string; client_secret: string }>()
  const [stepping, setStepping] = useState(false)
  const { withReauth } = useReauth()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const forget = () => setClient(undefined)
    window.addEventListener('pagehide', forget)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', forget)
    }
  }, [])
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
        <p className="type-body">{t('connect.ask_admin')}</p>
      ) : !orgId ? (
        <p className="type-body">{t('connect.no_org')}</p>
      ) : (
        <>
          {client ? (
            <div className="grid min-w-0 gap-3 rounded-md bg-raised p-4">
              <p className="type-card-title">{t('connect.secret_once')}</p>
              <h3 className="type-body font-semibold">{t('connect.client_id')}</h3>
              <CodeBlock>
                <CodeBlockContent wrap translate="no">
                  {client.client_id}
                </CodeBlockContent>
              </CodeBlock>
              <h3 className="type-body font-semibold">{t('connect.client_secret')}</h3>
              <CodeBlock>
                <CodeBlockContent wrap translate="no">
                  {client.client_secret}
                </CodeBlockContent>
              </CodeBlock>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton value={client.client_secret} label="copy_secret" />
                <Button
                  variant="outline"
                  className="h-auto min-h-9 max-w-full py-2 text-left whitespace-normal"
                  onClick={() => setClient(undefined)}
                >
                  {t('connect.dismiss_secret')}
                </Button>
              </div>
            </div>
          ) : created ? (
            <p role="status" className="type-body flex items-center gap-2">
              <Glyph state="fresh" />
              <span>{t('connect.client_created')}</span>
            </p>
          ) : (
            <Button
              className="h-auto min-h-9 max-w-full justify-self-start py-2 text-left whitespace-normal"
              translate="no"
              disabled={busy}
              onClick={() => void create()}
            >
              {t(busy ? 'connect.creating' : 'connect.create_client')}
            </Button>
          )}
          {stepping && (
            <div aria-label={t('connect.reauth')}>
              <StepUp resolve={resolve} cancel={cancel} />
            </div>
          )}
          {error && (
            <p role="alert" className="type-body flex items-start gap-2 font-medium">
              <Glyph state="error" className="mt-1.5" />
              <span>{t('connect.create_error')}</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
