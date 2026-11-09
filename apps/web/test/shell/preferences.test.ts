import { afterEach, expect, test, vi } from 'vitest'
import { saveSidebarPreference } from '../../features/shell/preferences'

afterEach(() => vi.unstubAllGlobals())

test('persists the rail choice through the registry PATCH operation', async () => {
  const fetcher = vi.fn(async (_url: string | URL, _options: RequestInit) =>
    Response.json({
      theme: 'dark',
      high_contrast: false,
      density: 'comfortable',
      reduced_motion: false,
      language: 'en',
      shortcuts: true,
      sidebar_collapsed: true
    })
  )
  vi.stubGlobal('fetch', fetcher)
  await saveSidebarPreference(true)
  const [url, options] = fetcher.mock.calls[0]!
  expect(String(url)).toBe('/api/me/preferences')
  expect(options.method).toBe('PATCH')
  expect(JSON.parse(options.body as string)).toEqual({ sidebar_collapsed: true })
})

test('does not report persistence when an old backend ignores the collapse field', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        theme: 'dark',
        high_contrast: false,
        density: 'comfortable',
        reduced_motion: false,
        language: 'en'
      })
    )
  )
  await expect(saveSidebarPreference(true)).rejects.toThrow('Sidebar preference was not confirmed')
})
