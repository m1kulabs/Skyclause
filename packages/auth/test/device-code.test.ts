import { asLogin, databaseNow } from '@skyclause/db/test/harness/index'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { resolvePrincipal } from '../src/principal'
import { deviceAuthorizationPageData } from '../src/pages'
import { addMember, makeAccount, makeOrg, signIn, TEST_AUTH_ENV, type TestSession } from './harness'
import { getAuth } from '../src/instance'

const APP = TEST_AUTH_ENV.APP_ORIGIN
const auth = () => getAuth().auth

function call(
  method: string,
  path: string,
  body?: unknown,
  options: { cookie?: string; ua?: string; ip?: string } = {}
) {
  return auth().handler(
    new Request(`${APP}/api/auth${path}`, {
      method,
      headers: {
        Origin: APP,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.ua ? { 'User-Agent': options.ua } : {}),
        ...(options.ip ? { 'X-Forwarded-For': options.ip } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
  )
}

async function startDevice(options: { ua?: string; ip?: string } = {}) {
  const response = await call('POST', '/device/code', { client_id: 'skyclause-cli', scope: 'openid' }, options)
  const json = await response.json()
  return {
    response,
    json: json as {
      device_code: string
      user_code: string
      verification_uri_complete: string
      expires_in: number
      interval: number
    }
  }
}

async function token(deviceCode: string) {
  return call('POST', '/device/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: 'skyclause-cli'
  })
}

let account: { id: string }
let memberSession: TestSession
let reauthenticatedAt: Date

beforeAll(async () => {
  const organization = await makeOrg()
  account = await makeAccount()
  await addMember(organization.id, account.id, 'admin')
  memberSession = await signIn(account.id)
  reauthenticatedAt = new Date(Date.now() - 15_000)
  await asLogin('postgres', (client) =>
    client.query('UPDATE auth.session SET reauthenticated_at = $1 WHERE id = $2', [
      reauthenticatedAt,
      memberSession.sessionId
    ])
  )
})

afterEach(() => {
  vi.useRealTimers()
})

test('only the Skyclause CLI can request a device code, and the route is enabled', async () => {
  const denied = await call('POST', '/device/code', { client_id: 'other-client' })
  expect(denied.status).toBe(400)
  expect(await denied.json()).toMatchObject({ error: 'invalid_client' })

  const started = await startDevice({ ip: '198.51.100.41' })
  expect(started.response.status).toBe(200)
  expect(started.json.verification_uri_complete).toContain('/device?user_code=')
  expect(started.json).toMatchObject({ expires_in: 600, interval: 5 })
})

test('a pending device can be denied and its token poll returns access_denied', async () => {
  const { json } = await startDevice({ ip: '198.51.100.42' })
  expect(await deviceAuthorizationPageData(json.user_code, account.id)).toMatchObject({ state: 'ready', userAgent: '' })
  const claim = await call('GET', `/device?user_code=${json.user_code}`, undefined, { cookie: memberSession.cookie })
  expect(claim.status).toBe(200)
  expect(await claim.json()).toMatchObject({ client_id: 'skyclause-cli', status: 'pending' })

  const denied = await call('POST', '/device/deny', { userCode: json.user_code }, { cookie: memberSession.cookie })
  expect(denied.status).toBe(200)
  expect(await deviceAuthorizationPageData(json.user_code, account.id)).toMatchObject({ state: 'denied' })
  const response = await token(json.device_code)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: 'access_denied' })
  expect(await deviceAuthorizationPageData(json.user_code, account.id)).toMatchObject({ state: 'denied' })
})

