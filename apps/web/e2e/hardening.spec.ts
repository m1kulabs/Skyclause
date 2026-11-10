// a-hardening (#115): NFR-10's response headers on the built server — one route
// per route group in both host modes, framing behaviour, and the nonce proof.
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// [path, host] per route group, in HOST_MODE=multi.
const MULTI: Array<[string, string]> = [
  ['/health', 'skyclause.m1ku.tech'],
  ['/v1/projects', 'api.skyclause.m1ku.tech'],
  ['/api/me/memberships', 'app.skyclause.m1ku.tech'],
  ['/mcp', 'mcp.skyclause.m1ku.tech'],
  ['/.well-known/oauth-protected-resource', 'mcp.skyclause.m1ku.tech'],
  ['/.well-known/oauth-authorization-server', 'app.skyclause.m1ku.tech'],
  ['/sw.js', 'app.skyclause.m1ku.tech'],
  ['/openapi.json', 'skyclause.m1ku.tech'],
  ['/oembed', 'skyclause.m1ku.tech'],
  ['/e', 'skyclause.m1ku.tech'],
  ['/skills', 'skyclause.m1ku.tech'],
  ['/apu/bukit-jalil/ledger', 'embed.skyclause.m1ku.tech'],
  ['/docs/guides', 'docs.skyclause.m1ku.tech'],
  ['/quality-planted/vitals', 'skyclause.m1ku.tech'],
  ['/', 'skyclause.m1ku.tech'],
  ['/status', 'skyclause.m1ku.tech'],
  ['/sign-in', 'app.skyclause.m1ku.tech'],
  ['/apu/bukit-jalil', 'app.skyclause.m1ku.tech'],
  ['/apu/bukit-jalil/camera/source-1', 'app.skyclause.m1ku.tech']
]

// [path] in HOST_MODE=single, all on one origin.
const SINGLE = [
  '/health',
  '/v1/projects',
  '/api/me/memberships',
  '/mcp',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/sw.js',
  '/openapi.json',
  '/oembed',
  '/e',
  '/skills',
  '/embed/apu/bukit-jalil',
  '/docs/guides',
  '/quality-planted/vitals',
  '/',
  '/status',
  '/sign-in',
  '/apu/bukit-jalil',
  '/apu/bukit-jalil/camera/source-1'
]

const nonceOf = (csp: string) => /script-src[^;]*'nonce-([^']+)'/.exec(csp)?.[1]

