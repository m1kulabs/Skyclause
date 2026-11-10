'use client'

import './catalogue'
import { t } from '@skyclause/i18n'
import { useMemo, useState } from 'react'
import type { getOAuthConsentDetails } from '@skyclause/auth'
import { Button } from '#ui/button'

type Details = Awaited<ReturnType<typeof getOAuthConsentDetails>>
type Scope = 'read' | 'draft'

export function OAuthConsentForm({
  details,
  oauthQuery,
  locale
}: {
  details: Details
  oauthQuery: string
  locale: 'en' | 'ms'
}) {
  const initialOrg = details.link?.orgId ?? details.lockedOrgId ?? details.organisations[0]?.id ?? ''
  const [orgId, setOrgId] = useState(initialOrg)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [allProjects, setAllProjects] = useState(false)
  const initialOrgRecord = details.organisations.find((org) => org.id === initialOrg)
  const availableScopes = details.link
    ? details.link.access === 'reviewer'
      ? (['read', 'draft'] as Scope[])
      : (['read'] as Scope[])
    : (initialOrgRecord?.availableScopes ?? [])
  const requestedScopes = useMemo(
    () => details.requestedScopes.filter((scope) => availableScopes.includes(scope)),
    [availableScopes, details.requestedScopes]
  )
  const selectedOrg = details.organisations.find((org) => org.id === orgId)
  const projects = details.link
    ? [{ id: details.link.projectId, name: details.link.projectName }]
    : (selectedOrg?.projects ?? [])
  const [scopes, setScopes] = useState<Scope[]>(requestedScopes)

  function changeOrg(next: string) {
    setOrgId(next)
    setProjectIds([])
    setAllProjects(false)
    const org = details.organisations.find((item) => item.id === next)
    setScopes(details.requestedScopes.filter((scope) => org?.availableScopes.includes(scope)))
  }

  function toggleProject(id: string) {
    setProjectIds((selected) => (selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]))
  }

  function toggleScope(scope: Scope) {
    setScopes((selected) =>
      selected.includes(scope) ? selected.filter((item) => item !== scope) : [...selected, scope]
    )
  }

  return (
    <form
      action="/api/auth/oauth/consent"
      method="post"
      className="grid gap-5 rounded-md border border-border bg-card p-5"
    >
      <input type="hidden" name="oauth_query" value={oauthQuery} />
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="text-muted-foreground">{t('oauth.consent.client', {}, locale)}</dt>
          <dd className="break-words font-medium">{details.clientName}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-muted-foreground">{t('oauth.consent.redirect', {}, locale)}</dt>
          <dd className="break-all font-medium">{details.redirectHost}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-muted-foreground">{t('oauth.consent.resource', {}, locale)}</dt>
          <dd className="font-medium">
            {t(`oauth.consent.resource${details.resource === 'api' ? 'Api' : 'Mcp'}`, {}, locale)}
          </dd>
        </div>
      </dl>

      {details.link ? (
        <>
          <input type="hidden" name="org_id" value={details.link.orgId} />
          <div className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t('oauth.consent.organisation', {}, locale)}</span>
            <span className="font-medium">{details.link.organizationName}</span>
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <label htmlFor="oauth-org" className="text-sm font-medium">
            {t('oauth.consent.organisation', {}, locale)}
          </label>
          <select
            id="oauth-org"
            name="org_id"
            value={orgId}
            onChange={(event) => changeOrg(event.target.value)}
            required
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            {details.organisations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('oauth.consent.projects', {}, locale)}</legend>
        <p className="text-sm leading-5 text-muted-foreground">{t('oauth.consent.projectChoice', {}, locale)}</p>
        {details.link ? (
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm">
            <input
              type="checkbox"
              name="project_ids"
              value={details.link.projectId}
              checked
              readOnly
              className="size-4 accent-primary"
            />
            <span>{details.link.projectName}</span>
          </label>
        ) : (
          <>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm">
              <input
                type="checkbox"
                name="all_projects"
                value="true"
                checked={allProjects}
                onChange={(event) => setAllProjects(event.target.checked)}
                className="size-4 accent-primary"
              />
              <span>{t('oauth.consent.allProjects', {}, locale)}</span>
            </label>
            {projects.length > 0 ? (
              projects.map((project) => (
                <label
                  key={project.id}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name="project_ids"
                    value={project.id}
                    checked={projectIds.includes(project.id)}
                    disabled={allProjects}
                    onChange={() => toggleProject(project.id)}
                    className="size-4 accent-primary"
                  />
                  <span>{project.name}</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('oauth.consent.noProjects', {}, locale)}</p>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('oauth.consent.scopes', {}, locale)}</legend>
        <p className="text-sm leading-5 text-muted-foreground">
          {t(
            'oauth.consent.scopeSummary',
            {
              label: t('oauth.consent.scopeRequested', {}, locale),
              values:
                details.requestedScopes
                  .map((scope) => t(`oauth.consent.scope${scope === 'read' ? 'Read' : 'Draft'}`, {}, locale))
                  .join(', ') || t('oauth.consent.scopeNone', {}, locale)
            },
            locale
          )}
        </p>
        {requestedScopes.map((scope) => (
          <label key={scope} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm">
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              checked={scopes.includes(scope)}
              onChange={() => toggleScope(scope)}
              className="size-4 accent-primary"
            />
            <span>{t(`oauth.consent.scope${scope === 'read' ? 'Read' : 'Draft'}`, {}, locale)}</span>
          </label>
        ))}
      </fieldset>

      <p className="rounded-md border border-border bg-background p-3 text-sm font-medium leading-5">
        {t('oauth.consent.warning', {}, locale)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="submit"
          name="accept"
          value="false"
          variant="default"
          size="lg"
          className="min-h-11 whitespace-normal"
        >
          {t('oauth.consent.deny', {}, locale)}
        </Button>
        <Button
          type="submit"
          name="accept"
          value="true"
          variant="default"
          size="lg"
          className="min-h-11 whitespace-normal"
        >
          {t('oauth.consent.allow', {}, locale)}
        </Button>
      </div>
    </form>
  )
}
