import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'
import type { Role } from '@skyclause/contracts'
import { addMember, inOrg, makeAccount, makeApiKey, makeOrg, signIn } from '@skyclause/auth/testing'
import { makeProject, makeProjectPack } from '@skyclause/db/test/factories/index'

// Spec §4 Hosts through the built server's proxy.ts in HOST_MODE=multi, with production's six origins.
const port = 3102
const origin = `http://localhost:${port}`
const RUN_APP = 'web-413187272599.asia-southeast1.run.app'
const APP_HOST = 'app.skyclause.m1ku.tech'
const APP = `https://${APP_HOST}`

/**
 * An organisation with one project and its sky pack, an Owner and a Viewer in it, and another organisation with a
 * project of its own. Each member's session cookie is named as this server's https APP_ORIGIN names it (Better
 * Auth's `__Secure-` prefix); the signed value is the one Playwright's own server would read.
 */
async function seedBridge() {
  const org = await makeOrg()
  const other = await makeOrg()
  const project = await inOrg(org.id, async (tx) => {
    const row = await makeProject(tx, { name: 'Bridge read' })
    await makeProjectPack(tx, { projectId: row.id, pack: 'sky' })
    return row
  })
  const foreign = await inOrg(other.id, (tx) => makeProject(tx))
  const member = async (role: Role) => {
    const account = await makeAccount()
    await addMember(org.id, account.id, role)
    const { cookie } = await signIn(account.id)
    return { accountId: account.id, cookie: cookie.startsWith('__Secure-') ? cookie : `__Secure-${cookie}` }
  }
  return { org, other, project, foreign, owner: await member('owner'), viewer: await member('viewer') }
}

/**
 * Answers every request a browser sends to the production hosts from this server, under the request's own Host, so
 * the page runs on https://app.skyclause.m1ku.tech exactly as the client build computes its URLs. An event stream is
 * answered with its status and headers only; `streams` records it.
 */
