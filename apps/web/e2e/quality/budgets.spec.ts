// NFR-9 budgets: the landing page's JavaScript before first interaction, and the embed script.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, test, type Response } from '@playwright/test'
import { builtRoutes } from './routes'

const KB = 1000
const LANDING_BUDGET = 150 * KB
const EMBED_BUDGET = 30 * KB

/** gzip at Node's default level, which is what `next start` sends. */
const compressed = async (response: Response) => gzipSync(await response.body()).length

test('the landing page ships at most 150 KB of compressed JavaScript before first interaction', async ({ page }) => {
  const scripts: Response[] = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scripts.push(response)
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  const sizes = await Promise.all(
    scripts.map(async (r) => ({ url: new URL(r.url()).pathname, bytes: await compressed(r) }))
  )
  const total = sizes.reduce((sum, script) => sum + script.bytes, 0)
  const detail = sizes.map((script) => `${script.url} ${(script.bytes / KB).toFixed(1)} KB`).join('\n')
  console.log(`landing JavaScript: ${(total / KB).toFixed(1)} KB compressed\n${detail}`)
  expect(total, detail).toBeLessThanOrEqual(LANDING_BUDGET)
})

test('/elements/v1.js is at most 30 KB compressed', async ({ request }) => {
  const built =
    builtRoutes().some((route) => route.path === '/elements/v1.js') ||
    existsSync(path.join(import.meta.dirname, '../../public/elements/v1.js'))
  test.fixme(!built, '/elements/v1.js is not built yet (#191)')
  const response = await request.get('/elements/v1.js')
  expect(response.status()).toBe(200)
  expect(gzipSync(await response.body()).length).toBeLessThanOrEqual(EMBED_BUDGET)
})
