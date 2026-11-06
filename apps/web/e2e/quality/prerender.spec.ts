import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test('the landing page has a prerendered shell instead of a fully dynamic response', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '../../.next/prerender-manifest.json'), 'utf8')
  ) as { routes: Record<string, { initialRevalidateSeconds: number | false; renderingMode?: string }> }

  expect(manifest.routes, '/ must remain in the production prerender manifest').toHaveProperty('/')
  expect(manifest.routes['/']!.initialRevalidateSeconds).not.toBe(0)
  expect(['STATIC', 'PARTIALLY_STATIC']).toContain(manifest.routes['/']!.renderingMode)

  // A boundary around the entire document would prerender an empty shell. Keep the landing and shared UI static.
  const html = readFileSync(path.join(import.meta.dirname, '../../.next/server/app/index.html'), 'utf8')
  expect(html).toMatch(/<h1\b[^>]*>Skyclause<\/h1>/)
  expect(html).toContain('class="skip-link"')
  expect(html).toContain('id="main-content"')
  expect(html).toContain('id="skyclause-announcer"')
})
