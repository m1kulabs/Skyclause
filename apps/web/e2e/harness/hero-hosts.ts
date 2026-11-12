import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, type APIRequestContext, type BrowserContext } from '@playwright/test'

// The landing's hero on a production-style build: the built server in HOST_MODE=multi with production's six origins
// (as hosts.spec.ts runs it), the browser on https://skyclause.m1ku.tech through routing, and a stand-in for the public
// API at the network boundary. The server's own reads of API_ORIGIN reach the stand-in through api-stand-in.mjs; the
// browser's requests to https://api.skyclause.m1ku.tech reach it through the route below. Each request is logged with
// its caller, so a spec can prove which side asked for what.

export const MARKETING = 'https://skyclause.m1ku.tech'
export const API = 'https://api.skyclause.m1ku.tech'
export const EVALUATE = '/v1/public/commons/bukit-jalil/evaluate'

export type Caller = 'server' | 'browser'

/** What the stand-in answers a request: a status, a JSON body and headers. */
export interface Answer {
  status: number
  body?: unknown
  headers?: Record<string, string>
}

/** The real API's answer for an operation it registers without a handler. */
export const NOT_BUILT: Answer = {
  status: 501,
  body: {
    type: 'https://docs.skyclause.m1ku.tech/problems/not-built',
    title: 'Not built',
    status: 501,
    detail: 'not built'
  }
}

export interface StandInApi {
  origin: string
  /** What evaluatePublicProject answers the web server's own read and the browser's; every other read is NOT_BUILT. */
  evaluate: Record<Caller, Answer>
  log: Array<{ caller: Caller | 'unknown'; method: string; path: string }>
  close: () => Promise<void>
}

// `/v1/public` answers CORS `*` without credentials and exposes no extra header (packages/api/src/cors.ts, Hono's
// defaults); the stand-in answers the same way.
const PUBLIC_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,PUT,POST,DELETE,PATCH',
  'access-control-allow-headers': 'accept,content-type'
}

export async function startStandInApi(): Promise<StandInApi> {
  const api: StandInApi = {
    origin: '',
    evaluate: { server: NOT_BUILT, browser: NOT_BUILT },
    log: [],
    close: async () => {}
  }
  const server = http.createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      const header = request.headers['x-e2e-caller']
      const caller = header === 'server' || header === 'browser' ? header : 'unknown'
      const pathname = new URL(request.url ?? '/', 'http://stand-in').pathname
      api.log.push({ caller, method: request.method ?? '', path: pathname })
      if (request.method === 'OPTIONS') {
        response.writeHead(204, PUBLIC_CORS)
        response.end()
        return
      }
      const answer = pathname === EVALUATE && caller !== 'unknown' ? api.evaluate[caller] : NOT_BUILT
      response.writeHead(answer.status, {
        ...PUBLIC_CORS,
        'content-type': answer.status >= 400 ? 'application/problem+json' : 'application/json',
        ...answer.headers
      })
      response.end(answer.body === undefined ? '' : JSON.stringify(answer.body))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  api.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  api.close = () => new Promise((resolve) => server.close(() => resolve()))
  return api
}

/** The built standalone server in HOST_MODE=multi on `port`, its API reads sent to the stand-in. */
export async function startMultiHostServer(request: APIRequestContext, port: number, standIn: string) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_ENV: 'test',
    IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
    EMAIL_HASH_KEY: 'test-only-email-hash-key-for-playwright-runs',
    // Production's setting: the test-only routes are off.
    PLANTED_ROUTES: '',
    HOST_MODE: 'multi',
    MARKETING_ORIGIN: MARKETING,
    APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
    API_ORIGIN: API,
    MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
    EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
    DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech',
    E2E_API_STAND_IN: standIn,
    // Each test sets the stand-in's answer and loads the page again: the landing's shared reads (kept 30 s, a 501 60 s)
    // would answer with the last test's. Their sharing is unit-tested (test/landing-hero/shared-read.test.ts).
    LANDING_SHARED_READS: 'off',
    HOSTNAME: 'localhost',
    PORT: String(port)
  }
  delete env.PILOT_PROJECT
  const server = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(path.join(import.meta.dirname, 'api-stand-in.mjs')).href,
      path.resolve(import.meta.dirname, '../../.next/standalone/apps/web/server.js')
    ],
    { env, stdio: 'ignore' }
  )
  const origin = `http://localhost:${port}`
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw new Error(`Multi-host server exited: ${server.exitCode}`)
        return request
          .get(`${origin}/health`)
          .then((response) => response.status())
          .catch(() => 0)
      },
      { timeout: 30_000 }
    )
    .toBe(200)
  return {
    origin,
    stop: async () => {
      if (server.exitCode !== null) return
      const closed = once(server, 'exit')
      server.kill('SIGTERM')
      await closed
    }
  }
}

/**
 * Serves the production hosts to `context`: the API host from the stand-in, as the browser's own request; every other
 * host from the multi-host server under its own Host header, as Cloud Run's domain mappings do.
 */
export async function routeProductionHosts(
  context: BrowserContext,
  request: APIRequestContext,
  o: { server: string; standIn: string }
) {
  await context.route(/^https:\/\/([a-z]+\.)?skyclause\.m1ku\.tech\//, async (route) => {
    const sent = route.request()
    const url = new URL(sent.url())
    const toApi = url.origin === API
    const headers: Record<string, string> = { ...(await sent.allHeaders()), host: url.host }
    if (toApi) headers['x-e2e-caller'] = 'browser'
    const response = await request.fetch(`${toApi ? o.standIn : o.server}${url.pathname}${url.search}`, {
      method: sent.method(),
      headers,
      data: sent.postDataBuffer() ?? undefined,
      maxRedirects: 0
    })
    await route.fulfill({ response })
  })
}
