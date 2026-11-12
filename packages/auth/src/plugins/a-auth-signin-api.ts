import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { EmailTransport } from '@skyclause/contracts'
import { member, organization, track, verification, withSystem } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { googleLinkEmail, magicLinkDisabledEmail, magicLinkEmail, requireEmailTransport } from '@skyclause/delivery'
import { loadEnv } from '@skyclause/config'
import { APIError, getSessionFromCtx } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { asc, eq, sql } from 'drizzle-orm'
import { withSendRefusal } from '../send-refusal'
import { SIGN_IN_LINK_EXPIRY_S } from '../sign-in-link'

const OWNER = 'a-auth-signin-api'
const HANDLE = 'magic-link-resend:'
const MAGIC = 'magic-link:'
const MAGIC_META = 'magic-link-meta:'
const GOOGLE_LINK = 'google-link:'
const MAGIC_EXPIRY_S = SIGN_IN_LINK_EXPIRY_S
const HANDLE_EXPIRY_S = 24 * 60 * 60
const RATE_WINDOW_S = 60 * 60

export interface SignedUpProps {
  method: 'magic_link' | 'google'
  from_guest: boolean
}

export interface AuthSignInApiDependencies {
  email?: EmailTransport
  now?: () => Date
  trackSignup?: (props: SignedUpProps) => Promise<void>
}

interface HandleValue {
  kind: 'magic_link' | 'link_google'
  email: string
  next: string | null
  fromGuest: boolean
  userId?: string
  linkToken?: string
}

interface GoogleLinkValue {
  type: 'link_google'
  email: string
  userId: string
  subject: string
}

interface AuthInternalAdapter {
  findUserByEmail(
    email: string,
    options?: { includeAccounts: boolean }
  ): Promise<{
    user: { id: string; email: string; emailVerified: boolean; magicLinkEnabled?: boolean; isAnonymous?: boolean }
    accounts: Array<{ providerId: string; accountId: string; userId: string }>
  } | null>
  findUserById(userId: string): Promise<{ id: string; email: string; magicLinkEnabled?: boolean } | null>
  findVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>
  consumeVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>
  createVerificationValue(input: { identifier: string; value: string; expiresAt: Date }): Promise<unknown>
  findAccountByKey(key: { providerId: string; accountId: string }): Promise<{ userId: string } | null>
  linkAccount(input: { providerId: string; accountId: string; userId: string }): Promise<unknown>
  deleteSession(token: string): Promise<void>
}

interface AuthApiRuntime {
  options: { plugins: BetterAuthPlugin[] }
  api: {
    magicLinkVerify(args: { query: { token: string }; headers: Headers; asResponse: true }): Promise<Response>
    signInMagicLink(args: {
      body: { email: string; callbackURL?: string; metadata: Record<string, unknown> }
      headers: Headers
      asResponse: true
    }): Promise<Response>
    getSession(args: { headers: Headers }): Promise<{ user: { id: string } } | null>
  }
  $context: Promise<{ internalAdapter: AuthInternalAdapter }>
  handler(request: Request): Promise<Response>
}

const runtimes = new WeakMap<BetterAuthPlugin, Required<AuthSignInApiDependencies>>()

const sendEmail: EmailTransport = {
  send: (message) => requireEmailTransport('web').send(message)
}

async function recordSignup(props: SignedUpProps) {
  await withSystem('auth:signed-up', (tx) => track(tx, 'signed_up', props))
}

/** Cloud Run appends the client address as the rightmost X-Forwarded-For value. */
function clientIp(headers?: Headers) {
  return headers?.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown'
}

function safeNext(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const resolved = new URL(value, 'https://app.skyclause.m1ku.tech')
    return resolved.origin === 'https://app.skyclause.m1ku.tech'
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : null
  } catch {
    return null
  }
}

function nextFromRequest(ctx?: { body?: unknown; context?: { baseURL?: string } }) {
  const body = (ctx?.body ?? {}) as { callbackURL?: unknown; metadata?: Record<string, unknown> }
  const fromMetadata = safeNext(body.metadata?.next)
  if (fromMetadata) return fromMetadata
  if (typeof body.callbackURL !== 'string') return null
  try {
    const baseURL = ctx?.context?.baseURL ?? 'https://app.skyclause.m1ku.tech'
    const callback = new URL(body.callbackURL, baseURL)
    if (callback.origin !== new URL(baseURL).origin) return null
    if (callback.pathname === '/api/auth/continue') return safeNext(callback.searchParams.get('next'))
    return safeNext(`${callback.pathname}${callback.search}${callback.hash}`)
  } catch {
    return null
  }
}

