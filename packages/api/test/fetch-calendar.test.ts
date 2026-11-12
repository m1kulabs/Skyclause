import { expect, test } from 'vitest'
import { fetchCalendar } from '../src/services/windows/fetch-ics'

test('calendar fetch prefers ETag and accepts a 304 as unchanged', async () => {
  const result = await fetchCalendar(
    'https://calendar.example.org/calendar.ics',
    { etag: '"abc"', lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' },
    {
      assertPublicUrl: async (url, options) => {
        expect(options?.https).toBe(true)
        return { url: new URL(url), addresses: ['192.0.2.1'] }
      },
      safeFetch: async (_url, options) => {
        expect(options).toMatchObject({
          https: true,
          redirects: 'follow',
          maxRedirects: 3,
          timeoutMs: 10000,
          maxBytes: 5242880
        })
        expect(new Headers(options?.headers).get('if-none-match')).toBe('"abc"')
        expect(new Headers(options?.headers).get('if-modified-since')).toBeNull()
        return new Response(null, { status: 304 })
      }
    }
  )
  expect(result).toEqual({ status: 'unchanged' })
})
