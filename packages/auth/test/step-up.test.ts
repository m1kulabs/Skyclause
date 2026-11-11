import { expect, onTestFinished, test, vi } from 'vitest'
import { SesError } from '@skyclause/delivery'
import { authSettings, createAuth, getAuth } from '../src/instance'
import { asLogin } from '@skyclause/db/test/harness/index'
import { passkey as passkeyRecord } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { aStepUp } from '../src/plugins/a-step-up'
import { makeAccount, signIn, TEST_AUTH_ENV } from './harness'

const APP = TEST_AUTH_ENV.APP_ORIGIN

test('the passkey registration endpoints include the recent-session guard', () => {
  const plugin = aStepUp({ appOrigin: APP, ipHashKey: 'k'.repeat(48) })
  const endpoint = plugin.endpoints?.generatePasskeyRegistrationOptions
  expect(endpoint?.options.use).toHaveLength(4)
})

function request(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
  auth = getAuth().auth,
  ip = '192.0.2.1',
  headers: Record<string, string> = {}
) {
  return auth.handler(
    new Request(`${APP}/api/auth${path}`, {
      method,
      headers: {
        Origin: APP,
        'X-Forwarded-For': ip,
        ...headers,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  )
}

test('step-up status reports freshness and whether this account has a passkey', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)

  const response = await request('GET', '/step-up', session.cookie)
  const current = await getAuth().auth.api.getSession({ headers: new Headers({ Cookie: session.cookie }) })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ fresh_until: expect.any(String), passkey: false })
  expect(current?.session.reauthenticatedAt).toBeInstanceOf(Date)
})

test('step-up status requires the requesting session', async () => {
  expect((await request('GET', '/step-up')).status).toBe(401)
})

test('passkey registration options use the app RP and require a session and user verification', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const anonymous = await request('GET', '/passkey/generate-register-options')
  const response = await request('GET', '/passkey/generate-register-options', session.cookie)

  expect(anonymous.status).toBe(401)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    rp: { id: new URL(APP).hostname, name: 'Skyclause' },
    authenticatorSelection: { userVerification: 'required' }
  })
})

test('adding a passkey requires recent auth and the step-up email makes registration available again', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  await asLogin('postgres', (client) =>
    client.query('UPDATE auth.session SET reauthenticated_at = $1 WHERE id = $2', [
      new Date(Date.now() - 13 * 60 * 60 * 1000),
      session.sessionId
    ])
  )
  const staleTimestamp = await asLogin('postgres', (client) =>
    client.query<{ reauthenticated_at: Date }>('SELECT reauthenticated_at FROM auth.session WHERE id = $1', [
      session.sessionId
    ])
  )
  expect(staleTimestamp.rows[0]?.reauthenticated_at.getTime()).toBeLessThan(Date.now() - 12 * 60 * 60 * 1000)
  const emails: Array<{ text: string }> = []
  const auth = createAuth(authSettings(), {
    sendStepUpEmail: async (message) => {
      emails.push(message)
      return { providerMessageId: 'test-message' }
    }
  })
  const status = await request('GET', '/step-up', session.cookie, undefined, auth)
  const statusBody = (await status.json()) as { fresh_until: string }
  expect(Date.parse(statusBody.fresh_until)).toBeLessThan(Date.now())

  const staleRegistration = await request('GET', '/passkey/generate-register-options', session.cookie, undefined, auth)
  expect(staleRegistration.status).toBe(401)
  expect(await staleRegistration.json()).toMatchObject({ code: 'reauth-required' })

  const sent = await request('POST', '/step-up/magic-link', session.cookie, {}, auth)
  expect(sent.status).toBe(200)
  const link = /https:\/\/[^\s]+/.exec(emails[0]?.text ?? '')?.[0]
  const token = new URL(link!).searchParams.get('link')!
  const confirmed = await request('POST', '/step-up/magic-link/confirm', undefined, { token }, auth)
  const freshRegistration = await request('GET', '/passkey/generate-register-options', session.cookie, undefined, auth)

  expect(confirmed.status).toBe(200)
  expect(freshRegistration.status).toBe(200)
})

test('magic-link step-up confirms the bound session once, even without that session cookie', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const sent: Array<{ to: string; text: string }> = []
  const sendStepUpEmail = vi.fn(async (message: { to: string; text: string }) => {
    sent.push(message)
    return { providerMessageId: 'test-message' }
  })
  const auth = createAuth(authSettings(), { sendStepUpEmail })

  const sentResponse = await request('POST', '/step-up/magic-link', session.cookie, {}, auth)

  expect(sentResponse.status).toBe(200)
  expect(sendStepUpEmail).toHaveBeenCalledOnce()
  expect(sent[0]?.to).toBe(account.email)
  const link = /https:\/\/[^\s]+/.exec(sent[0]?.text ?? '')?.[0]
  expect(link).toBeDefined()
  const linkUrl = new URL(link!)
  expect(linkUrl.pathname).toBe('/sign-in')
  expect(linkUrl.searchParams.get('for')).toBe('step-up')
  const token = linkUrl.searchParams.get('link')!

  const confirmed = await request('POST', '/step-up/magic-link/confirm', undefined, { token }, auth)
  const usedAgain = await request('POST', '/step-up/magic-link/confirm', undefined, { token }, auth)
  const current = await getAuth().auth.api.getSession({ headers: new Headers({ Cookie: session.cookie }) })

  expect(confirmed.status).toBe(200)
  expect(usedAgain.status).toBe(303)
  expect(new URL(usedAgain.headers.get('Location')!, APP).search).toBe('?state=link-expired&for=step-up')
  expect(current?.session.reauthenticatedAt).toBeInstanceOf(Date)
})

