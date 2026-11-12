import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { makeAccount, signIn } from '@skyclause/auth/testing'

// The sign-in page through the built server's proxy.ts in HOST_MODE=multi, with production's six origins: the app host
// serves it, and every link on it to the landing or the legal pages must reach the marketing host, which serves them.
const port = Number(process.env.E2E_PORT ?? 3100) + 2
const origin = `http://localhost:${port}`
const APP_HOST = 'app.skyclause.m1ku.tech'
const MARKETING_HOST = 'skyclause.m1ku.tech'

test.describe('sign-in under HOST_MODE=multi', () => {
  test.describe.configure({ mode: 'serial' })
  let server: ChildProcess | undefined
  test.beforeAll(async ({ request }) => {
    server = spawn(process.execPath, [path.resolve(import.meta.dirname, '../../.next/standalone/apps/web/server.js')], {
      env: {
        ...process.env,
        APP_ENV: 'test',
        IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
        EMAIL_HASH_KEY: 'test-only-email-hash-key-for-playwright-runs',
        PLANTED_ROUTES: '',
        HOST_MODE: 'multi',
        MARKETING_ORIGIN: `https://${MARKETING_HOST}`,
        APP_ORIGIN: `https://${APP_HOST}`,
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
            .get(`${origin}/health`, { headers: { host: APP_HOST } })
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

  test('every link on the sign-in and sign-up pages answers on the host it names', async ({ request }) => {
    for (const page of ['/sign-in', '/sign-up', '/sign-in?state=link-expired', '/sign-in?next=%2Fnew']) {
      const response = await request.get(`${origin}${page}`, { headers: { host: APP_HOST }, maxRedirects: 0 })
      expect(response.status(), page).toBe(200)
      const html = await response.text()
      const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((match) => match[1]!.replaceAll('&amp;', '&'))
      expect(hrefs, page).toContain(`https://${MARKETING_HOST}/`)
      expect(hrefs, page).toContain(`https://${MARKETING_HOST}/legal/privacy`)
      for (const href of hrefs.filter((value) => !value.startsWith('#'))) {
        const url = new URL(href, `https://${APP_HOST}${page}`)
        // Only this deploy's own hosts are fetched; a credit's licence or Commons page is another site's.
        if (!url.hostname.endsWith('skyclause.m1ku.tech')) continue
        const target = await request.get(`${origin}${url.pathname}${url.search}`, {
          headers: { host: url.host },
          maxRedirects: 0
        })
        expect(`${target.status()} ${url.href}`, `${page} links to ${href}`).toMatch(/^(200|30[37]) /)
      }
    }
  })

  test('a signed-in account is sent on to the app, with no form', async ({ request }) => {
    const account = await makeAccount()
    const { cookie } = await signIn(account.id)
    const secure = cookie.startsWith('__Secure-') ? cookie : `__Secure-${cookie}`
    const response = await request.get(`${origin}/sign-in?next=%2Fnew`, {
      headers: { host: APP_HOST, cookie: secure },
      maxRedirects: 0
    })
    // The page streams, so the redirect rides in the document for the client to follow, and no form is drawn.
    const html = await response.text()
    expect(html).toContain('NEXT_REDIRECT;replace;/api/auth/continue?next=%2Fnew;307;')
    expect(html).not.toContain('name="email"')
  })
})
