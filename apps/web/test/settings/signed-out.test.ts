import { afterEach, expect, test, vi } from 'vitest'
import { resolvePrincipal } from '@skyclause/auth'
import { getPrincipal, principalFromTestCookie } from '../../lib/principal'

vi.mock('@skyclause/auth', () => ({ resolvePrincipal: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'skyclause_test_principal=null' })
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

test('an explicit signed-out fixture resolves to null without calling unfinished auth', async () => {
  vi.stubEnv('APP_ENV', 'test')
  expect(principalFromTestCookie('null', 'test')).toBeNull()
  await expect(getPrincipal()).resolves.toBeNull()
  expect(resolvePrincipal).not.toHaveBeenCalled()
})

test('production ignores the signed-out fixture and resolves real credentials', async () => {
  vi.stubEnv('APP_ENV', 'production')
  vi.mocked(resolvePrincipal).mockResolvedValue(null)
  expect(principalFromTestCookie('null', 'production')).toBeUndefined()
  await expect(getPrincipal()).resolves.toBeNull()
  expect(resolvePrincipal).toHaveBeenCalledOnce()
})