test('a step-up email SES refuses is one structured ERROR line naming SES and its status, answered 502', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const denied = Object.assign(new Error('Email address is not verified.'), {
    name: 'MessageRejected',
    $metadata: { httpStatusCode: 400 }
  })
  const auth = createAuth(authSettings(), {
    sendStepUpEmail: async () => {
      throw new SesError('SendEmail', denied)
    }
  })
  const lines: unknown[][] = []
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void lines.push(args))
  }
  onTestFinished(() => {
    vi.restoreAllMocks()
  })

  // Its own IP, so the shared 192.0.2.1 bucket the other tests count on stays as it was.
  const response = await request('POST', '/step-up/magic-link', session.cookie, {}, auth, '198.51.100.60')

  expect(response.status).toBe(502)
  expect(lines).toHaveLength(1)
  expect(lines[0]).toHaveLength(1)
  expect(JSON.parse(String(lines[0]![0]))).toMatchObject({
    severity: 'ERROR',
    message: 'SES SendEmail failed: MessageRejected (HTTP 400)',
    code: 'MessageRejected',
    status: 400,
    category: 'step-up'
  })
})

test('an expired step-up link redirects to the sign-in expired-link state', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const sent: Array<{ text: string }> = []
  const auth = createAuth(authSettings(), {
    sendStepUpEmail: async (message) => {
      sent.push(message)
      return { providerMessageId: 'test-message' }
    }
  })
  await request('POST', '/step-up/magic-link', session.cookie, {}, auth)
  await asLogin('postgres', (client) =>
    client.query(
      "UPDATE auth.verification SET expires_at = now() - interval '1 second' WHERE identifier LIKE 'step-up:magic-link:%' AND value LIKE $1",
      [`%${session.sessionId}%`]
    )
  )
  const link = /https:\/\/[^\s]+/.exec(sent[0]?.text ?? '')?.[0]
  const token = new URL(link!).searchParams.get('link')!

  const response = await request('POST', '/step-up/magic-link/confirm', undefined, { token }, auth)

  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe(`${APP}/sign-in?state=link-expired&for=step-up`)
})

test('step-up email sends are capped at ten per account in one hour', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const sendStepUpEmail = vi.fn(async () => ({ providerMessageId: 'test-message' }))
  const auth = createAuth(authSettings(), { sendStepUpEmail })
  const responses = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      request('POST', '/step-up/magic-link', session.cookie, {}, auth, `203.0.113.${index + 1}`)
    )
  )

  expect(responses.map(({ status }) => status).sort()).toEqual([...Array(10).fill(200), 429].sort())
  expect(sendStepUpEmail).toHaveBeenCalledTimes(10)
})

test('step-up email sends are capped at ten per hashed IP in one hour', async () => {
  const sendStepUpEmail = vi.fn(async () => ({ providerMessageId: 'test-message' }))
  const auth = createAuth(authSettings(), { sendStepUpEmail })
  const accounts = await Promise.all(Array.from({ length: 11 }, () => makeAccount()))
  const responses = await Promise.all(
    accounts.map(async (account) => {
      const session = await signIn(account.id)
      return request('POST', '/step-up/magic-link', session.cookie, {}, auth, '198.51.100.50')
    })
  )

  expect(responses.filter(({ status }) => status === 200)).toHaveLength(10)
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(1)
  expect(sendStepUpEmail).toHaveBeenCalledTimes(10)
})

test('spoofed IP headers cannot bypass the confirmation limit behind Cloud Run', async () => {
  const responses = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      request(
        'POST',
        '/step-up/magic-link/confirm',
        undefined,
        { token: 'invalid-token' },
        getAuth().auth,
        `192.0.2.${index + 1}, 198.51.100.70`,
        { 'cf-connecting-ip': `203.0.113.${index + 1}`, 'x-real-ip': `192.0.2.${index + 1}` }
      )
    )
  )

  expect(responses.filter(({ status }) => status === 303)).toHaveLength(10)
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(1)
})

test('passkey assertion options are capped at ten per account in one hour', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const responses = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      request('POST', '/step-up/passkey/options', session.cookie, {}, getAuth().auth, `192.0.2.${index + 1}`)
    )
  )

  expect(responses.filter(({ status }) => status === 401)).toHaveLength(10)
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(1)
})

test('passkey assertion options require user verification and use stored credentials', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const credentialID = Buffer.from('test-credential').toString('base64url')
  await authDatabase()
    .insert(passkeyRecord)
    .values({
      userId: account.id,
      publicKey: Buffer.from('test-public-key').toString('base64url'),
      credentialID,
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      transports: 'internal'
    })

  const response = await request('POST', '/step-up/passkey/options', session.cookie, {})

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    options: { userVerification: 'required', allowCredentials: [{ id: credentialID }] }
  })
})

test('passkey assertion verifications are capped at ten per account in one hour', async () => {
  const account = await makeAccount()
  const session = await signIn(account.id)
  const responses = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      request(
        'POST',
        '/step-up/passkey/verify',
        session.cookie,
        { response: { id: 'not-registered' } },
        getAuth().auth,
        `192.0.2.${index + 1}`
      )
    )
  )

  expect(responses.filter(({ status }) => status === 401)).toHaveLength(10)
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(1)
})
