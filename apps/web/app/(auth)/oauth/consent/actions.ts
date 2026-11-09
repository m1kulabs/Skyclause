'use server'

import { completeOAuthConsent } from '@skyclause/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function submitOAuthConsent(formData: FormData) {
  const oauthQuery = String(formData.get('oauth_query') ?? '')
  const orgId = String(formData.get('org_id') ?? '')
  const accept = formData.get('accept') === 'true'
  const projectIds = formData.get('all_projects') === 'true' ? null : formData.getAll('project_ids').map(String)
  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((scope): scope is 'read' | 'draft' => scope === 'read' || scope === 'draft')
  if (!oauthQuery || !orgId) redirect('/sign-in')
  const result = await completeOAuthConsent({
    headers: new Headers(await headers()),
    oauthQuery,
    orgId,
    projectIds,
    scopes,
    accept
  })
  redirect(result.url)
}