test('a confirmed device issues a CLI bearer with the confirmer authentication time and tracks one OS-only login', async () => {
  // Analytics timestamps come from PostgreSQL even when the application clock is ahead.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 60_000)
  const startedAt = await databaseNow()
  const { json } = await startDevice({ ua: 'skyclause-cli/1.0.0 (darwin; Work laptop)', ip: '198.51.100.43' })
  expect(
    await deviceAuthorizationPageData(
      `${json.user_code.slice(0, 4).toLowerCase()}-${json.user_code.slice(4).toLowerCase()}`,
      account.id
    )
  ).toMatchObject({
    state: 'ready',
    userAgent: 'skyclause-cli/1.0.0 (darwin; Work laptop)',
    memberships: [{ role: 'admin' }]
  })
  await call('GET', `/device?user_code=${json.user_code}`, undefined, { cookie: memberSession.cookie })

  const pending = await token(json.device_code)
  expect(pending.status).toBe(400)
  expect(await pending.json()).toMatchObject({ error: 'authorization_pending' })
  await call('POST', '/device/approve', { userCode: json.user_code }, { cookie: memberSession.cookie })

  const fast = await token(json.device_code)
  expect(fast.status).toBe(400)
  expect(await fast.json()).toMatchObject({ error: 'slow_down' })
  vi.setSystemTime(Date.now() + 5_000)
  const issued = await token(json.device_code)
  expect(issued.status).toBe(200)
  const { access_token: accessToken, token_type: tokenType } = (await issued.json()) as {
    access_token: string
    token_type: string
  }
  expect(tokenType).toBe('Bearer')
  const principal = await resolvePrincipal(
    new Request(`${APP}/api/me/preferences`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    { surface: 'api' }
  )
  expect(principal).toMatchObject({
    kind: 'session',
    via: 'bearer',
    client: 'cli',
    accountId: account.id,
    authenticatedAt: reauthenticatedAt
  })
  expect(await deviceAuthorizationPageData(json.user_code, account.id)).toMatchObject({
    state: 'done',
    userAgent: 'skyclause-cli/1.0.0 (darwin; Work laptop)',
    memberships: [{ role: 'admin' }]
  })

  const events = await asLogin('postgres', (client) =>
    client.query('SELECT props FROM public.analytics_event WHERE name = $1 AND at >= $2', ['cli_login', startedAt])
  )
  const matching = events.rows.filter((row) => JSON.stringify(row.props) === JSON.stringify({ os: 'macos' }))
  expect(matching).toHaveLength(1)

  const { revokeSession } = await import('./harness')
  await revokeSession(accessToken)
  await expect(
    resolvePrincipal(
      new Request(`${APP}/api/me/preferences`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      { surface: 'api' }
    )
  ).resolves.toBeNull()
})

test('a code without a user agent still completes with the explicit unknown OS analytics value', async () => {
  const startedAt = await databaseNow()
  const { json } = await startDevice({ ip: '198.51.100.45' })
  const stored = await asLogin('postgres', (client) =>
    client.query('SELECT value, expires_at FROM auth.verification WHERE identifier = $1', [
      `device-user-code:${json.user_code}`
    ])
  )
  expect(stored.rows[0]?.value).toBe('')
  expect(Math.abs(new Date(stored.rows[0]!.expires_at).getTime() - Date.now() - 10 * 60_000)).toBeLessThan(2_000)

  const pastedCode = `${json.user_code.slice(0, 4).toLowerCase()}-${json.user_code.slice(4).toLowerCase()}`
  const claim = await call('GET', `/device?user_code=${pastedCode}`, undefined, { cookie: memberSession.cookie })
  expect(claim.status).toBe(200)
  await call('POST', '/device/approve', { userCode: pastedCode }, { cookie: memberSession.cookie })
  const issued = await token(json.device_code)
  expect(issued.status).toBe(200)

  const events = await asLogin('postgres', (client) =>
    client.query('SELECT props FROM public.analytics_event WHERE name = $1 AND at >= $2', ['cli_login', startedAt])
  )
  expect(events.rows.map((row) => row.props)).toEqual([{ os: 'unknown' }])
})

test('an expired code is rejected by both the verification endpoint and token endpoint at 10 minutes 1 second', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date())
  const { json } = await startDevice({ ua: 'skyclause-cli/1.0.0 (linux; Dev box)', ip: '198.51.100.44' })
  vi.setSystemTime(Date.now() + 10 * 60_000 + 1_000)

  const page = await call('GET', `/device?user_code=${json.user_code}`, undefined, { cookie: memberSession.cookie })
  expect(page.status).toBe(400)
  expect(await page.json()).toMatchObject({ error: 'expired_token' })
  expect(await deviceAuthorizationPageData(json.user_code, account.id)).toMatchObject({ state: 'expired' })
  const polled = await token(json.device_code)
  expect(polled.status).toBe(400)
  expect(await polled.json()).toMatchObject({ error: 'expired_token' })
})

test('device code requests are capped at ten per IP in an hour', async () => {
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
  for (let count = 0; count < 10; count++) {
    const response = await call('POST', '/device/code', { client_id: 'skyclause-cli' }, { ip })
    expect(response.status, `request ${count + 1}`).toBe(200)
  }
  const limited = await call('POST', '/device/code', { client_id: 'skyclause-cli' }, { ip })
  expect(limited.status).toBe(429)
})
