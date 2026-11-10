// @vitest-environment node
import '@skyclause/auth/test/harness/database'
import { resolvePrincipal } from '@skyclause/auth'
import { createAuthWithStepUpEmail, makeAccount, signIn, TEST_AUTH_ENV } from '@skyclause/auth/testing'
import { asLogin } from '@skyclause/db/test/harness/index'
import { requireRecentAuth } from '@skyclause/api'
import { apiRequest, createTestApi, testDeps } from '@skyclause/api/testing'
import type { EmailTransport, SkyclauseRoute } from '@skyclause/contracts'
import { expect, test, vi } from 'vitest'

const APP = TEST_AUTH_ENV.APP_ORIGIN
const protectedRoute = {
  method: 'post',
  path: '/api/test/step-up',
  operationId: 'stepUpProtectedWrite',
  responses: { 200: { description: 'OK' } },
  'x-skyclause': { owner: 'test', statement: 'any', idempotent: false }
} as unknown as SkyclauseRoute
const api = createTestApi({
  api: [protectedRoute],
  deps: testDeps({ now: () => new Date() }),
  handlers: {
    stepUpProtectedWrite: {
      handler: (c: { json: (value: unknown, status: 200) => Response }) => c.json({ ok: true }, 200),
      middleware: [requireRecentAuth()]
    }
  }
}).api

function authRequest(
  auth: { handler: (request: Request) => Promise<Response> },
  path: string,
  body: unknown,
  cookie?: string
) {
  return auth.handler(
    new Request(`${APP}/api/auth${path}`, {
      method: 'POST',
      headers: {
        Origin: APP,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(body)
    })
  )
}

test('a 13-hour-old session passes requireRecentAuth after a session-bound magic-link step-up', async () => {
  const account = await makeAccount()
  const signedIn = await signIn(account.id)
  await asLogin('postgres', (client) =>
    client.query('UPDATE auth.session SET reauthenticated_at = $1 WHERE id = $2', [
      new Date(Date.now() - 13 * 60 * 60 * 1000),
      signedIn.sessionId
    ])
  )
  const emails: Parameters<EmailTransport['send']>[0][] = []
  const sendStepUpEmail = vi.fn(async (message: Parameters<EmailTransport['send']>[0]) => {
    emails.push(message)
    return { providerMessageId: 'test-message' }
  })
  const auth = createAuthWithStepUpEmail(sendStepUpEmail)
  const protectedWrite = async () => {
    const principal = await resolvePrincipal(
      new Request('https://api.skyclause.m1ku.tech/api/test/step-up', { headers: { Cookie: signedIn.cookie } }),
      { surface: 'api' }
    )
    if (!principal) throw new Error('The signed-in test session did not resolve')
    return apiRequest(api, { as: principal, method: 'POST', path: '/api/test/step-up' })
  }

  expect((await protectedWrite()).status).toBe(401)

  const sent = await authRequest(auth, '/step-up/magic-link', {}, signedIn.cookie)
  expect(sent.status).toBe(200)
  expect(sendStepUpEmail).toHaveBeenCalledOnce()
  expect(emails[0]?.to).toBe(account.email)
  const link = /https:\/\/[^\s]+/.exec(emails[0]?.text ?? '')?.[0]
  expect(link).toBeDefined()
  const token = new URL(link!).searchParams.get('link')!
  const confirmed = await authRequest(auth, '/step-up/magic-link/confirm', { token })

  expect(confirmed.status).toBe(200)
  expect((await protectedWrite()).status).toBe(200)
})
