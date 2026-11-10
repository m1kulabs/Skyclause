// #79 §7's plugin registry: a base plugin's own HTTP endpoints stay off under /api/auth/* until its owner's plugin
// replaces it, so Better Auth's defaults can't sign anyone in, create an organisation or a key, or register an OAuth
// client past the routes and checks those tickets build. The server still calls them through `auth.api`.
import { anonymous } from 'better-auth/plugins'
import { expect, test } from 'vitest'
import { authSettings, createAuth, getAuth } from '../src/instance'
import { TEST_AUTH_ENV } from './harness'

const APP = TEST_AUTH_ENV.APP_ORIGIN
const request = (auth: { handler: (r: Request) => Promise<Response> }, method: string, path: string) =>
  auth.handler(
    new Request(`${APP}/api/auth${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: APP },
      ...(method === 'POST' ? { body: '{}' } : {})
    })
  )

const UNBUILT = [
  ['POST', '/sign-in/anonymous'],
  ['POST', '/organization/create'],
  ['POST', '/organization/update-member-role'],
  ['POST', '/api-key/create'],
  ['POST', '/api-key/update'],
  ['POST', '/api-key/delete'],
  ['GET', '/passkey/generate-register-options'],
  ['GET', '/jwks']
] as const

test('every base plugin endpoint answers 404 over HTTP; Better Auth’s own session endpoints answer', async () => {
  const { auth } = getAuth()
  for (const [method, path] of UNBUILT) expect((await request(auth, method, path)).status, path).toBe(404)
  const session = await request(auth, 'GET', '/get-session')
  expect(session.status).toBe(200)
  expect(await session.json()).toBeNull()
})

test('all Better Auth API-key HTTP manager endpoints stay disabled for #106', async () => {
  const { auth } = getAuth()
  const plugins = auth.options.plugins as Array<{
    id: string
    endpoints?: Record<string, { path?: string; options?: { method?: string; metadata?: { SERVER_ONLY?: boolean } } }>
  }>
  const plugin = plugins.find(({ id }) => id === 'api-key')
  expect(plugin).toBeDefined()
  const endpoints = Object.values(plugin!.endpoints ?? {}).filter(
    (endpoint) => endpoint.path && !endpoint.options?.metadata?.SERVER_ONLY
  )
  expect(endpoints.length).toBeGreaterThan(0)
  for (const endpoint of endpoints) {
    const method = typeof endpoint.options?.method === 'string' ? endpoint.options.method : 'POST'
    expect((await request(auth, method, endpoint.path!)).status, endpoint.path).toBe(404)
  }
})

test('the server still calls a base plugin’s endpoints through auth.api', async () => {
  const response = await getAuth().auth.api.signInAnonymous({ headers: new Headers(), asResponse: true })
  expect(response.status).toBe(200)
  expect((await getAuth().auth.api.getJwks()).keys.length).toBeGreaterThan(0)
})

test('an owner’s plugin with the same id replaces the base plugin, and its endpoints answer', async () => {
  const auth = createAuth(authSettings(), { plugins: [anonymous()] })
  expect((await request(auth, 'POST', '/sign-in/anonymous')).status).toBe(200)
  expect((await request(auth, 'POST', '/organization/create')).status).toBe(404)
})
