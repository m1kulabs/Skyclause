// The built server as production runs it (HOST_MODE=multi with production's origins, test-only routes off), for
// specs that walk signed-in pages with a real session and the real API behind the app host's `/api/v1` bridge. The
// browser asks for https://app.skyclause.m1ku.tech; every such request is answered by this server under its own Host.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import path from 'node:path'
import { expect, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test'

export const APP_HOST = 'app.skyclause.m1ku.tech'
export const APP = `https://${APP_HOST}`

/** Starts the multi-host server on `port` (one per spec file, so parallel workers never share one); returns its stop. */
export async function startProductionServer(port: number, request: APIRequestContext): Promise<() => Promise<void>> {
  const server = spawn(
    process.execPath,
    [path.resolve(import.meta.dirname, '../../.next/standalone/apps/web/server.js')],
    {
      env: {
        ...process.env,
        APP_ENV: 'test',
        IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
        EMAIL_HASH_KEY: 'test-only-email-hash-key-for-playwright-runs',
        PLANTED_ROUTES: '',
        HOST_MODE: 'multi',
        MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
        APP_ORIGIN: APP,
        API_ORIGIN: 'https://api.skyclause.m1ku.tech',
        MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
        EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
        DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech',
        HOSTNAME: 'localhost',
        PORT: String(port)
      },
      stdio: 'ignore'
    }
  )
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw new Error(`Multi-host server exited: ${server.exitCode}`)
        return request
          .get(`http://localhost:${port}/health`, { headers: { host: APP_HOST } })
          .then((response) => response.status())
          .catch(() => 0)
      },
      { timeout: 30_000 }
    )
    .toBe(200)
  return async () => {
    if (server.exitCode !== null) return
    const closed = once(server, 'exit')
    server.kill('SIGTERM')
    await closed
  }
}

/** Every request to the production hosts answered by the server on `port`; event streams by their status only. */
async function serveProductionHosts(context: BrowserContext, request: APIRequestContext, port: number) {
  await context.route(/^https:\/\/([a-z]+\.)?skyclause\.m1ku\.tech\//, async (route) => {
    const sent = route.request()
    const url = new URL(sent.url())
    const headers: Record<string, string> = { ...(await sent.allHeaders()), host: url.host }
    if (headers.accept === 'text/event-stream') {
      const status = await new Promise<number>((resolve, reject) => {
        const head = http.get({ port, path: `${url.pathname}${url.search}`, headers }, (response) => {
          resolve(response.statusCode ?? 0)
          response.destroy()
        })
        head.on('error', reject)
      })
      await route.fulfill({ status, body: '' })
      return
    }
    const response = await request.fetch(`http://localhost:${port}${url.pathname}${url.search}`, {
      method: sent.method(),
      headers,
      data: sent.postDataBuffer() ?? undefined,
      maxRedirects: 0
    })
    await route.fulfill({ response })
  })
}

/** A signed-in session cookie (`name=value`) as the https app origin names it (Better Auth's `__Secure-` prefix). */
export const secureCookie = (cookie: string) => (cookie.startsWith('__Secure-') ? cookie : `__Secure-${cookie}`)

export interface ShellSeed {
  org: { id: string; slug: string; name: string }
  role?: string
  projects: Array<{ id: string; name: string; slug: string }>
}

/** The planted shell data the test runtime's app layout reads in place of the API (its server reads can't). */
export const shellCookieValue = (shell: ShellSeed | null) =>
  encodeURIComponent(
    JSON.stringify(
      shell
        ? {
            memberships: [
              {
                org_id: shell.org.id,
                org_name: shell.org.name,
                org_slug: shell.org.slug,
                role: shell.role ?? 'owner'
              }
            ],
            projects: shell.projects.map((project) => ({
              id: project.id,
              name: project.name,
              slug: project.slug,
              org_id: shell.org.id
            }))
          }
        : { memberships: [], projects: [] }
    )
  )

/**
 * A page on the app host signed in with `cookie`. The test runtime's shell reads its organisations and projects from
 * the planted harness cookie, never the API: `shell` plants the member's real ones there, so the bar shows what
 * production's shell would read. Every other read is the browser's, through the bridge. `log` records each response.
 */
export async function productionPage(
  browser: Browser,
  request: APIRequestContext,
  port: number,
  cookie: string,
  shell: ShellSeed | null,
  viewport = { width: 1440, height: 900 }
) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport })
  await serveProductionHosts(context, request, port)
  const [name, value] = secureCookie(cookie).split(/=(.*)/s) as [string, string]
  const cookies = { domain: APP_HOST, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const }
  await context.addCookies([
    { name, value, ...cookies },
    { name: 'skyclause-test-shell', value: shellCookieValue(shell), ...cookies }
  ])
  const page = await context.newPage()
  const log: string[] = []
  page.on('response', (response) => log.push(`${response.status()} ${response.request().method()} ${response.url()}`))
  const close = async () => {
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  }
  return { context, page, log, close }
}
