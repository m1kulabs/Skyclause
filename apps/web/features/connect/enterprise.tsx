'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { apiFetch } from './operations'
import { createWithStepUp } from './model'
import { CopyButton } from './copy-button'
import { StepUp } from './step-up'
import { t } from './i18n'
import { useResource } from './resource'

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
    <>
      {memberships.kind === 'loading' ? (
        <p role="status">{t('connect.loading_organisations')}</p>
      ) : memberships.kind === 'error' ? (
        <div role="alert">
          <p>{t('connect.organisations_error')}</p>
          <Button variant="outline" onClick={retry}>
            {t('connect.retry')}
          </Button>
        </div>
      ) : memberships.value.length === 0 ? (
        <div>
          <p>{t('connect.no_org')}</p>
          <Link href="/new">{t('connect.create_org')}</Link>
        </div>
      ) : (
        <label className="connect-org">
          {t('connect.organisation')}
          <select value={membership?.org_id ?? ''} onChange={(event) => setSelected(event.target.value)}>
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
    </>
  )
}

function EnterpriseClient({ orgId, mayCreate }: { orgId: string | null; mayCreate: boolean | undefined }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [created, setCreated] = useState(false)
  const [client, setClient] = useState<{ client_id: string; client_secret: string }>()
  const [stepping, setStepping] = useState(false)
  const creationKey = useRef<string | undefined>(undefined)
  const pending = useRef<{ resolve: () => void; reject: () => void } | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const forget = () => setClient(undefined)
    window.addEventListener('pagehide', forget)
    return () => {
      mounted.current = false
      pending.current?.reject()
      window.removeEventListener('pagehide', forget)
    }
  }, [])
  const resolve = useCallback(() => {
    setStepping(false)
    pending.current?.resolve()
    pending.current = undefined
  }, [])
  const cancel = useCallback(() => {
    setStepping(false)
    pending.current?.reject()
    pending.current = undefined
  }, [])

  async function create() {
    if (!orgId || !mayCreate || busy || created) return
    setBusy(true)
    setError(false)
    creationKey.current ??= crypto.randomUUID()
    try {
      const result = await createWithStepUp(
        () =>
          apiFetch('createOauthClient', {
            params: { org: orgId },
            org: orgId,
            idempotencyKey: creationKey.current,
            body: {
              client_name: t('connect.targets.gemini_enterprise'),
              redirect_uris: [ENTERPRISE_REDIRECT],
              scopes: ['read', 'draft']
            }
          }),
        () =>
          new Promise<void>((accept, reject) => {
            pending.current = { resolve: accept, reject: () => reject(new Error('Step-up cancelled')) }
            setStepping(true)
          })
      )
      if (mounted.current) {
        setClient({ client_id: result.client_id, client_secret: result.client_secret })
        setCreated(true)
      }
    } catch {
      if (mounted.current) setError(true)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <section className="connect-section" aria-labelledby="enterprise-title">
      <h2 id="enterprise-title" translate="no">
        {t('connect.enterprise')}
      </h2>
      <p>{t('connect.preview')}</p>
      <ol className="connect-steps">
        <li>
          <p>{t('connect.policy')}</p>
          <p translate="no">{t('connect.policy_name')}</p>
          <code translate="no">{t('connect.policy_id')}</code>
          <p>
            <code translate="no">{t('connect.policy_role')}</code>
          </p>
          <p>{t('connect.egress')}</p>
          <p className="connect-sources">
            <a href="https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores">
              {t('connect.policy_source')}
            </a>
            <a href="https://docs.cloud.google.com/organization-policy/reference/org-policy-constraints#discoveryengine.managed.disableCustomMcpServerConnector">
              {t('connect.constraint_source')}
            </a>
            <span>{t('connect.checked', { date: formatDate('2026-11-06T00:00:00Z', 'en') })}</span>
          </p>
        </li>
        <li>
          <p>{t('connect.registration')}</p>
          <p translate="no">{t('connect.registration_path')}</p>
        </li>
        <li>
          <p>{t('connect.oauth_fields')}</p>
          <code translate="no">{t('connect.redirect')}</code>
        </li>
        <li>
          <p>{t('connect.enable_tools')}</p>
        </li>
      </ol>
      {mayCreate === undefined ? null : !mayCreate ? (
        <p>{t('connect.ask_admin')}</p>
      ) : !orgId ? (
        <p>{t('connect.no_org')}</p>
      ) : (
        <>
          {client ? (
            <div className="connect-secret">
              <p>{t('connect.secret_once')}</p>
              <h3>{t('connect.client_id')}</h3>
              <CodeBlock>
                <CodeBlockContent wrap translate="no">
                  {client.client_id}
                </CodeBlockContent>
              </CodeBlock>
              <h3>{t('connect.client_secret')}</h3>
              <CodeBlock>
                <CodeBlockContent wrap translate="no">
                  {client.client_secret}
                </CodeBlockContent>
              </CodeBlock>
              <CopyButton value={client.client_secret} label="copy_secret" />
              <Button variant="outline" onClick={() => setClient(undefined)}>
                {t('connect.dismiss_secret')}
              </Button>
            </div>
          ) : created ? (
            <p role="status">{t('connect.client_created')}</p>
          ) : (
            <Button variant="outline" translate="no" disabled={busy} onClick={() => void create()}>
              {t(busy ? 'connect.creating' : 'connect.create_client')}
            </Button>
          )}
          {stepping && (
            <div aria-label={t('connect.reauth')}>
              <StepUp resolve={resolve} cancel={cancel} />
            </div>
          )}
          {error && <p role="alert">{t('connect.create_error')}</p>}
        </>
      )}
    </section>
  )
}
