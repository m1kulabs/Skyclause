import { authHandler } from '@skyclause/auth'
import { SIGN_IN_LINK_EXPIRY_S } from '@skyclause/auth/sign-in-link'
import { loadEnv } from '@skyclause/config'
import { continuePath, isEmailAddress, safeNext } from './model'

// The sign-in page without JavaScript: its email and Google forms post here as plain forms, and each answer is a 303
// back to /sign-in with a state the page renders (model.ts), or on to Google. With JavaScript the page calls Better
// Auth from the browser instead and never posts these.

export interface FormPostDependencies {
  auth: (request: Request) => Promise<Response>
  now: () => Date
  appOrigin: () => string
}

const defaults: FormPostDependencies = {
  auth: authHandler,
  now: () => new Date(),
  appOrigin: () => new URL(loadEnv('web').APP_ORIGIN!).origin
}

/** What Better Auth reads from the visitor's own request: the session (a guest converting), the rate-limit address. */
const FORWARDED = ['cookie', 'user-agent', 'x-forwarded-for', 'accept-language']

/** A form post from another site is refused, as the plugin's own wrappers refuse one. */
function crossSite(request: Request, appOrigin: string): boolean {
  const origin = request.headers.get('origin')
  if (origin) return origin !== appOrigin
  const site = request.headers.get('sec-fetch-site')
  return site !== null && site !== 'same-origin' && site !== 'none'
}

function back(state: Record<string, string>, next: string | null): Response {
  const query = new URLSearchParams(state)
  if (next) query.set('next', next)
  return new Response(null, { status: 303, headers: { Location: `/sign-in?${query}` } })
}

async function readForm(request: Request): Promise<{ email: string; next: string | null }> {
  const form = await request.formData().catch(() => null)
  const field = (name: string) => {
    const value = form?.get(name)
    return typeof value === 'string' ? value : ''
  }
  return { email: field('email').trim(), next: safeNext(field('next') || undefined) }
}

function callAuth(deps: FormPostDependencies, request: Request, path: string, body: unknown): Promise<Response> {
  const appOrigin = deps.appOrigin()
  const headers = new Headers({ 'content-type': 'application/json', origin: appOrigin })
  for (const name of FORWARDED) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return deps.auth(
    new Request(new URL(`/api/auth${path}`, appOrigin), { method: 'POST', headers, body: JSON.stringify(body) })
  )
}

/** POST /sign-in/link: sends the email link, then says on /sign-in what happened and until when the link works. */
export async function sendLinkFromForm(request: Request, deps: FormPostDependencies = defaults): Promise<Response> {
  if (crossSite(request, deps.appOrigin())) return new Response(null, { status: 403 })
  const { email, next } = await readForm(request)
  if (!isEmailAddress(email)) return back({ state: 'email-invalid' }, next)
  // Taken before the send, so the end drawn is never later than the server's own.
  const sentAt = deps.now().getTime()
  let response: Response
  try {
    response = await callAuth(deps, request, '/sign-in/magic-link', { email, callbackURL: continuePath(next) })
  } catch {
    return back({ state: 'send-failed' }, next)
  }
  if (response.ok) {
    return back({ state: 'link-sent', until: new Date(sentAt + SIGN_IN_LINK_EXPIRY_S * 1000).toISOString() }, next)
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'))
    const retry = Number.isFinite(seconds) && seconds > 0 ? new Date(sentAt + seconds * 1000).toISOString() : null
    return back({ state: 'send-limited', ...(retry ? { retry } : {}) }, next)
  }
  if (response.status === 400) return back({ state: 'email-invalid' }, next)
  return back({ state: 'send-failed' }, next)
}

/** POST /sign-in/google: starts Google sign-in and hands the browser to Google with Better Auth's state cookie. */
export async function startGoogleFromForm(request: Request, deps: FormPostDependencies = defaults): Promise<Response> {
  if (crossSite(request, deps.appOrigin())) return new Response(null, { status: 403 })
  const { next } = await readForm(request)
  try {
    const response = await callAuth(deps, request, '/sign-in/social', {
      provider: 'google',
      callbackURL: continuePath(next)
    })
    const body = (await response.json().catch(() => null)) as { url?: unknown } | null
    if (!response.ok || typeof body?.url !== 'string') return back({ state: 'google-failed' }, next)
    const headers = new Headers({ Location: body.url })
    for (const cookie of response.headers.getSetCookie()) headers.append('Set-Cookie', cookie)
    return new Response(null, { status: 303, headers })
  } catch {
    return back({ state: 'google-failed' }, next)
  }
}
