import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Spec §4 Hosts through the built server's proxy.ts in HOST_MODE=multi, with production's six origins.
const port = 3102
const origin = `http://localhost:${port}`
const RUN_APP = 'web-413187272599.asia-southeast1.run.app'

test.describe('HOST_MODE=multi', () => {
  test.describe.configure({ mode: 'serial' })
  let server: ChildProcess | undefined
  test.beforeAll(async ({ request }) => {
    server = spawn(process.execPath, [path.resolve(import.meta.dirname, '../.next/standalone/apps/web/server.js')], {
      env: {
        ...process.env,
        APP_ENV: 'test',
        IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
        EMAIL_HASH_KEY: 'test-only-email-hash-key-for-playwright-runs',
        // Production's setting, whatever the shell exports: the test-only routes are off.
        PLANTED_ROUTES: '',
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
            .get(`${origin}/health`, { headers: { host: RUN_APP } })
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

  test('the run.app host answers /health only; anything else is the not-found page', async ({ request }) => {
    const health = await request.get(`${origin}/health`, { headers: { host: RUN_APP } })
    expect(await health.text()).toBe('ok')
    const home = await request.get(`${origin}/`, { headers: { host: RUN_APP } })
    expect(home.status()).toBe(404)
    const html = await home.text()
    expect(html).toContain('class="skip-link"')
    expect(html).toContain('id="skyclause-announcer"')
  })

  test('each host serves its own routes and 404s the others', async ({ request }) => {
    const get = (host: string, pathname: string) =>
      request.get(`${origin}${pathname}`, { headers: { host }, maxRedirects: 0 })
    expect((await get('skyclause.m1ku.tech', '/')).status()).toBe(200)
    expect((await get('skyclause.m1ku.tech', '/openapi.json')).status()).toBe(200)
    expect((await get('app.skyclause.m1ku.tech', '/openapi.json')).status()).toBe(404)
    expect((await get('app.skyclause.m1ku.tech', '/')).status()).toBe(404)
    expect((await get('api.skyclause.m1ku.tech', '/')).status()).toBe(404)

    const v1 = await get('api.skyclause.m1ku.tech', '/v1/no-such-operation')
    expect(v1.status()).toBe(404)
    expect(v1.headers()['content-type']).toMatch(/^application\/problem\+json/)
    const v1OnApp = await get('app.skyclause.m1ku.tech', '/v1/no-such-operation')
    expect(v1OnApp.status()).toBe(404)
    expect(v1OnApp.headers()['content-type']).toMatch(/^text\/html/)

    const apiOnApp = await get('app.skyclause.m1ku.tech', '/api/no-such-operation')
    expect(apiOnApp.headers()['content-type']).toMatch(/^application\/problem\+json/)
    for (const host of ['skyclause.m1ku.tech', 'app.skyclause.m1ku.tech', 'mcp.skyclause.m1ku.tech']) {
      expect((await get(host, '/health')).status(), host).toBe(200)
    }
  })

  // This server starts without PLANTED_ROUTES, as production does. Next matches a two-segment path such as
  // /_test/tokens to the app's /[org]/[project] page whichever host asked, and that page's notFound() answers 200 once
  // the shell streams (#610): the proxy must send the test routes to the not-found page itself, on every host.
  test('test-only routes and unknown paths answer the not-found page on every host', async ({ request }) => {
    const hosts = [
      RUN_APP,
      ...['', 'app.', 'api.', 'mcp.', 'embed.', 'docs.'].map((prefix) => `${prefix}skyclause.m1ku.tech`)
    ]
    const pathnames = ['/_test/tokens', '/_test/nothing-here', '/quality-planted/motion', '/aaa/bbb/ccc/ddd']
    const requests = hosts.flatMap((host) => pathnames.map((pathname) => ({ host, pathname })))
    requests.push({ host: 'skyclause.m1ku.tech', pathname: '/aaa/bbb' })
    for (const { host, pathname } of requests) {
      const response = await request.get(`${origin}${pathname}`, { headers: { host }, maxRedirects: 0 })
      expect(response.status(), `${host}${pathname}`).toBe(404)
      const html = await response.text()
      expect(html, `${host}${pathname}`).toContain('class="skip-link"')
      expect(html, `${host}${pathname}`).toContain('id="skyclause-announcer"')
    }
  })
})
