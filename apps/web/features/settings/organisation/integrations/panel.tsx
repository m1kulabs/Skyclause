'use client'

import '../../../oauth/catalogue'
import '../../catalogue'
import { t } from '@skyclause/i18n'
import { formatDate } from '@skyclause/i18n/format'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '#ui/button'
import { Checkbox } from '#ui/checkbox'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { ConfirmDialog } from '../../set-7'
import {
  SettingsAside,
  SettingsField,
  SettingsItem,
  SettingsList,
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

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN
const apiUrl = (path: string) => (apiOrigin ? new URL(path, apiOrigin).toString() : path)
const apiCredentials = apiOrigin ? ('include' as const) : ('same-origin' as const)

async function fetchPage<T>(url: string): Promise<T[]> {
  const response = await fetch(apiUrl(url), { credentials: apiCredentials })
  if (!response.ok) throw Object.assign(new Error('load'), { status: response.status })
  return ((await response.json()) as Page<T>).data
}

export default function Panel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) =>
    t(`settings.integrations.${key}`, vars, locale)
  const [clients, setClients] = useState<Client[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['read'])
  const [secret, setSecret] = useState<CreatedClient | null>(null)
  const [copied, setCopied] = useState(false)
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
        fetchPage<Client>(`${root}/oauth-clients?limit=100`),
        fetchPage<Grant>(`${root}/oauth-grants?limit=100`)
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !name.trim() || scopes.length === 0) return
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
  }

  const date = (value: string) => formatDate(value, locale)
  const scopeLabel = (scope: Scope) => t(`oauth.settings.${scope}`, {}, locale)
  const projectLabel = (value: Grant['project_ids']) =>
    value === 'all'
      ? t('oauth.settings.allProjects', {}, locale)
      : t('oauth.settings.projectCount', { count: value.length }, locale)
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
          <form onSubmit={create} className="grid min-w-0 gap-5" noValidate>
            <SettingsField
              label={t('oauth.settings.clientName', {}, locale)}
              hint={copy('nameHint', {
                limit: NAME_LIMIT,
                redirect: t('oauth.settings.geminiRedirect', {}, locale)
              })}
              error={error ? t('oauth.settings.saveFailed', {}, locale) : undefined}
            >
              {(aria) => (
                <Input
                  {...aria}
                  name="client_name"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('oauth.settings.namePlaceholder', {}, locale)}
                  required
                  maxLength={NAME_LIMIT}
                  disabled={saving}
                />
              )}
            </SettingsField>
            <fieldset className="m-0 grid min-w-0 gap-1 border-0 p-0">
              <legend className="mb-1 p-0 text-[14px] leading-5 font-medium">
                {t('oauth.settings.scopes', {}, locale)}
              </legend>
              {(['read', 'draft'] as const).map((scope) => (
                <label key={scope} className="flex min-h-9 items-center gap-3 text-[14px]">
                  <Checkbox
                    name="scopes"
                    value={scope}
                    aria-label={
                      scope === 'read'
                        ? t('oauth.settings.scopeRead', {}, locale)
                        : t('oauth.settings.scopeDraft', {}, locale)
                    }
                    checked={scopes.includes(scope)}
                    onCheckedChange={() =>
                      setScopes((current) =>
                        current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
                      )
                    }
                  />
                  {scope === 'read'
                    ? t('oauth.settings.scopeRead', {}, locale)
                    : t('oauth.settings.scopeDraft', {}, locale)}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving || scopes.length === 0 || !name.trim()} aria-busy={saving}>
                {t('oauth.settings.create', {}, locale)}
              </Button>
              {notice ? <SettingsStatus>{notice}</SettingsStatus> : null}
            </div>
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
            <Skeleton className="h-16 w-full rounded-md" />
          ) : clients.length ? (
            <SettingsList aria-label={t('oauth.settings.clients', {}, locale)}>
              {clients.map((client) => (
                <SettingsItem key={client.id}>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="type-body font-medium [overflow-wrap:anywhere]">{client.client_name}</span>
                    <span className="type-small flex flex-wrap gap-x-4 text-muted-foreground">
                      <span>{client.scopes.map(scopeLabel).join(', ')}</span>
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
                    <dd className="m-0 type-body break-all">{value}</dd>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(secret.client_secret).then(() => setCopied(true))}
                >
                  {copied ? t('oauth.settings.copied', {}, locale) : t('oauth.settings.copy', {}, locale)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSecret(null)
                    setCopied(false)
                  }}
                >
                  {t('oauth.settings.close', {}, locale)}
                </Button>
              </div>
            </div>
          </SettingsPart>
        )}

        <SettingsPart title={t('oauth.settings.grants', {}, locale)} id="oauth-grants-heading">
          {loading ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : failure ? null : grants.length ? (
            <SettingsList aria-label={t('oauth.settings.grants', {}, locale)}>
              {grants.map((grant) => (
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
                      <span>{grant.scopes.map(scopeLabel).join(', ')}</span>
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
