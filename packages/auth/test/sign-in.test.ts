import { createMailbox } from '@skyclause/delivery/testing'
import { makeUser } from '@skyclause/db/test/factories/user'
import { asLogin } from '@skyclause/db/test/harness/index'
import { addMember, makeOrg, signIn, TEST_AUTH_ENV } from './harness'
import { authSettings, createAuth } from '../src/instance'
import { authSignInHandler, aAuthSignInApi } from '../src/plugins/a-auth-signin-api'
import { afterEach, expect, test, vi } from 'vitest'

const APP = TEST_AUTH_ENV.APP_ORIGIN
const GOOGLE = { clientId: 'test-google-client', clientSecret: 'test-google-secret' }
let nextClientIp = 20

function setup(now: () => Date = () => new Date()) {
  const mailbox = createMailbox()
  const clientIp = `198.51.100.${nextClientIp++}`
  const events: Array<{ method: string; from_guest: boolean }> = []
  const settings = authSettings(TEST_AUTH_ENV)
  const auth = createAuth(settings, {
    plugins: [
      aAuthSignInApi({
        email: mailbox,
        now,
        trackSignup: async (props) => {
          events.push(props)
        }
      })
    ],
    socialProviders: { google: GOOGLE }
  })
  const request = (method: string, path: string, body?: unknown, cookie?: string, forwardedFor = clientIp) =>
    authSignInHandler(
      auth,
      new Request(`${APP}/api/auth${path}`, {
        method,
        headers: {
          Origin: APP,
          'X-Forwarded-For': forwardedFor,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }),
      settings
    )
  return { auth, mailbox, events, request }
}

function linkFrom(text: string) {
  const link = text.match(/https:\/\/[^\s]+/)?.[0]
  if (!link) throw new Error('email has no sign-in link')
  return new URL(link)
}

const responseCookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0]!)
    .join('; ')

test('a magic link confirms once, redirects to continue, and the spent link can be resent', async () => {
  const { events, mailbox, request } = setup()
  const started = await request('POST', '/sign-in/magic-link', { email: 'once@example.test' })
  expect(started.status).toBe(200)
  expect(mailbox.sent).toMatchObject([{ to: 'once@example.test', from: 'auth' }])
  expect(mailbox.sent[0]!.text).toContain('MYT')
  const url = linkFrom(mailbox.sent[0]!.text)
  const token = url.searchParams.get('link')!
  const resend = url.searchParams.get('resend')!
  expect(url.pathname).toBe('/sign-in')
  expect(url.searchParams.has('email')).toBe(false)
  expect((await request('GET', `/magic-link/verify?token=${token}`)).status).toBe(404)

  const first = await request('POST', '/magic-link/confirm', { link: token, resend })
  expect(first.status).toBe(303)
  expect(new URL(first.headers.get('Location')!, APP).pathname).toBe('/api/auth/continue')
  expect(first.headers.getSetCookie().some((cookie) => cookie.includes('session_token'))).toBe(true)

  const second = await request('POST', '/magic-link/confirm', { link: token, resend })
  const expired = new URL(second.headers.get('Location')!, APP)
  expect(second.status).toBe(303)
  expect(expired.pathname).toBe('/sign-in')
  expect(expired.searchParams.get('state')).toBe('link-expired')
  expect(expired.searchParams.get('resend')).toBe(resend)
  expect(events).toEqual([{ method: 'magic_link', from_guest: false }])

  expect((await request('POST', '/magic-link/resend', { resend })).status).toBe(200)
  expect(mailbox.sent).toHaveLength(2)
})

