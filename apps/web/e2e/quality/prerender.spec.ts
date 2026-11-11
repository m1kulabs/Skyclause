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
  expect(html).toContain('class="skip-link"')
  expect(html).toContain('id="main-content"')
  expect(html).toContain('id="skyclause-announcer"')

  // #184 hero: the product-name h1 below is the hero copy deck's h1, rendered per request for no-JS.
  expect(html).toMatch(/<h1\b[^>]*>[\s\S]*?The call for[\s\S]*?every window[\s\S]*?<\/h1>/)
  expect(html).toContain('Skyclause reads the rain gauge')
  expect(html).toContain('Open the Commons')
  expect(html).toContain('Sign in')
  expect(html).toContain('data-unbuilt="d-landing-sections"')
  // No-JS live verdict: the server-rendered GET form and picker, with the next hour's verdict or the honest error.
  expect(html).toContain('data-ui')
  expect(html).toContain('name="date"')
  expect(html).toContain('name="start"')
  expect(html).toContain('name="end"')
  expect(html).toMatch(/Clause engine verdict|Couldn't reach the live verdict/)
})
