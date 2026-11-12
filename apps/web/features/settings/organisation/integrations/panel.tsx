'use client'

import '../../../oauth/catalogue'
import '../../catalogue'
import { t } from '@skyclause/i18n'
import { formatDate, formatList } from '@skyclause/i18n/format'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '#ui/button'
import { Checkbox } from '#ui/checkbox'
import { Input } from '#ui/input'
import { FieldGroup, FieldLegend, FieldSet } from '#ui/field'
import { Skeleton } from '#ui/skeleton'
import { ConfirmDialog } from '../../set-7'
import { focusHeadingWhenFree } from '../../focus'
import { RowPager, pageOf } from '../../project/row-pager'
import {
  SettingsAside,
  SettingsField,
  SettingsError,
  SettingsItem,
  SettingsList,
  SettingsLoading,
  SettingsPart,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine
} from '../../parts'

type Scope = 'read' | 'draft'
type Client = {
  id: string
  client_id: string
  client_name: string
  redirect_uris: string[]
  scopes: Scope[]
  created_at: string
}
type Grant = {
  id: string
  client_id: string
  org_id: string
  resource: 'api' | 'mcp'
  project_ids: string[] | 'all'
  scopes: Scope[]
  share_link_id: string | null
  revoked_at: string | null
  account_id: string
  client_name: string
  created_at: string
}
type Page<T> = { data: T[]; next_cursor: string | null }
type CreatedClient = Client & {
  client_secret: string
  redirect_uri: string
  authorization_url: string
  token_url: string
}
type ConfirmTarget = { kind: 'client' | 'grant'; id: string; name: string }

const NAME_LIMIT = 120

/** A page number kept inside the list after rows were removed. */
const lastPage = (total: number, page: number) => Math.min(page, Math.max(0, Math.ceil(total / 50) - 1))

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN
const apiUrl = (path: string) => (apiOrigin ? new URL(path, apiOrigin).toString() : path)
const apiCredentials = apiOrigin ? ('include' as const) : ('same-origin' as const)

/** Every row of a list: the API's pages (100 each) are followed to the end, and the panel pages through them. */
async function fetchAll<T>(url: string): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const response = await fetch(apiUrl(cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url), {
      credentials: apiCredentials
    })
    if (!response.ok) throw Object.assign(new Error('load'), { status: response.status })
    const page = (await response.json()) as Page<T>
    rows.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated OAuth cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return rows
}

