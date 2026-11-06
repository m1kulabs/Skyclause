import { expect, test, vi } from 'vitest'
import { principalFromTestCookie } from '../../lib/principal'

vi.mock('@skyclause/auth', () => ({ resolvePrincipal: vi.fn() }))

const principal = { kind: 'system', client: 'api', clientName: null, job: 'test' } as const
const cookieValue = encodeURIComponent(JSON.stringify(principal))

test('ignores the test principal cookie unless APP_ENV is test', () => {
  expect(principalFromTestCookie(cookieValue, 'production')).toBeUndefined()
  expect(principalFromTestCookie(cookieValue, 'development')).toBeUndefined()
  expect(principalFromTestCookie(cookieValue, 'test')).toEqual(principal)
})
