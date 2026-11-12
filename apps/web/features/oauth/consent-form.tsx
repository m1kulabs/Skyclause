'use client'

import './catalogue'
import { t } from '@skyclause/i18n'
import { useMemo, useState } from 'react'
import type { getOAuthConsentDetails } from '@skyclause/auth'
import { Button } from '#ui/button'
import { AuthMessage } from '../public-chrome/auth'

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

  const scopeLabel = (scope: Scope) => t(`oauth.consent.scope${scope === 'read' ? 'Read' : 'Draft'}`, {}, locale)

  return (
    <form action="/api/auth/oauth/consent" method="post" className="auth-form">
      <input type="hidden" name="oauth_query" value={oauthQuery} />
      <section className="auth-tile" aria-label={t('oauth.consent.who', {}, locale)}>
        <dl className="auth-facts">
          <div>
            <dt>{t('oauth.consent.client', {}, locale)}</dt>
            <dd>{details.clientName}</dd>
          </div>
          <div>
            <dt>{t('oauth.consent.redirect', {}, locale)}</dt>
            <dd>{details.redirectHost}</dd>
          </div>
          <div>
            <dt>{t('oauth.consent.resource', {}, locale)}</dt>
            <dd>{t(`oauth.consent.resource${details.resource === 'api' ? 'Api' : 'Mcp'}`, {}, locale)}</dd>
          </div>
        </dl>
      </section>

      {details.link ? (
        <>
          <input type="hidden" name="org_id" value={details.link.orgId} />
          <div className="auth-facts">
            <div>
              <span className="auth-legend">{t('oauth.consent.organisation', {}, locale)}</span>
              <p className="m-0">{details.link.organizationName}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="auth-field">
          <label htmlFor="oauth-org">{t('oauth.consent.organisation', {}, locale)}</label>
          <select
            id="oauth-org"
            name="org_id"
            autoComplete="off"
            value={orgId}
            onChange={(event) => changeOrg(event.target.value)}
            required
            className="auth-select"
          >
            {details.organisations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="auth-fieldset">
        <legend className="auth-legend">{t('oauth.consent.projects', {}, locale)}</legend>
        <p className="auth-hint">{t('oauth.consent.projectChoice', {}, locale)}</p>
        {details.link ? (
          <label className="auth-check">
            <input type="checkbox" name="project_ids" value={details.link.projectId} checked readOnly />
            <span>{details.link.projectName}</span>
          </label>
        ) : (
          <>
            <label className="auth-check">
              <input
                type="checkbox"
                name="all_projects"
                value="true"
                checked={allProjects}
                onChange={(event) => setAllProjects(event.target.checked)}
              />
              <span>{t('oauth.consent.allProjects', {}, locale)}</span>
            </label>
            {projects.length > 0 ? (
              projects.map((project) => (
                <label key={project.id} className="auth-check">
                  <input
                    type="checkbox"
                    name="project_ids"
                    value={project.id}
                    checked={projectIds.includes(project.id)}
                    disabled={allProjects}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span>{project.name}</span>
                </label>
              ))
            ) : (
              <p className="auth-hint">{t('oauth.consent.noProjects', {}, locale)}</p>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="auth-fieldset">
        <legend className="auth-legend">{t('oauth.consent.scopes', {}, locale)}</legend>
        <p className="auth-hint">
          {t(
            'oauth.consent.scopeSummary',
            {
              label: t('oauth.consent.scopeRequested', {}, locale),
              values: details.requestedScopes.map(scopeLabel).join(', ') || t('oauth.consent.scopeNone', {}, locale)
            },
            locale
          )}
        </p>
        {requestedScopes.map((scope) => (
          <label key={scope} className="auth-check">
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              checked={scopes.includes(scope)}
              onChange={() => toggleScope(scope)}
            />
            <span>{scopeLabel(scope)}</span>
          </label>
        ))}
      </fieldset>

      <AuthMessage tone="result" role="note">
        {t('oauth.consent.warning', {}, locale)}
      </AuthMessage>
      <div className="auth-pair">
        <Button type="submit" name="accept" value="false" variant="default" size="lg" className="whitespace-normal">
          {t('oauth.consent.deny', {}, locale)}
        </Button>
        <Button type="submit" name="accept" value="true" variant="default" size="lg" className="whitespace-normal">
          {t('oauth.consent.allow', {}, locale)}
        </Button>
      </div>
    </form>
  )
}
