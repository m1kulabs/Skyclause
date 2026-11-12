import { afterEach, expect, test, vi } from 'vitest'
import { accountApi } from '../../features/account/operations'

afterEach(() => vi.unstubAllGlobals())

test('preference updates call the app-origin contract route with only changed fields', async () => {
  const fetcher = vi.fn(async (_input: string | URL, _options?: RequestInit) =>
    Response.json({
      theme: 'dark',
      high_contrast: false,
      density: 'comfortable',
      reduced_motion: false,
      language: 'en',
      shortcuts: false
    })
  )
  vi.stubGlobal('fetch', fetcher)

  const result = await accountApi('updateMyPreferences', { body: { shortcuts: false } })
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('/api/me/preferences')
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' })
  expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({ shortcuts: false })
  expect(result.shortcuts).toBe(false)
})