test('a cross-site confirm or resend is refused and leaves the link usable', async () => {
  const { auth, mailbox, request } = setup()
  await request('POST', '/sign-in/magic-link', { email: 'csrf@example.test' })
  const url = linkFrom(mailbox.sent[0]!.text)
  const body = JSON.stringify({ link: url.searchParams.get('link'), resend: url.searchParams.get('resend') })
  const crossSite = (path: string, headers: Record<string, string>) =>
    authSignInHandler(
      auth,
      new Request(`${APP}/api/auth${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', ...headers },
        body
      }),
      authSettings(TEST_AUTH_ENV)
    )

  const foreign = await crossSite('/magic-link/confirm', { Origin: 'https://evil.example' })
  expect(foreign.status).toBe(403)
  expect(foreign.headers.getSetCookie()).toEqual([])
  const metadataOnly = await crossSite('/magic-link/confirm', { 'Sec-Fetch-Site': 'cross-site' })
  expect(metadataOnly.status).toBe(403)
  expect((await crossSite('/magic-link/resend', { Origin: 'https://evil.example' })).status).toBe(403)
  expect(mailbox.sent).toHaveLength(1)

  const confirmed = await request('POST', '/magic-link/confirm', JSON.parse(body))
  expect(new URL(confirmed.headers.get('Location')!, APP).pathname).toBe('/api/auth/continue')
})

test('a magic link expires after 15 minutes and leaves its resend handle live', async () => {
  let clock = new Date()
  const { mailbox, request } = setup(() => clock)
  await request('POST', '/sign-in/magic-link', { email: 'expired@example.test' })
  const url = linkFrom(mailbox.sent[0]!.text)
  clock = new Date(clock.getTime() + 15 * 60 * 1000 + 1000)
  const response = await request('POST', '/magic-link/confirm', {
    link: url.searchParams.get('link'),
    resend: url.searchParams.get('resend')
  })
  const location = new URL(response.headers.get('Location')!, APP)
  expect(response.status).toBe(303)
  expect(location.searchParams.get('state')).toBe('link-expired')
  expect(location.searchParams.get('resend')).toBe(url.searchParams.get('resend'))
})

test('magic-link-disabled accounts get an explanatory email with no link and the same HTTP reply', async () => {
  const { mailbox, request } = setup()
  await makeUser({ email: 'off@example.test', emailVerified: true, magicLinkEnabled: false })
  const off = await request('POST', '/sign-in/magic-link', { email: 'off@example.test' })
  const on = await request('POST', '/sign-in/magic-link', { email: 'new@example.test' })

  expect(off.status).toBe(on.status)
  expect(await off.json()).toEqual(await on.json())
  expect(mailbox.sent).toHaveLength(2)
  expect(mailbox.sent[0]!.text).toMatch(/magic-link sign-in is off/i)
  expect(mailbox.sent[0]!.text).not.toMatch(/https:\/\//)
  expect(mailbox.sent[1]!.text).toMatch(/https:\/\//)
})

test('new magic-link sign-ups track once without email and preserve whether the request came from a guest', async () => {
  const { auth, events, mailbox, request } = setup()
  const guest = await auth.api.signInAnonymous({ headers: new Headers({ Origin: APP }), asResponse: true })
  expect(guest.status).toBe(200)
  expect(events).toEqual([])
  await request('POST', '/sign-in/magic-link', { email: 'convert@example.test' }, responseCookies(guest))
  const url = linkFrom(mailbox.sent[0]!.text)
  const token = url.searchParams.get('link')!
  const tokenMetadata = await asLogin('postgres', (client) =>
    client.query('SELECT value FROM auth.verification WHERE identifier = $1', [`magic-link-meta:${token}`])
  )
  expect(JSON.parse(tokenMetadata.rows[0]!.value)).toEqual({ fromGuest: true })
  await request('POST', '/magic-link/confirm', {
    link: token,
    resend: url.searchParams.get('resend')
  })

  expect(events).toEqual([{ method: 'magic_link', from_guest: true }])
  const signedUp = await asLogin('postgres', (client) =>
    client.query('SELECT email, is_anonymous FROM auth.user WHERE email = $1', ['convert@example.test'])
  )
  expect(JSON.stringify(events)).not.toContain(signedUp.rows[0]!.email)
  expect(signedUp.rows[0]!.is_anonymous).toBe(false)
})

test('email and password endpoints stay disabled', async () => {
  const { request } = setup()
  expect((await request('POST', '/sign-up/email', { email: 'e@example.test', password: 'secret' })).status).toBe(404)
  expect((await request('POST', '/sign-in/email', { email: 'e@example.test', password: 'secret' })).status).toBe(404)
})

test('continue accepts only same-origin relative paths, then uses the earliest membership or /new', async () => {
  const { request } = setup()
  const accountUser = await makeUser({ email: 'continue@example.test', emailVerified: true })
  const session = await signIn(accountUser.id)

  const relative = await request('GET', '/continue?next=%2Fsettings%3Ftab%3Daccount', undefined, session.cookie)
  expect(relative.status).toBe(303)
  expect(relative.headers.get('Location')).toBe('/settings?tab=account')

  const absolute = await request('GET', '/continue?next=https%3A%2F%2Fevil.example', undefined, session.cookie)
  expect(absolute.headers.get('Location')).toBe('/new')
  const protocolRelative = await request('GET', '/continue?next=%2F%2Fevil.example', undefined, session.cookie)
  expect(protocolRelative.headers.get('Location')).toBe('/new')

  const first = await makeOrg({ slug: 'first-org' })
  const second = await makeOrg({ slug: 'second-org' })
  await addMember(first.id, accountUser.id, 'viewer')
  await addMember(second.id, accountUser.id, 'viewer')
  const home = await request('GET', '/continue', undefined, session.cookie)
  expect(home.headers.get('Location')).toBe('/first-org')
})

test('magic-link requests and resends enforce email and IP-hour limits with Retry-After', async () => {
  const { request } = setup()
  for (let attempt = 0; attempt < 5; attempt++) {
    expect((await request('POST', '/sign-in/magic-link', { email: 'limited@example.test' })).status).toBe(200)
  }
  const emailLimited = await request('POST', '/sign-in/magic-link', { email: 'limited@example.test' })
  expect(emailLimited.status).toBe(429)
  expect(emailLimited.headers.get('Retry-After')).toMatch(/^\d+$/)

  const { mailbox: ipMailbox, request: requestFromSameIp } = setup()
  let ipLimited: Response | undefined
  for (let attempt = 0; attempt < 20; attempt++) {
    ipLimited = await requestFromSameIp(
      'POST',
      '/sign-in/magic-link',
      { email: `ip-${attempt}@example.test` },
      undefined,
      `198.51.100.${attempt + 1}, 203.0.113.40`
    )
    expect(ipLimited.status).toBe(200)
  }
  ipLimited = await requestFromSameIp(
    'POST',
    '/sign-in/magic-link',
    { email: 'ip-over@example.test' },
    undefined,
    '198.51.100.99, 203.0.113.40'
  )
  expect(ipLimited.status).toBe(429)
  expect(ipLimited.headers.get('Retry-After')).toMatch(/^\d+$/)
  expect(
    (
      await requestFromSameIp(
        'POST',
        '/sign-in/magic-link',
        { email: 'different-ip@example.test' },
        undefined,
        '198.51.100.1, 203.0.113.41'
      )
    ).status
  ).toBe(200)
  expect(ipMailbox.sent).toHaveLength(21)

  const { mailbox, request: resendRequest } = setup()
  await resendRequest('POST', '/sign-in/magic-link', { email: 'resend-limited@example.test' })
  const url = linkFrom(mailbox.sent[0]!.text)
  const resend = url.searchParams.get('resend')!
  for (let attempt = 0; attempt < 4; attempt++) {
    expect((await resendRequest('POST', '/magic-link/resend', { resend })).status).toBe(200)
  }
  const resendLimited = await resendRequest('POST', '/magic-link/resend', { resend })
  expect(resendLimited.status).toBe(429)
  expect(resendLimited.headers.get('Retry-After')).toMatch(/^\d+$/)
})

async function googleCallback(
  request: ReturnType<typeof setup>['request'],
  o: { email: string; subject: string; verified: boolean }
) {
  const start = await request('POST', '/sign-in/social', { provider: 'google', callbackURL: '/api/auth/continue' })
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')!
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const idToken = [
    encode({ alg: 'none' }),
    encode({ sub: o.subject, email: o.email, email_verified: o.verified, name: 'Test Account' }),
    ''
  ].join('.')
  const original = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const target = input instanceof Request ? input.url : String(input)
    if (target === 'https://oauth2.googleapis.com/token') {
      return Promise.resolve(Response.json({ access_token: 'test-access', id_token: idToken, expires_in: 3600 }))
    }
    return original(input, init)
  })
  const callback = await request(
    'GET',
    `/callback/google?state=${encodeURIComponent(state)}&code=test-code`,
    undefined,
    responseCookies(start)
  )
  vi.restoreAllMocks()
  return callback
}

test('Google creates a new verified account and tracks the method', async () => {
  const { events, request } = setup()
  const callback = await googleCallback(request, {
    email: 'google-new@example.test',
    subject: 'google-sub-new',
    verified: true
  })
  expect(callback.status).toBe(303)
  expect(new URL(callback.headers.get('Location')!, APP).pathname).toBe('/api/auth/continue')
  expect(callback.headers.getSetCookie().some((cookie) => cookie.includes('session_token'))).toBe(true)
  expect(events).toEqual([{ method: 'google', from_guest: false }])
  const created = await asLogin('postgres', (client) =>
    client.query('SELECT email_verified FROM auth.user WHERE email = $1', ['google-new@example.test'])
  )
  expect(created.rows[0]?.email_verified).toBe(true)
})

test('[better-auth 1.7.17] a Google email match is not linked until magic-link confirmation', async () => {
  const { mailbox, request, events } = setup()
  const existing = await makeUser({ email: 'google-match@example.test', emailVerified: true })
  const callback = await googleCallback(request, {
    email: existing.email,
    subject: 'google-sub-match',
    verified: true
  })
  const pending = new URL(callback.headers.get('Location')!, APP)
  expect(callback.status).toBe(303)
  expect(pending.searchParams.get('state')).toBe('link-pending')
  expect(callback.headers.getSetCookie().join(';')).not.toMatch(/session_token/)
  const before = await asLogin('postgres', (client) =>
    client.query('SELECT provider_id, account_id FROM auth.account WHERE user_id = $1', [existing.id])
  )
  expect(before.rows).toEqual([])
  expect(events).toEqual([])

  const confirmUrl = linkFrom(mailbox.sent[0]!.text)
  expect(mailbox.sent[0]!.text).toContain('MYT')
  const confirmed = await request('POST', '/magic-link/confirm', {
    link: confirmUrl.searchParams.get('link'),
    resend: confirmUrl.searchParams.get('resend')
  })
  expect(confirmed.status).toBe(303)
  expect(new URL(confirmed.headers.get('Location')!, APP).pathname).toBe('/api/auth/continue')
  const after = await asLogin('postgres', (client) =>
    client.query('SELECT provider_id, account_id FROM auth.account WHERE user_id = $1', [existing.id])
  )
  expect(after.rows).toEqual([{ provider_id: 'google', account_id: 'google-sub-match' }])
})

test('Google refuses an unverified email', async () => {
  const { mailbox, request } = setup()
  const callback = await googleCallback(request, {
    email: 'google-unverified@example.test',
    subject: 'google-sub-unverified',
    verified: false
  })
  expect(callback.status).toBe(303)
  expect(new URL(callback.headers.get('Location')!, APP).searchParams.get('state')).toBe('google-failed')
  expect(mailbox.sent).toEqual([])
  const rows = await asLogin('postgres', (client) =>
    client.query('SELECT id FROM auth.user WHERE email = $1', ['google-unverified@example.test'])
  )
  expect(rows.rows).toEqual([])
})

test('Google provider errors redirect to the failed sign-in state', async () => {
  const { request } = setup()
  const started = await request('POST', '/sign-in/social', {
    provider: 'google',
    callbackURL: '/api/auth/continue'
  })
  const { url } = (await started.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')!
  const callback = await request(
    'GET',
    `/callback/google?state=${encodeURIComponent(state)}&error=access_denied`,
    undefined,
    responseCookies(started)
  )
  expect(callback.status).toBe(303)
  expect(new URL(callback.headers.get('Location')!, APP).searchParams.get('state')).toBe('google-failed')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