function parseHandle(value: string | undefined): HandleValue | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as HandleValue
    return parsed && (parsed.kind === 'magic_link' || parsed.kind === 'link_google') && typeof parsed.email === 'string'
      ? parsed
      : null
  } catch {
    return null
  }
}

async function enforceRequestLimits(email: string, ip: string, now: Date) {
  const env = loadEnv('web')
  const emailHash = createHmac('sha256', env.EMAIL_HASH_KEY).update(email.trim().toLowerCase()).digest('hex')
  const ipHash = createHmac('sha256', env.IP_HASH_KEY).update(ip).digest('hex')
  const limits = [
    { identifier: `auth-signin:email:${emailHash}`, max: 5 },
    { identifier: `auth-signin:ip:${ipHash}`, max: 20 }
  ].sort((a, b) => a.identifier.localeCompare(b.identifier))

  const retryAfter = await authDatabase().transaction(async (tx) => {
    for (const { identifier } of limits) {
      // A transaction-scoped lock makes the verification-table counter safe without adding another table or index.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`)
    }
    const rows = await Promise.all(
      limits.map(async (limit) => {
        const [row] = await tx.select().from(verification).where(eq(verification.identifier, limit.identifier)).limit(1)
        const active = row && row.expiresAt > now
        const count = active ? Number((JSON.parse(row.value) as { count?: number }).count ?? 0) : 0
        return {
          ...limit,
          row,
          count,
          expiresAt: active ? row.expiresAt : new Date(now.getTime() + RATE_WINDOW_S * 1000)
        }
      })
    )
    const blocked = rows.find((row) => row.count >= row.max)
    if (blocked) return Math.max(1, Math.ceil((blocked.expiresAt.getTime() - now.getTime()) / 1000))

    for (const row of rows) {
      const values = { value: JSON.stringify({ count: row.count + 1 }), expiresAt: row.expiresAt, updatedAt: now }
      if (row.row) {
        await tx.update(verification).set(values).where(eq(verification.id, row.row.id))
      } else {
        await tx.insert(verification).values({ identifier: row.identifier, ...values })
      }
    }
    return null
  })

  if (retryAfter !== null) {
    throw new APIError(
      429,
      { code: 'RATE_LIMITED', message: 'Too many sign-in link requests.' },
      { 'Retry-After': String(retryAfter) }
    )
  }
}

async function createMagicHandle(
  context: {
    internalAdapter: AuthInternalAdapter
  },
  email: string,
  next: string | null,
  fromGuest: boolean,
  now: Date,
  resend?: string
) {
  if (resend) {
    const existing = await context.internalAdapter.findVerificationValue(`${HANDLE}${resend}`)
    const value = parseHandle(existing?.value)
    if (
      existing &&
      existing.expiresAt > now &&
      value?.kind === 'magic_link' &&
      value.email.toLowerCase() === email.toLowerCase()
    ) {
      return { handle: resend, next: value.next, fromGuest: value.fromGuest }
    }
  }

  const handle = randomUUID()
  const value: HandleValue = { kind: 'magic_link', email, next, fromGuest }
  await context.internalAdapter.createVerificationValue({
    identifier: `${HANDLE}${handle}`,
    value: JSON.stringify(value),
    expiresAt: new Date(now.getTime() + HANDLE_EXPIRY_S * 1000)
  })
  return { handle, next, fromGuest }
}

