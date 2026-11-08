import { afterEach, expect, it, vi } from 'vitest'
import { setPermissionCheck, setPrincipalResolver, v1 } from '../src/index'

afterEach(() => vi.unstubAllEnvs())

const me = () => v1.fetch(new Request('https://api.skyclause.m1ku.tech/v1/me'))

// The exported apps run on the production seams: f-auth's registrations (#94) and the Postgres stores.
it('answers 501 not-built by f-auth until a resolver is registered, then resolves through it', async () => {
  vi.stubEnv('APP_ENV', 'test')
  vi.stubEnv('IP_HASH_KEY', 'k'.repeat(48))
  vi.stubEnv('BETTER_AUTH_SECRET', 's'.repeat(48))
  vi.stubEnv('EMAIL_HASH_KEY', 'e'.repeat(48))
  const before = await me()
  expect(before.status).toBe(501)
  expect(await before.json()).toMatchObject({ owner: 'f-auth' })

  const resolver = vi.fn(async () => null)
  setPrincipalResolver(resolver)
  setPermissionCheck(() => false)
  const after = await me()
  expect(resolver).toHaveBeenCalledWith(expect.any(Request), { surface: 'v1' })
  // No principal, counted in rate_limit by IP hash, so `getMe` answers 401.
  expect(after.status).toBe(401)
  expect(await after.json()).toMatchObject({ type: 'https://docs.skyclause.m1ku.tech/problems/unauthenticated' })
})
