import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test('the landing page renders its full shell per request for the CSP nonce', async ({ request }) => {
  const manifest = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '../../.next/prerender-manifest.json'), 'utf8')
  ) as {
    routes: Record<
      string,
      { initialRevalidateSeconds: number | false; renderingMode?: string; response?: string; compute?: string }
    >
  }

  expect(manifest.routes, '/ must keep a route entry').toHaveProperty('/')
  expect(manifest.routes['/']!.response, 'the cached route entry must not contain HTML without a request nonce').toBe(
    'empty'
  )
  expect(manifest.routes['/']!.compute).toBe('blocking')

  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toMatch(/<h1\b[^>]*>Skyclause<\/h1>/)
  expect(html).toContain('class="skip-link"')
  expect(html).toContain('id="main-content"')
  expect(html).toContain('id="skyclause-announcer"')
})
