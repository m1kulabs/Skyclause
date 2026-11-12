import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import path from 'node:path'
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { addMember, inOrg, makeAccount, makeOrg, signIn } from '@skyclause/auth/testing'
import { makeBundle, makeCall, makeProject, makeProjectPack, makeRun } from '@skyclause/db/test/factories/index'

// P0-3: getDashboard has no handler, so `/{org}` composes the dashboard from the reads that are built. This runs the
// built server as production does (HOST_MODE=multi, the six origins, test-only routes off) with a real session and
// the real API behind the app host's `/api/v1` bridge: no read is a double.
const port = Number(process.env.E2E_PORT ?? 3100) + 60
const origin = `http://localhost:${port}`
const APP_HOST = 'app.skyclause.m1ku.tech'
const APP = `https://${APP_HOST}`

/** A real member of a new organisation: the session cookie as the https app origin names it. */
async function member(orgId: string) {
  const account = await makeAccount()
  await addMember(orgId, account.id, 'owner')
  const { cookie } = await signIn(account.id)
  return cookie.startsWith('__Secure-') ? cookie : `__Secure-${cookie}`
}

/** Every request to the production hosts answered by this server under its own Host; event streams by status only. */
async function serveProductionHosts(context: BrowserContext, request: APIRequestContext) {
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
    const response = await request.fetch(`${origin}${url.pathname}${url.search}`, {
      method: sent.method(),
      headers,
      data: sent.postDataBuffer() ?? undefined,
      maxRedirects: 0
    })
    await route.fulfill({ response })
  })
}

/**
 * The test runtime's shell reads its organisations and projects from the planted harness cookie, never the API (its
 * server reads can't reach this scratch database): plant the member's real organisation and projects there, so the
 * bar shows what production's shell would read. The dashboard's own reads are the browser's, through the bridge.
 */
async function signedInPage(
  browser: import('@playwright/test').Browser,
  request: APIRequestContext,
  cookie: string,
  shell: { org: { id: string; slug: string }; projects: Array<{ id: string; name: string; slug: string }> }
) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } })
  await serveProductionHosts(context, request)
  const [name, value] = cookie.split(/=(.*)/s) as [string, string]
  const data = {
    // makeOrg names an organisation by its slug when given one.
    memberships: [{ org_id: shell.org.id, org_name: shell.org.slug, org_slug: shell.org.slug, role: 'owner' }],
    projects: shell.projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      org_id: shell.org.id
    }))
  }
  const cookies = { domain: APP_HOST, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const }
  await context.addCookies([
    { name, value, ...cookies },
    { name: 'skyclause-test-shell', value: encodeURIComponent(JSON.stringify(data)), ...cookies }
  ])
  const page = await context.newPage()
  const log: string[] = []
  page.on('response', (response) => log.push(`${response.status()} ${response.request().method()} ${response.url()}`))
  return { context, page, log }
}

const verdict = (windowId: string) => ({
  scope: { kind: 'window', id: windowId },
  pack: 'sky',
  mode: 'outdoor_limited',
  watch: false,
  no_call: null,
  recommendations: [],
  clauses: [],
  open_from: null
})

