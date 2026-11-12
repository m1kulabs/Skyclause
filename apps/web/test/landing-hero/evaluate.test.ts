import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiOriginError } from '../../lib/api-origin'
import { fetchEvaluateServer, fetchLatestCallServer } from '../../features/landing-hero/evaluate'

const win = { date: '2026-11-12', startMin: 600, endMin: 660 }
const pilot = { org: 'acme', project: 'rain' }

let fetchMock: ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>

beforeEach(() => {
  vi.stubEnv('API_ORIGIN', undefined)
  vi.stubEnv('APP_ORIGIN', undefined)
  vi.stubEnv('HOST_MODE', undefined)
  fetchMock = vi.fn(async () => Response.json({ data: [], next_cursor: null }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('the server evaluate read fails closed with no API origin, never calling a default host', async () => {
  await expect(fetchEvaluateServer(win)).rejects.toThrow(ApiOriginError)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('the server calendar read fails closed with no API origin, but needs none when no pilot is set', async () => {
  await expect(fetchLatestCallServer(null)).resolves.toBeNull()
  await expect(fetchLatestCallServer(pilot)).rejects.toThrow(ApiOriginError)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('the server reads call API_ORIGIN when set', async () => {
  vi.stubEnv('API_ORIGIN', 'https://api.example.test')

  await fetchEvaluateServer(win)
  await fetchLatestCallServer(pilot)

  expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`)).toEqual([
    'POST https://api.example.test/v1/public/commons/bukit-jalil/evaluate',
    'GET https://api.example.test/v1/public/acme/rain/calendar-entries?limit=1'
  ])
})

test('the server reads call APP_ORIGIN under HOST_MODE=single when API_ORIGIN is unset', async () => {
  vi.stubEnv('HOST_MODE', 'single')
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3100')

  await fetchEvaluateServer(win)

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'http://localhost:3100/v1/public/commons/bukit-jalil/evaluate'
  ])
})
