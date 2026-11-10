import type { ResolvePrincipal } from '@skyclause/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { ApiError, problemResponse, toApiError, validationFailed } from '../../problems'

const consentForm = z.object({
  oauthQuery: z.string().min(1),
  orgId: z.uuid(),
  projectIds: z.array(z.uuid()).nullable(),
  scopes: z.array(z.enum(['read', 'draft'])),
  accept: z.enum(['true', 'false']).transform((value) => value === 'true')
})

/** The auth composition root supplies the service; API code never imports packages/auth. */
export function createOAuthConsentHandler(deps: {
  resolvePrincipal: ResolvePrincipal
  appOrigin: () => string
  completeConsent: (input: z.output<typeof consentForm> & { headers: Headers }) => Promise<{ url: string }>
}) {
  const app = new Hono()
  app.onError((error, c) => problemResponse(c, toApiError(error)))
  app.post('/api/auth/oauth/consent', async (c) => {
    const principal = await deps.resolvePrincipal(c.req.raw, { surface: 'api' })
    if (!principal) return c.redirect('/sign-in', 303)
    if (principal.kind !== 'session') throw new ApiError(403, 'insufficient-scope', 'Consent needs a member session.')
    if (principal.isGuest) return c.redirect('/sign-up', 303)
    if (principal.via === 'cookie' && c.req.header('Origin') !== new URL(deps.appOrigin()).origin) {
      throw new ApiError(403, 'insufficient-scope', 'A cookie write must come from the app origin.')
    }
    const form = await c.req.raw.formData()
    const parsed = consentForm.safeParse({
      oauthQuery: form.get('oauth_query'),
      orgId: form.get('org_id'),
      projectIds: form.get('all_projects') === 'true' ? null : form.getAll('project_ids'),
      scopes: form.getAll('scopes'),
      accept: form.get('accept')
    })
    if (!parsed.success) throw validationFailed('form', parsed.error)
    const result = await deps.completeConsent({ ...parsed.data, headers: c.req.raw.headers })
    return c.redirect(result.url, 303)
  })
  return (request: Request) => app.fetch(request)
}
