import { expect, test } from 'vitest'
import { CalendarHttpError, fetchCalendar } from '../src/services/windows/fetch-ics'

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

test('a 200 response returns its body and replacement validators; Last-Modified is used without an ETag', async () => {
  const result = await fetchCalendar(
    'https://calendar.example.org/calendar.ics',
    { etag: null, lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' },
    {
      assertPublicUrl: async (url) => ({ url: new URL(url), addresses: ['192.0.2.1'] }),
      safeFetch: async (_url, options) => {
        expect(new Headers(options?.headers).get('if-modified-since')).toBe('Wed, 21 Oct 2015 07:28:00 GMT')
        return new Response('BEGIN:VCALENDAR', {
          status: 200,
          headers: { ETag: '"new"', 'Last-Modified': 'Thu, 22 Oct 2015 07:28:00 GMT' }
        })
      }
    }
  )
  expect(result).toEqual({
    status: 'changed',
    text: 'BEGIN:VCALENDAR',
    etag: '"new"',
    lastModified: 'Thu, 22 Oct 2015 07:28:00 GMT'
  })
})

test('non-200 success responses fail instead of being interpreted as empty calendars', async () => {
  await expect(
    fetchCalendar(
      'https://calendar.example.org/calendar.ics',
      { etag: null, lastModified: null },
      {
        assertPublicUrl: async (url) => ({ url: new URL(url), addresses: ['192.0.2.1'] }),
        safeFetch: async () => new Response(null, { status: 204 })
      }
    )
  ).rejects.toBeInstanceOf(CalendarHttpError)
})

test('invalid UTF-8 bytes are rejected rather than replaced before parsing', async () => {
  await expect(
    fetchCalendar(
      'https://calendar.example.org/calendar.ics',
      { etag: null, lastModified: null },
      {
        assertPublicUrl: async (url) => ({ url: new URL(url), addresses: ['192.0.2.1'] }),
        safeFetch: async () => new Response(new Uint8Array([0xff]), { status: 200 })
      }
    )
  ).rejects.toThrow()
})