export default function Panel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) =>
    t(`settings.integrations.${key}`, vars, locale)
  const [clients, setClients] = useState<Client[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['read'])
  const [secret, setSecret] = useState<CreatedClient | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [nameError, setNameError] = useState(false)
  const [scopeError, setScopeError] = useState(false)
  const [clientPage, setClientPage] = useState(0)
  const [grantPage, setGrantPage] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const firstScopeRef = useRef<HTMLButtonElement>(null)
  const [target, setTarget] = useState<ConfirmTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [error, setError] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setFailure(null)
    try {
      const root = `/api/orgs/${encodeURIComponent(org)}`
      const [nextClients, nextGrants] = await Promise.all([
        fetchAll<Client>(`${root}/oauth-clients?limit=100`),
        fetchAll<Grant>(`${root}/oauth-grants?limit=100`)
      ])
      setClients(nextClients)
      setGrants(nextGrants)
    } catch (cause) {
      setFailure({ error: cause, at: new Date().toISOString() })
    } finally {
      setLoading(false)
    }
  }, [org])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The copy result is announced, then clears itself so the next copy is announced again.
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), 4000)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) {
      setNameError(true)
      nameRef.current?.focus()
      return
    }
    if (scopes.length === 0) {
      setScopeError(true)
      firstScopeRef.current?.focus()
      return
    }
    setSaving(true)
    setError(false)
    setNotice('')
    try {
      const response = await fetch(apiUrl(`/api/orgs/${encodeURIComponent(org)}/oauth-clients`), {
        method: 'POST',
        credentials: apiCredentials,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          client_name: name.trim(),
          redirect_uris: [t('oauth.settings.geminiRedirect', {}, locale)],
          scopes
        })
      })
      if (!response.ok) throw new Error('create')
      const created = (await response.json()) as CreatedClient
      setSecret(created)
      setNotice(copy('created', { name: created.client_name }))
      setName('')
      await refresh()
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  async function removeTarget() {
    if (!target) return
    const path = target.kind === 'client' ? 'oauth-clients' : 'oauth-grants'
    const response = await fetch(
      apiUrl(`/api/orgs/${encodeURIComponent(org)}/${path}/${encodeURIComponent(target.id)}`),
      {
        method: 'DELETE',
        credentials: apiCredentials
      }
    )
    if (!response.ok) throw new Error('revoke')
    setNotice(copy(target.kind === 'client' ? 'deleted' : 'revoked', { name: target.name }))
    setTarget(null)
    await refresh()
    // The button that held focus is gone: the list's heading takes it, once the dialog lets go of the page.
    focusHeadingWhenFree(target.kind === 'client' ? 'oauth-clients-heading' : 'oauth-grants-heading')
  }

  async function copySecret() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.client_secret)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const date = (value: string) => formatDate(value, locale)
  const scopeLabel = (scope: Scope) => t(`oauth.settings.${scope}`, {}, locale)
  const scopeList = (values: Scope[]) => formatList(values.map(scopeLabel), locale)
  const projectLabel = (value: Grant['project_ids']) =>
    value === 'all'
      ? t('oauth.settings.allProjects', {}, locale)
      : t(
          value.length === 1 ? 'oauth.settings.projectCount_one' : 'oauth.settings.projectCount',
          { count: value.length },
          locale
        )
  const liveGrants = grants.filter((grant) => !grant.revoked_at)

  return (
    <div className="min-w-0" aria-busy={loading}>
      {!loading && !failure && (
        <SettingsAside>
          <SettingsSummaryLine label={t('oauth.settings.clients', {}, locale)}>
            {copy('summaryClients', { count: clients.length })}
          </SettingsSummaryLine>
          <SettingsSummaryLine label={t('oauth.settings.grants', {}, locale)}>
            {copy('summaryGrants', { count: liveGrants.length })}
          </SettingsSummaryLine>
        </SettingsAside>
      )}
      <SettingsParts>
        <SettingsPart title={t('oauth.settings.clients', {}, locale)} id="oauth-clients-heading">
          <form onSubmit={create} className="min-w-0" noValidate>
            <FieldGroup>
              <SettingsField
                label={t('oauth.settings.clientName', {}, locale)}
                hint={copy('nameHint', {
                  limit: NAME_LIMIT,
                  redirect: t('oauth.settings.geminiRedirect', {}, locale)
                })}
                error={
                  error
                    ? t('oauth.settings.saveFailed', {}, locale)
                    : nameError
                      ? t('oauth.settings.nameRequired', {}, locale)
                      : undefined
                }
              >
                {(aria) => (
                  <Input
                    {...aria}
                    ref={nameRef}
                    name="client_name"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setNameError(false)
                    }}
                    placeholder={t('oauth.settings.namePlaceholder', {}, locale)}
                    maxLength={NAME_LIMIT}
                    disabled={saving}
                  />
                )}
              </SettingsField>
              <FieldSet className="m-0 grid min-w-0 gap-1 border-0 p-0" data-invalid={scopeError ? true : undefined}>
                <FieldLegend variant="label" className="mb-1 p-0 leading-5">
                  {t('oauth.settings.scopes', {}, locale)}
                </FieldLegend>
                {(['read', 'draft'] as const).map((scope, index) => (
                  <label key={scope} className="flex min-h-9 items-center gap-3 text-[14px]">
                    <Checkbox
                      ref={index === 0 ? firstScopeRef : undefined}
                      aria-invalid={scopeError ? true : undefined}
                      name="scopes"
                      value={scope}
                      aria-label={
                        scope === 'read'
                          ? t('oauth.settings.scopeRead', {}, locale)
                          : t('oauth.settings.scopeDraft', {}, locale)
                      }
                      checked={scopes.includes(scope)}
                      onCheckedChange={() => {
                        setScopeError(false)
                        setScopes((current) =>
                          current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
                        )
                      }}
                    />
                    {scope === 'read'
                      ? t('oauth.settings.scopeRead', {}, locale)
                      : t('oauth.settings.scopeDraft', {}, locale)}
                  </label>
                ))}
                {scopeError ? <SettingsError>{t('oauth.settings.scopeRequired', {}, locale)}</SettingsError> : null}
              </FieldSet>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  className="h-auto min-h-9 max-w-full shrink py-1.5 whitespace-normal"
                  disabled={saving}
                  aria-busy={saving}
                >
                  {t('oauth.settings.create', {}, locale)}
                </Button>
                {notice ? <SettingsStatus>{notice}</SettingsStatus> : null}
              </div>
            </FieldGroup>
          </form>

          {failure ? (
            <SettingsReadError
              source={copy('source')}
              error={failure.error}
              at={failure.at}
              locale={locale}
              onRetry={() => void refresh()}
            />
          ) : loading ? (
            <SettingsLoading locale={locale}>
              <Skeleton className="h-16 w-full rounded-md" />
            </SettingsLoading>
          ) : clients.length ? (
            <SettingsList aria-label={t('oauth.settings.clients', {}, locale)}>
              {pageOf(clients, lastPage(clients.length, clientPage)).map((client) => (
                <SettingsItem key={client.id}>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="type-body font-medium [overflow-wrap:anywhere]">{client.client_name}</span>
                    <span className="type-small flex flex-wrap gap-x-4 text-muted-foreground">
                      <span>{scopeList(client.scopes)}</span>
                      <time dateTime={client.created_at}>{copy('createdOn', { date: date(client.created_at) })}</time>
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={copy('deleteNamed', { name: client.client_name })}
                    onClick={() => setTarget({ kind: 'client', id: client.id, name: client.client_name })}
                  >
                    {t('oauth.settings.deleteClient', {}, locale)}
                  </Button>
                </SettingsItem>
              ))}
            </SettingsList>
          ) : (
            <p className="type-body text-muted-foreground">{t('oauth.settings.emptyClients', {}, locale)}</p>
          )}
          <RowPager
            total={clients.length}
            page={lastPage(clients.length, clientPage)}
            onPage={setClientPage}
            locale={locale}
          />
        </SettingsPart>

        {secret && (
          <SettingsPart title={t('oauth.settings.secretTitle', {}, locale)} id="oauth-secret-heading">
            <div className="grid min-w-0 gap-4 rounded-md bg-raised p-4">
              <p className="type-body text-muted-foreground">{t('oauth.settings.secretDescription', {}, locale)}</p>
              <dl className="m-0 grid min-w-0 gap-3">
                {(
                  [
                    ['clientId', secret.client_id],
                    ['redirect', secret.redirect_uri],
                    ['authorizationUrl', secret.authorization_url],
                    ['tokenUrl', secret.token_url]
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="grid min-w-0 gap-0.5">
                    <dt className="type-small text-muted-foreground">{t(`oauth.settings.${label}`, {}, locale)}</dt>
                    <dd className="m-0 type-body break-all" translate="no">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <SettingsField label={t('oauth.settings.secret', {}, locale)}>
                {(aria) => (
                  <Input
                    {...aria}
                    name="client_secret"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    readOnly
                    value={secret.client_secret}
                    className="font-mono"
                  />
                )}
              </SettingsField>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copySecret()}>
                  {copyState === 'copied'
                    ? t('oauth.settings.copied', {}, locale)
                    : t('oauth.settings.copy', {}, locale)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSecret(null)
                    setCopyState('idle')
                  }}
                >
                  {t('oauth.settings.close', {}, locale)}
                </Button>
              </div>
              <SettingsStatus>
                {copyState === 'copied' ? t('oauth.settings.copiedNotice', {}, locale) : ''}
              </SettingsStatus>
              {copyState === 'failed' ? (
                <SettingsError>{t('oauth.settings.copyFailed', {}, locale)}</SettingsError>
              ) : null}
            </div>
          </SettingsPart>
        )}

        <SettingsPart title={t('oauth.settings.grants', {}, locale)} id="oauth-grants-heading">
          {loading ? (
            <SettingsLoading locale={locale}>
              <Skeleton className="h-16 w-full rounded-md" />
            </SettingsLoading>
          ) : failure ? null : grants.length ? (
            <SettingsList aria-label={t('oauth.settings.grants', {}, locale)}>
              {pageOf(grants, lastPage(grants.length, grantPage)).map((grant) => (
                <SettingsItem key={grant.id}>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="type-body font-medium [overflow-wrap:anywhere]">{grant.client_name}</span>
                    <span className="type-small flex flex-wrap gap-x-4 text-muted-foreground">
                      <span>
                        {grant.resource === 'mcp'
                          ? t('oauth.consent.resourceMcp', {}, locale)
                          : t('oauth.consent.resourceApi', {}, locale)}
                      </span>
                      <span>{projectLabel(grant.project_ids)}</span>
                      <span>{scopeList(grant.scopes)}</span>
                    </span>
                    <time className="type-small text-muted-foreground" dateTime={grant.revoked_at ?? grant.created_at}>
                      {copy(grant.revoked_at ? 'revokedOn' : 'createdOn', {
                        date: date(grant.revoked_at ?? grant.created_at)
                      })}
                    </time>
                  </div>
                  {grant.revoked_at ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={copy('revokeNamed', { name: grant.client_name })}
                      onClick={() => setTarget({ kind: 'grant', id: grant.id, name: grant.client_name })}
                    >
                      {t('oauth.settings.revoke', {}, locale)}
                    </Button>
                  )}
                </SettingsItem>
              ))}
            </SettingsList>
          ) : (
            <p className="type-body text-muted-foreground">{t('oauth.settings.emptyGrants', {}, locale)}</p>
          )}
          <RowPager
            total={grants.length}
            page={lastPage(grants.length, grantPage)}
            onPage={setGrantPage}
            locale={locale}
          />
        </SettingsPart>
      </SettingsParts>

      {target && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setTarget(null)
          }}
          objectName={target.name}
          title={t(
            target.kind === 'client' ? 'oauth.settings.deleteTitle' : 'oauth.settings.revokeTitle',
            { name: target.name },
            locale
          )}
          confirmLabel={t(
            target.kind === 'client' ? 'oauth.settings.deleteConfirm' : 'oauth.settings.revokeConfirm',
            { name: target.name },
            locale
          )}
          description={t(
            target.kind === 'client' ? 'oauth.settings.deleteDescription' : 'oauth.settings.revokeDescription',
            { name: target.name },
            locale
          )}
          onConfirm={removeTarget}
          locale={locale}
        />
      )}
    </div>
  )
}