async function serveProductionHosts(context: BrowserContext, request: APIRequestContext, streams: string[]) {
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
    const response = await request.fetch(`${origin}${url.pathname}${url.search}`, {
      method: sent.method(),
      headers,
      data: sent.postDataBuffer() ?? undefined,
      maxRedirects: 0
    })
    await route.fulfill({ response })
  })
}

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

  // #737: the browser's `/v1` operations reach the API through the app host's own `/api/v1`, where its host-only
  // session cookie goes. No other host serves that bridge, and `/v1` itself stays on the API host.
  test('only the app host serves /v1 at /api/v1; an unknown operation there is a 404 problem', async ({ request }) => {
    const get = (host: string, pathname: string) =>
      request.get(`${origin}${pathname}`, { headers: { host }, maxRedirects: 0 })

    const unknown = await get(APP_HOST, '/api/v1/no-such-operation')
    expect(unknown.status()).toBe(404)
    expect(unknown.headers()['content-type']).toMatch(/^application\/problem\+json/)

    const anonymous = await get(APP_HOST, '/api/v1/projects?slug=bukit-jalil&limit=200')
    expect(anonymous.status()).toBe(401)
    expect(anonymous.headers()['content-type']).toMatch(/^application\/problem\+json/)
    expect((await anonymous.json()).type).toBe('https://docs.skyclause.m1ku.tech/problems/unauthenticated')

    for (const prefix of ['', 'api.', 'mcp.', 'embed.', 'docs.']) {
      const host = `${prefix}skyclause.m1ku.tech`
      const response = await get(host, '/api/v1/projects?slug=bukit-jalil&limit=200')
      expect(response.status(), host).toBe(404)
      expect(response.headers()['content-type'], host).toMatch(/^text\/html/)
    }
  })

  test('a signed-in browser on the app host reads its project by slug and by id there', async ({
    browser,
    request
  }) => {
    const seed = await seedBridge()
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const streams: string[] = []
    await serveProductionHosts(context, request, streams)
    const [name, value] = seed.owner.cookie.split(/=(.*)/s) as [string, string]
    await context.addCookies([
      { name, value, domain: APP_HOST, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }
    ])
    const page = await context.newPage()
    const log: string[] = []
    page.on('response', (response) => log.push(`${response.status()} ${response.request().method()} ${response.url()}`))

    const listed = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/v1/projects'))
    const detailed = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/v1/projects/${seed.project.id}`)
    )
    await page.goto(`${APP}/${seed.org.slug}/${seed.project.slug}/settings`)
    const list = await listed
    expect(`${list.status()} ${list.url()}`).toBe(`200 ${APP}/api/v1/projects?slug=${seed.project.slug}&limit=200`)
    const detail = await detailed
    expect(`${detail.status()} ${detail.url()}`).toBe(`200 ${APP}/api/v1/projects/${seed.project.id}`)
    await expect(page.locator('#project-name')).toHaveValue('Bridge read')

    const record = [...log, ...streams.map((line) => `${line} (event stream)`)].join('\n')
    await writeFile(test.info().outputPath('network.log'), `${record}\n`)
    await test.info().attach('network.log', { body: record, contentType: 'text/plain' })
    expect(log.filter((line) => line.includes(`${APP}/v1/`))).toEqual([])
    expect(log.filter((line) => line.includes('://api.skyclause.m1ku.tech'))).toEqual([])
    expect(streams.filter((line) => line.includes(`${APP}/v1/`) || line.includes('://api.'))).toEqual([])
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('the bridge keeps the organisation, role, origin and credential checks', async ({ request }) => {
    const seed = await seedBridge()
    const call = (
      method: string,
      pathname: string,
      o: { cookie?: string; org?: string; origin?: string; authorization?: string; body?: unknown; host?: string } = {}
    ) =>
      request.fetch(`${origin}${pathname}`, {
        method,
        maxRedirects: 0,
        headers: {
          host: o.host ?? APP_HOST,
          accept: 'application/json',
          ...(o.cookie ? { cookie: o.cookie } : {}),
          ...(o.org ? { 'skyclause-organization': o.org } : {}),
          ...(o.origin ? { origin: o.origin } : {}),
          ...(o.authorization ? { authorization: o.authorization } : {}),
          ...(o.body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(o.body === undefined ? {} : { data: JSON.stringify(o.body) })
      })
    const problem = async (response: Awaited<ReturnType<typeof call>>) => {
      expect(response.headers()['content-type']).toMatch(/^application\/problem\+json/)
      const body = await response.json()
      return `${String(body.type).split('/').at(-1)}: ${body.detail}`
    }
    const owner = { cookie: seed.owner.cookie, org: seed.org.slug }
    const detail = `/api/v1/projects/${seed.project.id}`

    const own = await call('GET', `/api/v1/projects?slug=${seed.project.slug}&limit=200`, owner)
    expect(own.status()).toBe(200)
    expect((await own.json()).data.map((row: { id: string }) => row.id)).toEqual([seed.project.id])

    // The organisation is the member's own: another one, or another one's project, is 404.
    const elsewhere = await call('GET', '/api/v1/projects?limit=200', { ...owner, org: seed.other.slug })
    expect(elsewhere.status()).toBe(404)
    expect(await problem(elsewhere)).toBe('not-found: No such organisation, or you are not a member of it.')
    const foreign = await call('GET', `/api/v1/projects/${seed.foreign.id}`, owner)
    expect(foreign.status()).toBe(404)
    expect(await problem(foreign)).toBe('not-found: No project with this ID.')

    // A Viewer may read the project, not manage its sources.
    const viewer = { cookie: seed.viewer.cookie, org: seed.org.slug, origin: APP }
    expect((await call('GET', detail, viewer)).status()).toBe(200)
    const viewerWrite = await call('PATCH', `${detail}/packs/sky`, { ...viewer, body: { sla_s: 600 } })
    expect(viewerWrite.status()).toBe(403)
    expect(await problem(viewerWrite)).toBe('insufficient-scope: This operation needs sources.manage.')

    // A cookie write must come from APP_ORIGIN, as on /api; from it, the write lands.
    for (const writeOrigin of ['https://evil.example', undefined]) {
      const refused = await call('PATCH', `${detail}/packs/sky`, {
        ...owner,
        origin: writeOrigin,
        body: { sla_s: 600 }
      })
      expect(refused.status(), String(writeOrigin)).toBe(403)
      expect(await problem(refused)).toBe('insufficient-scope: A cookie write must come from the app origin.')
    }
    const written = await call('PATCH', `${detail}/packs/sky`, { ...owner, origin: APP, body: { sla_s: 600 } })
    expect(written.status()).toBe(200)
    expect(await written.json()).toMatchObject({ pack: 'sky', sla_s: 600 })
    const reread = await call('GET', detail, owner)
    expect((await reread.json()).packs).toEqual(expect.arrayContaining([expect.objectContaining({ sla_s: 600 })]))

    // An API key is refused on the app host, as /api refuses it; the API host still serves it.
    const { key } = await makeApiKey({ orgId: seed.org.id, accountId: seed.owner.accountId, scopes: ['read'] })
    const keyed = await call('GET', '/api/v1/projects?limit=200', { authorization: `Bearer ${key}` })
    expect(keyed.status()).toBe(403)
    expect(await problem(keyed)).toBe('insufficient-scope: /api admits only signed-in sessions, never keys or tokens.')
    const keyedOnApi = await call('GET', '/v1/projects?limit=200', {
      host: 'api.skyclause.m1ku.tech',
      authorization: `Bearer ${key}`
    })
    expect(keyedOnApi.status()).toBe(200)

    // The organisation event stream takes the same path: the API's own answer (not built yet), never the 404 page.
    const stream = await call('GET', '/api/v1/events/stream', owner)
    expect(stream.status()).toBe(501)
    expect(await problem(stream)).toMatch(/^not-built: /)
    const anonymousStream = await call('GET', '/api/v1/events/stream', { org: seed.org.slug })
    expect(anonymousStream.status()).toBe(401)
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
