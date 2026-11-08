import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { brandMetadata } from '../../features/brand/metadata'
import { builtRoutes } from '../quality/routes'
import { signedOut } from '../quality/roles'

const iconLinks = [
  ...brandMetadata.icons.icon.map((icon) => ({ ...icon, rel: 'icon' })),
  ...brandMetadata.icons.apple.map((icon) => ({ ...icon, rel: 'apple-touch-icon' })),
  { rel: 'manifest', url: brandMetadata.manifest, sizes: undefined, type: undefined }
]

// Both processes serve the exact same built image, as Cloud Run does for the six hosts.
// The additional process proves the files remain reachable with HOST_MODE=multi.
test.describe('WEB-1 in HOST_MODE=single and multi', () => {
  test.describe.configure({ mode: 'serial' })
  let multi: ChildProcess | undefined
  const multiOrigin = 'http://localhost:3101'
  test.beforeAll(async ({ request }) => {
    multi = spawn(process.execPath, [path.resolve(import.meta.dirname, '../../.next/standalone/apps/web/server.js')], {
      env: {
        ...process.env,
        APP_ENV: 'test',
        HOST_MODE: 'multi',
        // HOST_MODE=multi needs all six origins to start (#93); the camera page needs an API origin (#129).
        MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
        APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
        API_ORIGIN: multiOrigin,
        MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
        EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
        DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech',
        HOSTNAME: 'localhost',
        PORT: '3101'
      },
      stdio: 'ignore'
    })
    await expect
      .poll(
        async () => {
          if (multi?.exitCode !== null) throw new Error(`Multi-host server exited: ${multi?.exitCode}`)
          return request
            .get(`${multiOrigin}/health`)
            .then((response) => response.status())
            .catch(() => 0)
        },
        { timeout: 30000 }
      )
      .toBe(200)
  })
  test.afterAll(async () => {
    if (multi && multi.exitCode === null) {
      const closed = once(multi, 'exit')
      multi.kill('SIGTERM')
      await closed
    }
  })

  for (const route of builtRoutes()) {
    test(`every head links the static set: ${route.path}`, async ({ page, baseURL }) => {
      await signedOut(page)
      // Dynamic pages are visited too, even before their domain owners replace the placeholder body.
      const url = route.path.replace(/\[\.\.\.[^\]]+\]|\[[^\]]+\]/g, 'brand-test')
      for (const origin of [baseURL!, multiOrigin]) {
        await page.goto(`${origin}${url}`)
        // The camera PWA links its own per-source manifest (#129); every other link is the static set.
        for (const { rel, url, sizes, type } of iconLinks) {
          if (rel === 'manifest' && route.path.includes('/camera/')) continue
          const link = page.locator(`head link[rel="${rel}"][href="${url}"]`)
          await expect(link).toHaveCount(1)
          if (sizes) await expect(link).toHaveAttribute('sizes', sizes)
          if (type) await expect(link).toHaveAttribute('type', type)
        }
      }
    })
  }

  test('each asset is 200 on all six hosts in both host modes; manifest has its MIME and sizes', async ({
    request,
    baseURL
  }) => {
    for (const origin of [baseURL!, multiOrigin]) {
      for (const host of ['', 'app.', 'api.', 'mcp.', 'embed.', 'docs.']) {
        for (const { url } of iconLinks) {
          const response = await request.get(`${origin}${url}`, { headers: { host: `${host}skyclause.m1ku.tech` } })
          expect(response.status(), `${origin} ${host} ${url}`).toBe(200)
          if (url.endsWith('.webmanifest')) {
            expect(response.headers()['content-type']).toMatch(/^application\/manifest\+json(?:;|$)/)
            const manifest = (await response.json()) as { icons: Array<{ sizes: string; purpose: string }> }
            expect(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose])).toEqual([
              ['192x192', 'any'],
              ['512x512', 'any'],
              ['512x512', 'maskable']
            ])
          }
        }
      }
    }
  })
})