async function sendMagicLink(
  data: { email: string; token: string; metadata?: Record<string, unknown> },
  endpoint: Parameters<NonNullable<Parameters<typeof magicLink>[0]['sendMagicLink']>>[1],
  deps: Required<AuthSignInApiDependencies>
) {
  const now = deps.now()
  const context = endpoint?.context
  const email = data.email.trim()
  const tokenIdentifier = `${MAGIC}${data.token}`
  const ip = endpoint ? clientIp(endpoint.headers) : 'unknown'
  try {
    await enforceRequestLimits(email, ip, now)
  } catch (error) {
    await context?.internalAdapter.consumeVerificationValue(tokenIdentifier)
    throw error
  }

  const userMatch = await context?.internalAdapter.findUserByEmail(email, { includeAccounts: false })
  const userRecord = userMatch?.user as { magicLinkEnabled?: boolean } | undefined
  if (userRecord?.magicLinkEnabled === false) {
    await context?.internalAdapter.consumeVerificationValue(tokenIdentifier)
    const emailContent = magicLinkDisabledEmail()
    await deps.email.send({
      to: email,
      from: 'auth',
      ...emailContent,
      category: 'magic_link_off',
      idempotencyKey: createHmac('sha256', 'skyclause-auth-email')
        .update(`disabled\n${email.toLowerCase()}\n${data.token}`)
        .digest('hex')
    })
    return
  }

  const body = (endpoint?.body ?? {}) as { metadata?: Record<string, unknown>; callbackURL?: string }
  const metadata = data.metadata ?? body.metadata ?? {}
  const resend = typeof metadata.resend === 'string' ? metadata.resend : undefined
  const foundHandle = resend ? await context?.internalAdapter.findVerificationValue(`${HANDLE}${resend}`) : null
  const foundValue = parseHandle(foundHandle?.value)
  const session = endpoint ? await getSessionFromCtx(endpoint, { disableRefresh: true }) : null
  const handle = await createMagicHandle(
    { internalAdapter: context!.internalAdapter },
    email,
    foundValue?.next ?? nextFromRequest({ body, context: endpoint?.context }),
    foundValue?.fromGuest ?? session?.user.isAnonymous === true,
    now,
    resend
  )
  await context!.internalAdapter.createVerificationValue({
    identifier: `${MAGIC_META}${data.token}`,
    value: JSON.stringify({ fromGuest: handle.fromGuest }),
    expiresAt: new Date(now.getTime() + MAGIC_EXPIRY_S * 1000)
  })
  const destination = new URL('/sign-in', endpoint?.context.baseURL ?? 'https://app.skyclause.m1ku.tech')
  destination.searchParams.set('link', data.token)
  destination.searchParams.set('resend', handle.handle)
  const emailContent = magicLinkEmail(destination.toString(), new Date(now.getTime() + MAGIC_EXPIRY_S * 1000))
  await deps.email.send({
    to: email,
    from: 'auth',
    ...emailContent,
    category: 'magic_link',
    idempotencyKey: createHmac('sha256', 'skyclause-auth-email').update(`magic\n${data.token}`).digest('hex')
  })
}

async function sendGoogleLink(
  context: {
    baseURL: string
    internalAdapter: AuthInternalAdapter
  },
  deps: Required<AuthSignInApiDependencies>,
  details: { email: string; userId: string; subject: string }
) {
  const now = deps.now()
  const token = randomBytes(32).toString('base64url')
  const handle = randomUUID()
  const expiresAt = new Date(now.getTime() + MAGIC_EXPIRY_S * 1000)
  const googleLink: GoogleLinkValue = {
    type: 'link_google',
    email: details.email,
    userId: details.userId,
    subject: details.subject
  }
  await context.internalAdapter.createVerificationValue({
    identifier: `${GOOGLE_LINK}${token}`,
    value: JSON.stringify(googleLink),
    expiresAt
  })
  await context.internalAdapter.createVerificationValue({
    identifier: `${MAGIC}${token}`,
    value: JSON.stringify({ type: 'magic-link', email: details.email }),
    expiresAt
  })
  await context.internalAdapter.createVerificationValue({
    identifier: `${HANDLE}${handle}`,
    value: JSON.stringify({
      kind: 'link_google',
      email: details.email,
      next: null,
      fromGuest: false,
      userId: details.userId,
      linkToken: token
    } satisfies HandleValue),
    expiresAt: new Date(now.getTime() + HANDLE_EXPIRY_S * 1000)
  })
  const url = new URL('/sign-in', context.baseURL)
  url.searchParams.set('link', token)
  url.searchParams.set('resend', handle)
  const emailContent = googleLinkEmail(url.toString(), expiresAt)
  await deps.email.send({
    to: details.email,
    from: 'auth',
    ...emailContent,
    category: 'link_google',
    idempotencyKey: createHmac('sha256', 'skyclause-auth-email').update(`google\n${token}`).digest('hex')
  })
}