test.describe('the organisation dashboard on a production-style server', () => {
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

  test('a member’s dashboard is composed from the built reads: a bundle to review, a window at risk, every block', async ({
    browser,
    request
  }) => {
    const org = await makeOrg({ slug: `campus-${crypto.randomUUID().slice(0, 8)}` })
    const cookie = await member(org.id)
    const project = await inOrg(org.id, async (tx) => {
      const row = await makeProject(tx, { name: 'Bukit Jalil campus' })
      await makeProjectPack(tx, { projectId: row.id, pack: 'sky' })
      return row
    })
    // The window is declared through the API, as the Windows page declares it.
    const startsAt = new Date(Date.now() + 10 * 60_000)
    const declared = await request.fetch(`${origin}/api/v1/projects/${project.id}/windows`, {
      method: 'POST',
      headers: {
        host: APP_HOST,
        origin: APP,
        cookie,
        'content-type': 'application/json',
        'skyclause-organization': org.slug,
        'idempotency-key': crypto.randomUUID()
      },
      data: {
        title: 'Open-air lecture',
        kind: 'class',
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        tz: 'Asia/Kuala_Lumpur'
      }
    })
    expect(declared.status(), await declared.text()).toBe(201)
    const window = (await declared.json()) as { id: string }
    // The clause run's drafted bundle for it, waiting for review with ten minutes of SLA left.
    await inOrg(org.id, async (tx) => {
      const run = await makeRun(tx, { projectId: project.id, pack: 'sky', trigger: 'window' })
      const bundle = await makeBundle(tx, {
        runId: run.id,
        state: 'needs_review',
        needsReviewAt: new Date(),
        slaDueAt: new Date(Date.now() + 10 * 60_000)
      })
      await makeCall(tx, {
        bundleId: bundle.id,
        windowId: window.id,
        mode: 'outdoor_limited',
        reason: 'Rain over the threshold at the site gauge.',
        shadow: verdict(window.id),
        chosen: 'agent',
        agrees: true
      })
    })

    const { context, page, log } = await signedInPage(browser, request, cookie, { org, projects: [project] })
    await page.goto(`${APP}/${org.slug}`)
    const review = page.locator('[data-dashboard-block="needs_review"]')
    await expect(review.locator('h2#dashboard-needs-review')).toHaveText('Needs review')
    await expect(review.locator('[data-bundle]')).toHaveCount(1)
    await expect(review).toContainText('Bukit Jalil campus')
    await expect(page.locator('header').getByText('1 bundle needs review:')).toBeVisible()
    const risk = page.locator('[data-dashboard-block="windows_at_risk"]')
    await expect(risk.getByRole('link', { name: /Open-air lecture/ })).toHaveAttribute(
      'href',
      `/${org.slug}/${project.slug}/windows?window=${window.id}`
    )
    await expect(page.locator('[data-dashboard-block="signal_health"]')).toContainText('No sources connected (n=0)')
    await expect(page.locator('[data-dashboard-block="upcoming_risks"]')).toContainText(
      'No listed shows or forecast risks (n=0)'
    )
    await expect(page.locator('[data-dashboard-block="yesterday_grades"]')).toContainText('No graded windows yet (n=0)')
    await expect(page.locator('[data-source-error]')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(/not built|answered|Couldn’t read/i)
    await page.screenshot({ path: test.info().outputPath('dashboard-1440.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: test.info().outputPath('dashboard-390.png'), fullPage: true })

    // The composed reads went through the app host's bridge with the session, and each answered.
    const reads = log.filter((line) => line.includes('/api/v1/projects/'))
    for (const read of ['/bundles?', '/windows?', '/sources?', '/days?', '/nights?', '/grades?'])
      expect(reads.find((line) => line.includes(read))).toMatch(/^200 GET /)
    expect(log.filter((line) => /^501 GET .*\/api\/v1\/dashboard$/.test(line))).toHaveLength(1)
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('a brand-new organisation gets the one action, Create a project, and the Review heading', async ({
    browser,
    request
  }) => {
    const org = await makeOrg({ slug: `campus-${crypto.randomUUID().slice(0, 8)}` })
    const { context, page } = await signedInPage(browser, request, await member(org.id), { org, projects: [] })
    await page.goto(`${APP}/${org.slug}`)
    await expect(page.locator('h2#dashboard-needs-review')).toHaveText('Needs review')
    await expect(page.locator('main').getByRole('link', { name: 'Create a project' })).toHaveAttribute(
      'href',
      `/${org.slug}/new`
    )
    // The one action: every block's own action would open Create a project too, so they offer none.
    await expect(page.getByRole('region', { name: 'Dashboard' }).getByRole('link')).toHaveCount(1)
    await expect(page.locator('[data-source-error]')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath('dashboard-new-1440.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: test.info().outputPath('dashboard-new-390.png'), fullPage: true })
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('a large organisation reads its six most recently active projects and says so', async ({ browser, request }) => {
    const org = await makeOrg({ slug: `campus-${crypto.randomUUID().slice(0, 8)}` })
    const cookie = await member(org.id)
    const projects = await inOrg(org.id, async (tx) => {
      const rows = []
      for (let index = 1; index <= 9; index += 1) rows.push(await makeProject(tx, { name: `Campus ${index}` }))
      return rows
    })
    const { context, page, log } = await signedInPage(browser, request, cookie, { org, projects })
    await page.goto(`${APP}/${org.slug}`)
    await expect(page.locator('[data-dashboard-covered]')).toHaveText(
      'Showing 6 of 9 projects: the most recently active.'
    )
    await expect(page.locator('[data-source-error]')).toHaveCount(0)
    const read = new Set(
      log.filter((line) => line.includes('/bundles?')).map((line) => line.split('/api/v1/projects/')[1]!.split('/')[0])
    )
    expect(read.size).toBe(6)
    await page.screenshot({ path: test.info().outputPath('dashboard-capped-1440.png'), fullPage: true })
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })
})