test.describe('HOST_MODE=single', () => {
  for (const url of SINGLE) {
    test(`sends CSP and HSTS on ${url}`, async ({ request }) => {
      const response = await request.get(url)
      expect(response.status(), url).toBeLessThan(500)
      const headers = response.headers()
      expect(headers['strict-transport-security'], url).toBe('max-age=63072000; includeSubdomains')
      expect(headers['x-content-type-options'], url).toBe('nosniff')
      expect(headers['referrer-policy'], url).toBe('strict-origin-when-cross-origin')
      const csp = headers['content-security-policy'] ?? ''
      expect(nonceOf(csp), url).toBeTruthy()
      expect(csp, url).toContain("'strict-dynamic'")
      expect(csp, url).toContain("object-src 'none'")
      if (url.startsWith('/embed/')) {
        expect(csp, url).toContain('frame-ancestors *')
        expect(headers['cross-origin-opener-policy'], url).toBeUndefined()
      } else {
        expect(csp, url).toContain("frame-ancestors 'none'")
        expect(headers['cross-origin-opener-policy'], url).toBe('same-origin')
      }
      const permissions = headers['permissions-policy'] ?? ''
      expect(permissions, url).toContain('microphone=()')
      if (url.includes('/camera/')) expect(permissions, url).toContain('camera=(self)')
      else expect(permissions, url).toContain('camera=()')
    })
  }

  test('the rendered nonce matches the CSP nonce', async ({ request }) => {
    const response = await request.get('/sign-in')
    const csp = response.headers()['content-security-policy'] ?? ''
    const html = await response.text()
    expect(html).toContain(`nonce="${nonceOf(csp)}"`)
  })

  test('Next framework scripts carry the per-request CSP nonce', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy directive.*script-src/i.test(message.text())) {
        violations.push(message.text())
      }
    })

    for (const path of ['/', '/quality-planted/vitals']) {
      violations.length = 0
      const response = await page.goto(path)
      const nonce = nonceOf(response?.headers()['content-security-policy'] ?? '')
      const scriptNonces = await page
        .locator('script[src*="/_next/static/"]')
        .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce))

      expect(scriptNonces.length, path).toBeGreaterThan(0)
      expect(
        scriptNonces.every((scriptNonce) => scriptNonce === nonce),
        path
      ).toBe(true)
      expect(violations, path).toEqual([])
    }
  })

  test('an inline script without the nonce does not run, one with it does', async ({ page }) => {
    await page.goto('/quality-planted/csp')
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__plantedCsp)).toBeUndefined()
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__plantedCspNonce)).toBe('ran')
  })

  test('a cross-origin iframe of an app page is blocked, an embed frame loads', async ({ page }) => {
    await page.goto('/quality-planted/csp')
    const appFramed = await page.evaluate(async () => {
      const frame = document.createElement('iframe')
      frame.src = '/sign-in'
      document.body.append(frame)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      try {
        return frame.contentDocument !== null
      } catch {
        return false
      }
    })
    expect(appFramed).toBe(false)
    const embedFramed = await page.evaluate(async () => {
      const frame = document.createElement('iframe')
      frame.src = '/embed/apu/bukit-jalil'
      document.body.append(frame)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      try {
        return frame.contentDocument?.body !== null && frame.contentDocument?.body !== undefined
      } catch {
        return false
      }
    })
    expect(embedFramed).toBe(true)
  })
})

test.describe('HOST_MODE=multi', () => {
  test.describe.configure({ mode: 'serial' })
  const port = 3103
  const origin = `http://localhost:${port}`
  let server: ChildProcess | undefined
  test.beforeAll(async ({ request }) => {
    server = spawn(process.execPath, [path.resolve(import.meta.dirname, '../.next/standalone/apps/web/server.js')], {
      env: {
        ...process.env,
        APP_ENV: 'test',
        IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
        EMAIL_HASH_KEY: 'test-only-email-hash-key-for-playwright-runs',
        HOST_MODE: 'multi',
        MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
        APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
        API_ORIGIN: 'https://api.skyclause.m1ku.tech',
        MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
        EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
        DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech',
        HOSTNAME: 'localhost',
        PORT: String(port)
      },
      stdio: 'ignore'
    })
    await expect
      .poll(
        async () => {
          if (server?.exitCode !== null) throw new Error(`Multi-host server exited: ${server?.exitCode}`)
          return request
            .get(`${origin}/health`, { headers: { host: 'web-413187272599.asia-southeast1.run.app' } })
            .then((response) => response.status())
            .catch(() => 0)
        },
        { timeout: 30_000 }
      )
      .toBe(200)
  })
  test.afterAll(async () => {
    if (server && server.exitCode === null) {
      const closed = once(server, 'exit')
      server.kill('SIGTERM')
      await closed
    }
  })

  for (const [url, host] of MULTI) {
    test(`sends CSP and HSTS on ${host}${url}`, async ({ request }) => {
      const response = await request.get(`${origin}${url}`, { headers: { host } })
      expect(response.status(), url).toBeLessThan(500)
      const headers = response.headers()
      expect(headers['strict-transport-security'], url).toBe('max-age=63072000; includeSubdomains')
      const csp = headers['content-security-policy'] ?? ''
      expect(nonceOf(csp), url).toBeTruthy()
      if (host === 'embed.skyclause.m1ku.tech') {
        expect(csp, url).toContain('frame-ancestors *')
        expect(headers['cross-origin-opener-policy'], url).toBeUndefined()
      } else {
        expect(csp, url).toContain("frame-ancestors 'none'")
        expect(headers['cross-origin-opener-policy'], url).toBe('same-origin')
      }
      expect(csp, url).toContain("connect-src 'self' https://api.skyclause.m1ku.tech")
    })
  }
})