export function aAuthSignInApi(overrides: AuthSignInApiDependencies = {}): BetterAuthPlugin {
  const email = overrides.email ?? sendEmail
  const deps: Required<AuthSignInApiDependencies> = {
    email: { send: withSendRefusal((message) => email.send(message)) },
    now: overrides.now ?? (() => new Date()),
    trackSignup: overrides.trackSignup ?? recordSignup
  }
  const base = magicLink({
    expiresIn: MAGIC_EXPIRY_S,
    sendMagicLink: (data, endpoint) => sendMagicLink(data, endpoint, deps)
  })

  const plugin: BetterAuthPlugin = {
    ...base,
    id: OWNER,
    init(context) {
      const socialProviders = context.socialProviders.map((provider) => {
        if (provider.id !== 'google') return provider
        const getUserInfo = provider.getUserInfo.bind(provider)
        return {
          ...provider,
          async getUserInfo(...args: Parameters<typeof getUserInfo>) {
            const info = await getUserInfo(...args)
            const email = info?.user.email?.trim().toLowerCase()
            if (!info || !email || !info.user.emailVerified) return null
            const match = await context.internalAdapter.findUserByEmail(email, { includeAccounts: true })
            if (match && !match.accounts.some((linked) => linked.providerId === 'google')) {
              const subject = (info.data as { sub?: unknown }).sub
              if (typeof subject !== 'string' || !subject) return null
              await sendGoogleLink(context, deps, { email, userId: match.user.id, subject })
            }
            return info
          }
        }
      })

      return {
        context: { socialProviders },
        options: {
          databaseHooks: {
            user: {
              create: {
                after: async (created, endpoint) => {
                  if (created.isAnonymous || !endpoint?.path.startsWith('/callback/')) return
                  const session = endpoint ? await getSessionFromCtx(endpoint, { disableRefresh: true }) : null
                  await deps.trackSignup({ method: 'google', from_guest: session?.user.isAnonymous === true })
                }
              }
            }
          }
        }
      }
    }
  }
  runtimes.set(plugin, deps)
  return plugin
}

function responseRedirect(location: string, response?: Response, status = 303) {
  const headers = new Headers()
  response?.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie' && name.toLowerCase() !== 'content-length') headers.set(name, value)
  })
  for (const cookie of response?.headers.getSetCookie() ?? []) headers.append('Set-Cookie', cookie)
  headers.set('Location', location)
  // Every redirect here depends on the session or sets a cookie: no cache may keep it.
  headers.set('Cache-Control', 'private, no-store')
  return new Response(null, { status, headers })
}

function redirectToPath(path: string, response?: Response) {
  return responseRedirect(path, response)
}

function expiredLink(resend?: string, appOrigin = 'https://app.skyclause.m1ku.tech') {
  const url = new URL('/sign-in', appOrigin)
  url.searchParams.set('state', 'link-expired')
  if (resend) url.searchParams.set('resend', resend)
  return responseRedirect(`${url.pathname}${url.search}`)
}

function parseMagicValue(value: string | undefined): { email: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { type?: string; email?: string }
    return parsed.type === 'magic-link' && typeof parsed.email === 'string' ? { email: parsed.email } : null
  } catch {
    return null
  }
}

function parseGoogleLink(value: string | undefined): GoogleLinkValue | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as GoogleLinkValue
    return parsed.type === 'link_google' && parsed.email && parsed.userId && parsed.subject ? parsed : null
  } catch {
    return null
  }
}

