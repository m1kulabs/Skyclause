import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LandingHero } from '../../features/landing-hero/landing-hero'

let fetchMock: ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>
let errorLines: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('API_ORIGIN', undefined)
  vi.stubEnv('APP_ORIGIN', undefined)
  vi.stubEnv('HOST_MODE', undefined)
  vi.stubEnv('PILOT_PROJECT', undefined)
  fetchMock = vi.fn(async () => Response.json({}))
  vi.stubGlobal('fetch', fetchMock)
  errorLines = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function render() {
  return renderToStaticMarkup(await LandingHero({ searchParams: Promise.resolve({}) }))
}

test.each([undefined, 'acme/rain'])(
  'with no API origin and PILOT_PROJECT %j the hero shows its error state, sends nothing and logs it once',
  async (pilot) => {
    vi.stubEnv('PILOT_PROJECT', pilot)

    expect(await render()).toContain('Couldn&#x27;t reach the live verdict')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(errorLines).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(errorLines.mock.calls[0]?.[0]))).toMatchObject({
      severity: 'ERROR',
      message: 'landing hero cannot read the API',
      error: expect.stringContaining('API_ORIGIN')
    })
  }
)

test('with an API origin the hero reads it and logs nothing', async () => {
  vi.stubEnv('API_ORIGIN', 'https://api.example.test')

  await render()

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://api.example.test/v1/public/commons/bukit-jalil/evaluate'
  ])
  expect(errorLines).not.toHaveBeenCalled()
})
