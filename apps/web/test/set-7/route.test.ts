import { afterEach, expect, test, vi } from 'vitest'
import Set7TestPage from '../../app/%5Ftest/set-7/page.plant'

afterEach(() => vi.unstubAllEnvs())

test.each(['production', 'preview', 'development', undefined])('SET-7 harness returns 404 in %s', (env) => {
  vi.stubEnv('APP_ENV', env)
  expect(Set7TestPage).toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
})

test('SET-7 harness renders only in the test runtime', () => {
  vi.stubEnv('APP_ENV', 'test')
  expect(Set7TestPage).not.toThrow()
})