async function confirmMagicLink(auth: AuthApiRuntime, request: Request, appOrigin: string, now: () => Date) {
  let body: { link?: unknown; resend?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return expiredLink(undefined, appOrigin)
  }
  const token = typeof body.link === 'string' ? body.link : ''
  const resend = typeof body.resend === 'string' && body.resend.length <= 128 ? body.resend : undefined
  const context = await auth.$context
  const [magicRow, googleRow, handleRow, metadataRow] = await Promise.all([
    context.internalAdapter.findVerificationValue(`${MAGIC}${token}`),
    context.internalAdapter.findVerificationValue(`${GOOGLE_LINK}${token}`),
    resend ? context.internalAdapter.findVerificationValue(`${HANDLE}${resend}`) : Promise.resolve(null),
    context.internalAdapter.findVerificationValue(`${MAGIC_META}${token}`)
  ])
  const handle = parseHandle(handleRow?.value)
  const currentTime = now()
  if (!token || !magicRow || magicRow.expiresAt <= currentTime || !handle || handleRow!.expiresAt <= currentTime)
    return expiredLink(resend, appOrigin)
  const magic = parseMagicValue(magicRow.value)
  if (!magic || handle.email.toLowerCase() !== magic.email.toLowerCase()) return expiredLink(resend, appOrigin)

  if (googleRow) {
    if (googleRow.expiresAt <= currentTime) return expiredLink(resend, appOrigin)
    const googleLink = parseGoogleLink(googleRow.value)
    if (!googleLink || googleLink.email.toLowerCase() !== handle.email.toLowerCase())
      return expiredLink(resend, appOrigin)
    const consumed = await context.internalAdapter.consumeVerificationValue(`${GOOGLE_LINK}${token}`)
    if (!consumed) return expiredLink(resend, appOrigin)
    const verified = await auth.api.magicLinkVerify({ query: { token }, headers: request.headers, asResponse: true })
    if (verified.status !== 200) return expiredLink(resend, appOrigin)
    const result = (await verified
      .clone()
      .json()
      .catch(() => null)) as { user?: { id?: string; email?: string }; session?: { token?: string } } | null
    if (result?.user?.id !== googleLink.userId || result.user.email?.toLowerCase() !== googleLink.email.toLowerCase()) {
      if (result?.session?.token) await context.internalAdapter.deleteSession(result.session.token)
      return expiredLink(resend, appOrigin)
    }
    try {
      const linked = await context.internalAdapter.findAccountByKey({
        providerId: 'google',
        accountId: googleLink.subject
      })
      if (linked && linked.userId !== googleLink.userId) throw new Error('Google account is already linked')
      if (!linked) {
        await context.internalAdapter.linkAccount({
          providerId: 'google',
          accountId: googleLink.subject,
          userId: googleLink.userId
        })
      }
    } catch {
      if (result.session?.token) await context.internalAdapter.deleteSession(result.session.token)
      return responseRedirect('/sign-in?state=google-failed')
    }
    return responseRedirect(continuePath(handle.next), verified)
  }

  const existing = await context.internalAdapter.findUserByEmail(magic.email, { includeAccounts: false })
  if (existing?.user.magicLinkEnabled === false) return expiredLink(resend, appOrigin)
  let verified: Response
  try {
    verified = await auth.api.magicLinkVerify({ query: { token }, headers: request.headers, asResponse: true })
  } catch {
    return expiredLink(resend, appOrigin)
  }
  if (verified.status !== 200) return expiredLink(resend, appOrigin)
  let fromGuest = handle.fromGuest
  try {
    const metadata = JSON.parse(metadataRow?.value ?? '') as { fromGuest?: unknown }
    if (typeof metadata.fromGuest === 'boolean') fromGuest = metadata.fromGuest
  } catch {
    // The signed, short-lived handle remains the fallback if an older or malformed metadata row is present.
  }
  await context.internalAdapter.consumeVerificationValue(`${MAGIC_META}${token}`)
  if (!existing) {
    const plugin = auth.options.plugins.find((entry) => entry.id === OWNER)
    const deps = plugin ? runtimes.get(plugin) : undefined
    await deps?.trackSignup({ method: 'magic_link', from_guest: fromGuest })
  }
  return responseRedirect(continuePath(handle.next, appOrigin), verified)
}

function continuePath(next: string | null, appOrigin = 'https://app.skyclause.m1ku.tech') {
  const url = new URL('/api/auth/continue', appOrigin)
  if (next) url.searchParams.set('next', next)
  return `${url.pathname}${url.search}`
}

async function resendMagicLink(auth: AuthApiRuntime, request: Request, now: () => Date) {
  let body: { resend?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ status: true })
  }
  const handle = typeof body.resend === 'string' && body.resend.length <= 128 ? body.resend : ''
  const context = await auth.$context
  const row = handle ? await context.internalAdapter.findVerificationValue(`${HANDLE}${handle}`) : null
  const value = parseHandle(row?.value)
  if (!row || row.expiresAt <= now() || !value || value.kind !== 'magic_link') return Response.json({ status: true })
  return auth.api.signInMagicLink({
    body: {
      email: value.email,
      ...(value.next ? { callbackURL: continuePath(value.next) } : {}),
      metadata: { resend: handle, ...(value.next ? { next: value.next } : {}) }
    },
    headers: request.headers,
    asResponse: true
  })
}

