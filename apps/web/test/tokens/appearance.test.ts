import { describe, expect, test, vi, afterEach } from 'vitest'
import { resolveAppearance } from '../../lib/theme'
import Tokens from '../../app/_test/tokens/page'

// 95b supplies the catalogue runtime. This double stays in tests and lets the route guard run before it merges.
vi.mock('@skyclause/i18n', () => ({ t: (key: string) => key }))

afterEach(() => vi.unstubAllEnvs())

describe('server appearance', () => {
  test('signed-out dark overrides the OS colour preference, with system contrast and motion', () => {
    expect(resolveAppearance(undefined, { colorScheme: 'light', contrast: 'more', motion: 'reduce' })).toEqual({
      mode: 'dark',
      className: 'dark hc',
      color: '#000000',
      motion: 'reduce'
    })
  })

  test('system resolves available client hints before SSR', () => {
    expect(
      resolveAppearance(
        { theme: 'system', contrast: 'system', motion: 'system' },
        {
          colorScheme: 'light',
          contrast: 'more',
          motion: 'reduce'
        }
      )
    ).toEqual({ mode: 'light', className: 'light hc', color: '#ffffff', motion: 'reduce' })
  })

  test('explicit preferences override client hints', () => {
    expect(
      resolveAppearance(
        { theme: 'light', contrast: 'standard', motion: 'full' },
        {
          colorScheme: 'dark',
          contrast: 'more',
          motion: 'reduce'
        }
      )
    ).toEqual({ mode: 'light', className: 'light', color: '#f6f6f7', motion: 'full' })
  })
})

test.each(['production', 'development', 'preview', undefined])('the tokens route returns 404 in %s', (env) => {
  vi.stubEnv('APP_ENV', env)
  expect(Tokens).toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
})

test('the tokens route is available in test', () => {
  vi.stubEnv('APP_ENV', 'test')
  expect(Tokens).not.toThrow()
})
