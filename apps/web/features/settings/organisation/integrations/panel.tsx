'use client'

import '../../../oauth/catalogue'
import { t } from '@skyclause/i18n'
import { formatDate } from '@skyclause/i18n/format'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { ConfirmDialog } from '../../set-7'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'

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

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN
const apiUrl = (path: string) => (apiOrigin ? new URL(path, apiOrigin).toString() : path)
const apiCredentials = apiOrigin ? ('include' as const) : ('same-origin' as const)

async function fetchPage<T>(url: string): Promise<T[]> {
  const response = await fetch(apiUrl(url), { credentials: apiCredentials })
  if (!response.ok) throw new Error('load')
  return ((await response.json()) as Page<T>).data
}

export default function Panel({ org, locale = 'en' }: { org: string; locale?: 'en' | 'ms' }) {
  const [clients, setClients] = useState<Client[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['read'])
  const [secret, setSecret] = useState<CreatedClient | null>(null)
  const [copied, setCopied] = useState(false)
  const [target, setTarget] = useState<ConfirmTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setError(false)
    try {
      const root = `/api/orgs/${encodeURIComponent(org)}`
      const [nextClients, nextGrants] = await Promise.all([
        fetchPage<Client>(`${root}/oauth-clients?limit=100`),
        fetchPage<Grant>(`${root}/oauth-grants?limit=100`)
      ])
      setClients(nextClients)
      setGrants(nextGrants)
    } catch {
      setError(true)
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
      setSecret((await response.json()) as CreatedClient)
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
    setTarget(null)
    await refresh()
  }

  const date = (value: string) => formatDate(value, locale)
  const scopeLabel = (scope: Scope) => t(`oauth.settings.${scope}`, {}, locale)
  const projectLabel = (value: Grant['project_ids']) =>
    value === 'all'
      ? t('oauth.settings.allProjects', {}, locale)
      : t('oauth.settings.projectCount', { count: value.length }, locale)

  return (
    <div className="grid min-w-0 gap-8">
      <section className="grid gap-4" aria-labelledby="oauth-clients-heading">
        <h3 id="oauth-clients-heading" className="text-lg font-medium">
          {t('oauth.settings.clients', {}, locale)}
        </h3>
        <form
          onSubmit={create}
          className="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="oauth-client-name">{t('oauth.settings.clientName', {}, locale)}</Label>
            <Input
              id="oauth-client-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('oauth.settings.namePlaceholder', {}, locale)}
              required
              maxLength={120}
              disabled={saving}
            />
            <span className="break-all text-xs text-muted-foreground">
              {t(
                'oauth.settings.fieldValue',
                {
                  label: t('oauth.settings.redirect', {}, locale),
                  value: t('oauth.settings.geminiRedirect', {}, locale)
                },
                locale
              )}
            </span>
          </div>
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">{t('oauth.settings.scopes', {}, locale)}</legend>
            {(['read', 'draft'] as const).map((scope) => (
              <label key={scope} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() =>
                    setScopes((current) =>
                      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
                    )
                  }
                  className="size-4 accent-primary"
                />
                {scope === 'read'
                  ? t('oauth.settings.scopeRead', {}, locale)
                  : t('oauth.settings.scopeDraft', {}, locale)}
              </label>
            ))}
          </fieldset>
          <Button
            type="submit"
            size="lg"
            className="min-h-11 whitespace-normal sm:col-start-2"
            disabled={saving || scopes.length === 0}
            aria-busy={saving}
          >
            {t('oauth.settings.create', {}, locale)}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('oauth.settings.saveFailed', {}, locale)}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('oauth.settings.loading', {}, locale)}</p>
        ) : (
          <Table>
            <caption className="sr-only">{t('oauth.settings.clients', {}, locale)}</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('oauth.settings.client', {}, locale)}</TableHead>
                <TableHead scope="col">{t('oauth.settings.scopes', {}, locale)}</TableHead>
                <TableHead scope="col">{t('oauth.settings.created', {}, locale)}</TableHead>
                <TableHead scope="col">{t('oauth.settings.actions', {}, locale)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length ? (
                clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="max-w-56 whitespace-normal break-words">{client.client_name}</TableCell>
                    <TableCell>{client.scopes.map(scopeLabel).join(', ')}</TableCell>
                    <TableCell>{date(client.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setTarget({ kind: 'client', id: client.id, name: client.client_name })}
                      >
                        {t('oauth.settings.deleteClient', {}, locale)}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="whitespace-normal text-muted-foreground">
                    {t('oauth.settings.emptyClients', {}, locale)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="oauth-grants-heading">
        <h3 id="oauth-grants-heading" className="text-lg font-medium">
          {t('oauth.settings.grants', {}, locale)}
        </h3>
        <Table>
          <caption className="sr-only">{t('oauth.settings.grants', {}, locale)}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('oauth.settings.client', {}, locale)}</TableHead>
              <TableHead scope="col">{t('oauth.settings.resource', {}, locale)}</TableHead>
              <TableHead scope="col">{t('oauth.settings.projects', {}, locale)}</TableHead>
              <TableHead scope="col">{t('oauth.settings.scopes', {}, locale)}</TableHead>
              <TableHead scope="col">{t('oauth.settings.created', {}, locale)}</TableHead>
              <TableHead scope="col">{t('oauth.settings.actions', {}, locale)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.length ? (
              grants.map((grant) => (
                <TableRow key={grant.id}>
                  <TableCell className="max-w-56 whitespace-normal break-words">{grant.client_name}</TableCell>
                  <TableCell>
                    {grant.resource === 'mcp'
                      ? t('oauth.consent.resourceMcp', {}, locale)
                      : t('oauth.consent.resourceApi', {}, locale)}
                  </TableCell>
                  <TableCell>{projectLabel(grant.project_ids)}</TableCell>
                  <TableCell>{grant.scopes.map(scopeLabel).join(', ')}</TableCell>
                  <TableCell>{date(grant.created_at)}</TableCell>
                  <TableCell>
                    {grant.revoked_at ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setTarget({ kind: 'grant', id: grant.id, name: grant.client_name })}
                      >
                        {t('oauth.settings.revoke', {}, locale)}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="whitespace-normal text-muted-foreground">
                  {t('oauth.settings.emptyGrants', {}, locale)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      {secret && (
        <section
          className="grid gap-3 rounded-md border border-border bg-card p-4"
          aria-labelledby="oauth-secret-heading"
        >
          <h3 id="oauth-secret-heading" className="text-lg font-medium">
            {t('oauth.settings.secretTitle', {}, locale)}
          </h3>
          <p className="text-sm leading-5 text-muted-foreground">{t('oauth.settings.secretDescription', {}, locale)}</p>
          <p className="break-all text-sm">
            {t(
              'oauth.settings.fieldValue',
              { label: t('oauth.settings.clientId', {}, locale), value: secret.client_id },
              locale
            )}
          </p>
          <p className="break-all text-sm">
            {t(
              'oauth.settings.fieldValue',
              { label: t('oauth.settings.redirect', {}, locale), value: secret.redirect_uri },
              locale
            )}
          </p>
          <p className="break-all text-sm">
            {t(
              'oauth.settings.fieldValue',
              { label: t('oauth.settings.authorizationUrl', {}, locale), value: secret.authorization_url },
              locale
            )}
          </p>
          <p className="break-all text-sm">
            {t(
              'oauth.settings.fieldValue',
              { label: t('oauth.settings.tokenUrl', {}, locale), value: secret.token_url },
              locale
            )}
          </p>
          <Label htmlFor="oauth-client-secret">{t('oauth.settings.secret', {}, locale)}</Label>
          <Input id="oauth-client-secret" readOnly value={secret.client_secret} className="font-mono" />
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
        </section>
      )}

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
