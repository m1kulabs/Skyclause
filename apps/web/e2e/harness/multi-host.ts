// Spec §4 Hosts as production runs them: the built standalone server in HOST_MODE=multi with production's six
// origins, and a browser whose requests to those hosts this server answers under their own Host header.
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import path from 'node:path'
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test'

export const RUN_APP = 'web-413187272599.asia-southeast1.run.app'
export const PRODUCTION_ORIGINS = {
  MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
  APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
  API_ORIGIN: 'https://api.skyclause.m1ku.tech',
  MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
  EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
  DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech'
}

/** Starts the build's standalone server on `port` with production's host settings; `stop` ends it. */
export async function startMultiHost(request: APIRequestContext, port: number): Promise<() => Promise<void>> {
  const server: ChildProcess = spawn(
    process.execPath,
    [path.resolve(import.meta.dirname, '../../.next/standalone/apps/web/server.js')],
    {
      env: {
        ...process.env,
        APP_ENV: 'test',
        IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
        EMAIL_HASH_KEY: 'test-only-email-hash-key-for-playwright-runs',
        // Production's setting, whatever the shell exports: the test-only routes are off.
        PLANTED_ROUTES: '',
        HOST_MODE: 'multi',
        ...PRODUCTION_ORIGINS,
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
          .get(`http://localhost:${port}/health`, { headers: { host: RUN_APP } })
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

/**
 * Answers every request a browser sends to the production hosts from the server on `port`, under the request's own
 * Host, so a page runs on https://app.skyclause.m1ku.tech exactly as the client build computes its URLs. Redirects
 * reach the browser as they are, which follows them. An event stream is answered with its status and headers only;
 * `streams` records it.
 */
export async function serveProductionHosts(
  context: BrowserContext,
  request: APIRequestContext,
  port: number,
  streams: string[] = []
) {
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
      streams.push(`${status} ${sent.method()} ${sent.url()}`)
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