function validRelativeNext(value: string | null, appOrigin: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const resolved = new URL(value, appOrigin)
    return resolved.origin === new URL(appOrigin).origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : null
  } catch {
    return null
  }
}

/** apps/web's LANGUAGE_COOKIE: the saved language, which the web proxy puts in place of Accept-Language (LOC-1). */
export const LANGUAGE_COOKIE = 'skyclause-language'

/**
 * The account's saved language as the cookie this browser keeps, so pages render in it from the first one. An account
 * that never chose one clears it, so the browser's own language applies rather than the last account's.
 */
function languageCookie(preferences: unknown, appOrigin: string): string {
  const language = (preferences as { language?: unknown } | null | undefined)?.language
  const secure = new URL(appOrigin).protocol === 'https:' ? '; Secure' : ''
  return language === 'en' || language === 'ms'
    ? `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    : `${LANGUAGE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

async function continueSignIn(auth: AuthApiRuntime, request: Request, appOrigin: string) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return redirectToPath('/sign-in')
  const signedIn = (path: string) => {
    const response = redirectToPath(path)
    response.headers.append(
      'Set-Cookie',
      languageCookie((session.user as { preferences?: unknown }).preferences, appOrigin)
    )
    return response
  }
  const next = validRelativeNext(new URL(request.url).searchParams.get('next'), appOrigin)
  if (next) return signedIn(next)
  const memberships = await authDatabase()
    .select({ slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt))
    .limit(1)
  return signedIn(memberships[0] ? `/${memberships[0].slug}` : '/new')
}

function googleCallbackRedirect(response: Response, appOrigin: string) {
  const location = response.headers.get('Location')
  if (!location || response.status < 300 || response.status >= 400) return response
  const target = new URL(location, appOrigin)
  if (target.searchParams.has('error')) {
    const state = target.searchParams.get('error') === 'account_not_linked' ? 'link-pending' : 'google-failed'
    return responseRedirect(`/sign-in?state=${state}`, response)
  }
  if (target.origin !== new URL(appOrigin).origin) return responseRedirect('/sign-in?state=google-failed', response)
  return responseRedirect(`${target.pathname}${target.search}${target.hash}`, response)
}

/**
 * Better Auth's form CSRF check stops cross-site sign-in posts; these wrappers bypass its router, so they check here.
 * A post proves it came from the app by its Origin, or else by Sec-Fetch-Site; with neither it fails closed.
 */
function crossSite(request: Request, appOrigin: string) {
  const origin = request.headers.get('Origin')
  if (origin) return origin !== new URL(appOrigin).origin
  return request.headers.get('Sec-Fetch-Site') !== 'same-origin'
}

export async function authSignInHandler(
  authValue: unknown,
  request: Request,
  settings: { appOrigin: string }
): Promise<Response> {
  const auth = authValue as AuthApiRuntime
  const url = new URL(request.url)
  const pathname = url.pathname.startsWith('/api/auth/') ? url.pathname.slice('/api/auth'.length) : url.pathname
  const plugin = auth.options.plugins.find((entry) => entry.id === OWNER)
  const deps = plugin ? runtimes.get(plugin) : undefined
  const now = deps?.now ?? (() => new Date())
  if (request.method === 'POST' && ['/sign-in/email', '/sign-up/email'].includes(pathname)) {
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }
  if (
    request.method === 'POST' &&
    ['/magic-link/confirm', '/magic-link/resend'].includes(pathname) &&
    crossSite(request, settings.appOrigin)
  ) {
    return Response.json({ code: 'INVALID_ORIGIN', message: 'Invalid origin' }, { status: 403 })
  }
  if (pathname === '/magic-link/confirm' && request.method === 'POST') {
    return confirmMagicLink(auth, request, settings.appOrigin, now)
  }
  if (pathname === '/magic-link/resend' && request.method === 'POST') return resendMagicLink(auth, request, now)
  if (pathname === '/continue' && request.method === 'GET') return continueSignIn(auth, request, settings.appOrigin)
  const response = await auth.handler(request)
  return pathname === '/callback/google' ? googleCallbackRedirect(response, settings.appOrigin) : response
}
