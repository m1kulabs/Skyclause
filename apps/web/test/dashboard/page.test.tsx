import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'session=test' }) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found')
  }
}))

import DashboardRoute from '../../app/(app)/[org]/page'

let fetcher: ReturnType<typeof vi.fn<(input: string | URL) => Promise<Response>>>
let errorLines: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('APP_ENV', 'dev')
  vi.stubEnv('API_ORIGIN', undefined)
  vi.stubEnv('APP_ORIGIN', undefined)
  vi.stubEnv('HOST_MODE', undefined)
  fetcher = vi.fn(async () => new Response(null, { status: 500 }))
  vi.stubGlobal('fetch', fetcher)
  errorLines = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const render = async () => (await DashboardRoute({ params: Promise.resolve({ org: 'acme' }) })).props

test('with no API origin the dashboard sends nothing, renders without server data and logs the configuration error', async () => {
  expect(await render()).toMatchObject({ org: 'acme', initialData: null, initialError: null })

  expect(fetcher).not.toHaveBeenCalled()
  expect(errorLines).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(errorLines.mock.calls[0]?.[0]))).toMatchObject({
    severity: 'ERROR',
    message: 'dashboard cannot read the API',
    error: expect.stringContaining('API_ORIGIN')
  })
})

test('logs nothing when the API itself answers with an error', async () => {
  vi.stubEnv('API_ORIGIN', 'https://api.example.test')

  expect(await render()).toMatchObject({ initialData: null, initialError: 500 })

  expect(fetcher).toHaveBeenCalled()
  expect(errorLines).not.toHaveBeenCalled()
})
