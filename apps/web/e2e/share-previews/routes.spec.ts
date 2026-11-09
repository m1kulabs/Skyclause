import { expect, test } from '@playwright/test'

// #190's Route Handlers in the built server (HOST_MODE=single), fonts and all: an OG route that failed to load its
// Work Sans files would answer 500. Until #187's public reads and the API's rate-limit store land, each read answers
// 501 `not-built`, which the routes pass on uncached; once they land, these targets are missing and answer 404.
test('the preview routes are mounted and pass a failed public read on as an uncached problem', async ({
  request,
  baseURL
}) => {
  const oembed = `/oembed?url=${encodeURIComponent(`${baseURL}/p/no-org/no-project`)}`
  for (const path of [
    '/p/no-org/no-project/favicon.svg',
    '/p/no-org/no-project/og.png',
    '/p/no-org/no-project/windows/no-window/og.png',
    '/c/no-call/og.png',
    oembed
  ]) {
    const response = await request.get(path)
    expect([404, 501], path).toContain(response.status())
    expect(response.headers()['content-type'], path).toMatch(/^application\/problem\+json/)
    expect(response.headers()['cache-control'], path).toBe('no-store')
  }
  expect((await request.get(oembed)).headers()['access-control-allow-origin']).toBe('*')
  expect((await request.get(`/oembed?format=xml&url=${encodeURIComponent(`${baseURL}/p/a/b`)}`)).status()).toBe(501)
})
