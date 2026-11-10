// D42: each Better Auth unknown in TRD "Not verified" and "Technical risks", proved on the installed version. Every
// test names the version it ran on.
import { createHash } from 'node:crypto'
import { apiKey } from '@better-auth/api-key'
import { asLogin } from '@skyclause/db/test/harness/index'
import { anonymous } from 'better-auth/plugins'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { authSettings, createAuth, getAuth } from '../src/instance'
import { resolvePrincipal } from '../src/principal'
import { addMember, makeAccount, makeApiKey, makeOrg, TEST_AUTH_ENV } from './harness'

const VERSION = '1.7.17'
const named = (title: string) => `[better-auth ${VERSION}] ${title}`
const APP = TEST_AUTH_ENV.APP_ORIGIN

let key: { id: string; key: string }
beforeAll(async () => {
  const org = await makeOrg()
  const account = await makeAccount()
  await addMember(org.id, account.id, 'admin')
  key = await makeApiKey({ orgId: org.id, accountId: account.id, scopes: ['read'] })
})
afterEach(() => vi.restoreAllMocks())

const sessions = () =>
  asLogin('postgres', async (client) => Number((await client.query('SELECT count(*) FROM auth.session')).rows[0].count))
const post = (auth: { handler: (r: Request) => Promise<Response> }, path: string, body: unknown, cookie?: string) =>
  auth.handler(
    new Request(`${APP}/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body)
    })
  )
/** The `name=value` pairs a response sets, as a request's Cookie header. */
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')

test(named('every installed plugin and package is the pinned version'), () => {
  const plugins = Object.fromEntries(getAuth().auth.options.plugins.map((plugin) => [plugin.id, plugin.version]))
  expect(plugins).toEqual({
    'a-auth-signin-api': VERSION,
    organization: VERSION,
    anonymous: VERSION,
    'api-key': VERSION,
    passkey: VERSION,
    'device-authorization': VERSION,
    bearer: VERSION,
    jwt: VERSION,
    'oauth-provider': VERSION,
    cimd: VERSION
  })
})

test(named('API keys are stored as their SHA-256, never in plaintext'), async () => {
  const rows = await asLogin('postgres', (client) => client.query('SELECT * FROM auth.apikey WHERE id = $1', [key.id]))
  expect(rows.rows[0].key).toBe(createHash('sha256').update(key.key).digest('base64url'))
  const dump = await asLogin('postgres', async (client) =>
    JSON.stringify((await client.query('SELECT to_jsonb(a) FROM auth.apikey a')).rows)
  )
  expect(dump).not.toContain(key.key)
  expect(dump).not.toContain(key.key.slice(12))
})

test(named('the disabled per-key limit still records lastRequest when verifyApiKey accepts a key'), async () => {
  const before = await asLogin('postgres', (client) =>
    client.query<{ rate_limit_enabled: boolean; last_request: Date | null }>(
      'SELECT rate_limit_enabled, last_request FROM auth.apikey WHERE id = $1',
      [key.id]
    )
  )
  expect(before.rows[0]).toMatchObject({ rate_limit_enabled: false, last_request: null })

  expect(
    await resolvePrincipal(new Request(`${APP}/v1/me`, { headers: { Authorization: `Bearer ${key.key}` } }), {
      surface: 'v1'
    })
  ).toMatchObject({ kind: 'api_key' })

  const after = await asLogin('postgres', (client) =>
    client.query<{ rate_limit_enabled: boolean; last_request: Date | null }>(
      'SELECT rate_limit_enabled, last_request FROM auth.apikey WHERE id = $1',
      [key.id]
    )
  )
  expect(after.rows[0]?.rate_limit_enabled).toBe(false)
  expect(after.rows[0]?.last_request).toBeInstanceOf(Date)
})

test(named('the plugin reads x-api-key; Skyclause reads keys only from Authorization: Bearer'), async () => {
  // Turned on, the plugin's session hook picks the key up from x-api-key alone, then refuses an organisation key.
  const sessionKeys = createAuth(authSettings(), {
    plugins: [apiKey({ references: 'organization', defaultPrefix: 'skc_', enableSessionForAPIKeys: true })]
  })
  const read = (headers: Record<string, string>) =>
    sessionKeys.api.getSession({ headers: new Headers(headers) }).then(
      () => 'ignored',
      (error: { status?: string }) => error.status
    )
  expect(await read({ 'x-api-key': key.key })).toBe('UNAUTHORIZED')
  expect(await read({ Authorization: `Bearer ${key.key}` })).toBe('ignored')

  const resolve = (headers: Record<string, string>) =>
    resolvePrincipal(new Request(`${APP}/v1/me`, { headers }), { surface: 'v1' })
  expect(await resolve({ Authorization: `Bearer ${key.key}` })).toMatchObject({ kind: 'api_key' })
  expect(await resolve({ 'x-api-key': key.key })).toBeNull()
})

test(named('an API key never creates a session'), async () => {
  const before = await sessions()
  for (const headers of [{ 'x-api-key': key.key }, { Authorization: `Bearer ${key.key}` }] as Record<
    string,
    string
  >[]) {
    expect(await getAuth().auth.api.getSession({ headers: new Headers(headers) })).toBeNull()
    await resolvePrincipal(new Request(`${APP}/v1/me`, { headers }), { surface: 'v1' })
  }
  expect(await sessions()).toBe(before)
})

test(
  named('the Drizzle adapter writes the auth schema, with the database’s UUIDv7 IDs and host-only cookies'),
  async () => {
    // The anonymous plugin's HTTP path is off until #182 replaces it (endpoints.test.ts); the server's call writes alike.
    const response = await getAuth().auth.api.signInAnonymous({ headers: new Headers(), asResponse: true })
    expect(response.status).toBe(200)
    const { user } = (await response.json()) as { user: { id: string } }
    const found = await asLogin('postgres', (client) =>
      client.query(
        `SELECT uuid_extract_version(u.id) AS version, to_regclass('public.user') AS public_user,
         (SELECT uuid_extract_version(s.id) FROM auth.session s WHERE s.user_id = u.id) AS session_version
       FROM auth.user u WHERE u.id = $1`,
        [user.id]
      )
    )
    expect(found.rows).toEqual([{ version: 7, public_user: null, session_version: 7 }])
    // #79 §4: host-only on APP_ORIGIN, so no Domain attribute; Secure, with the __Secure- prefix, over https.
    const session = response.headers.getSetCookie().find((cookie) => cookie.includes('session_token='))!
    expect(session).toMatch(/^__Secure-better-auth\.session_token=/)
    expect(session).toMatch(/; Secure/i)
    expect(session).toMatch(/; HttpOnly/i)
    expect(session).not.toMatch(/; Domain=/i)
  }
)

test(named('onLinkAccount runs after a Google sign-in from a guest session'), async () => {
  const onLinkAccount = vi.fn()
  const google = { clientId: 'test-client-id', clientSecret: 'test-client-secret' }
  // Only this test configures the hook and Google; #180, #182 and #97 own them in production.
  const auth = createAuth(authSettings(), { plugins: [anonymous({ onLinkAccount })], socialProviders: { google } })
  const guest = await post(auth, '/sign-in/anonymous', {})
  const { user: anonymousUser } = (await guest.json()) as { user: { id: string } }

  const start = await post(auth, '/sign-in/social', { provider: 'google', callbackURL: '/' }, cookiesOf(guest))
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')!

  // The test OAuth provider: Google's token endpoint answers with an ID token for a new address.
  const idToken = [{ alg: 'none' }, { sub: 'google-sub-1', email: 'linked@example.test', email_verified: true }]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.')
  const fetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const target = input instanceof Request ? input.url : String(input)
    if (target !== 'https://oauth2.googleapis.com/token') return fetch(input, init)
    return Promise.resolve(Response.json({ access_token: 'test-access', id_token: `${idToken}.`, expires_in: 3600 }))
  })

  const callback = await auth.handler(
    new Request(`${APP}/api/auth/callback/google?state=${state}&code=test-code`, {
      headers: { Cookie: `${cookiesOf(guest)}; ${cookiesOf(start)}` }
    })
  )
  expect(callback.status, await callback.clone().text()).toBe(302)
  expect(onLinkAccount).toHaveBeenCalledOnce()
  const [{ anonymousUser: linked, newUser }] = onLinkAccount.mock.calls[0]!
  expect(linked.user.id).toBe(anonymousUser.id)
  expect(newUser.user.email).toBe('linked@example.test')
})
