// The pages a visitor meets first, walked on the hosts production serves them from (spec §4 Hosts): every link and
// form on the landing, the legal pages, sign-in, sign-up and both hosts' not-found pages, as rendered on their own
// host, is followed through this HOST_MODE=multi server, and none may end on "Page not found" or an error. The
// single-host e2e server can't see a relative link that crosses hosts; this one can. The rest pins what the hosts
// answer around those links: the redirects between them, sign-in for a signed-out visit to the app, the beacon, the
// metadata and share cards, robots.txt and sitemap.xml, the saved language and the public pages' theme.
import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { addMember, inOrg, makeAccount, makeOrg, makeShareLinkFor, signIn } from '@skyclause/auth/testing'
import { makeProject } from '@skyclause/db/test/factories/index'
import { serveProductionHosts, startMultiHost } from './harness/multi-host'

// Its own port: landing-hero.spec.ts takes E2E_PORT + 4 and may run beside this file.
const port = Number(process.env.E2E_PORT ?? 3100) + 8
const origin = `http://localhost:${port}`
const MARKETING = 'https://skyclause.m1ku.tech'
const APP = 'https://app.skyclause.m1ku.tech'
const OURS = /^https:\/\/([a-z]+\.)?skyclause\.m1ku\.tech$/
/** A documentation-range address (RFC 3849): each test is its own visitor to the API's per-address limits. */
const visitorAddress = () => `2001:db8::${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`

/** The pages walked, each on the host that serves it. */
const START: Array<[string, string]> = [
  ['the landing', `${MARKETING}/`],
  ['the privacy notice', `${MARKETING}/legal/privacy`],
  ['the terms', `${MARKETING}/legal/terms`],
  ['the Malay privacy notice', `${MARKETING}/ms/legal/privacy`],
  ['sign-in', `${APP}/sign-in`],
  ['sign-up', `${APP}/sign-up`],
  ['the marketing host’s not-found page', `${MARKETING}/no-such-page`],
  ['the marketing host’s legal not-found page', `${MARKETING}/legal/no-such-page`],
  ['the app host’s not-found page', `${APP}/aaa/bbb/ccc/ddd`],
  ['the app host’s unknown organisation', `${APP}/no-such-organisation`]
]

interface Found {
  kind: 'link' | 'form'
  url: string
  method: string
  /** The element's own words, to name it in a failure. */
  name: string
  /** For an in-page link: whether its target is on the page. */
  target?: boolean
}

/** Every `a[href]` and form on the page, as the browser resolves them. */
const collect = (page: Page) =>
  page.evaluate((): Found[] => {
    const name = (element: Element) =>
      (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    const links = [...document.querySelectorAll('a[href]')].map((anchor) => {
      const url = new URL((anchor as HTMLAnchorElement).href)
      const inPage =
        url.hash.length > 1 &&
        url.origin + url.pathname + url.search === location.origin + location.pathname + location.search
      return {
        kind: 'link' as const,
        url: url.href,
        method: 'GET',
        name: name(anchor),
        ...(inPage ? { target: document.getElementById(decodeURIComponent(url.hash.slice(1))) !== null } : {})
      }
    })
    const forms = [...document.querySelectorAll('form')].map((form) => ({
      kind: 'form' as const,
      // A form without an action posts to the page itself, as the browser resolves `form.action`.
      url: form.action,
      method: form.method.toUpperCase(),
      name: name(form.querySelector('button, [type="submit"]') ?? form)
    }))
    return [...links, ...forms]
  })

/** Follows `url` through this server, hop by hop, until an answer that isn't a redirect to one of the hosts. */
async function follow(request: APIRequestContext, url: string) {
  let at = new URL(url)
  for (let hop = 0; hop < 6; hop++) {
    const response = await request.get(`${origin}${at.pathname}${at.search}`, {
      headers: { host: at.host, 'x-forwarded-for': visitorAddress() },
      maxRedirects: 0
    })
    const status = response.status()
    const location = response.headers().location
    if (status >= 300 && status < 400 && location) {
      const next = new URL(location, at)
      if (!OURS.test(next.origin)) return { status, at: next.href, notFound: false }
      at = next
      continue
    }
    const html = (response.headers()['content-type'] ?? '').startsWith('text/html') ? await response.text() : ''
    return { status, at: at.href, notFound: html.includes('data-status-code="404"') }
  }
  throw new Error(`${url} redirects more than five times`)
}

/**
 * Posts a plain form to `url` from its own origin, as a browser without JavaScript does, then follows the answer as
 * `follow` does. The address is never a real one, so no form here sends mail.
 */
async function submit(request: APIRequestContext, url: string) {
  const at = new URL(url)
  const response = await request.post(`${origin}${at.pathname}${at.search}`, {
    headers: { host: at.host, origin: at.origin, 'x-forwarded-for': visitorAddress() },
    form: { email: 'not-an-address' },
    maxRedirects: 0
  })
  const status = response.status()
  const location = response.headers().location
  if (status >= 300 && status < 400 && location) {
    const next = new URL(location, at)
    return OURS.test(next.origin) ? follow(request, next.href) : { status, at: next.href, notFound: false }
  }
  const html = (response.headers()['content-type'] ?? '').startsWith('text/html') ? await response.text() : ''
  return { status, at: at.href, notFound: html.includes('data-status-code="404"') }
}

test.describe('HOST_MODE=multi, as a visitor meets it', () => {
  test.describe.configure({ mode: 'serial' })
  let stop: (() => Promise<void>) | undefined
  test.beforeAll(async ({ request }) => {
    stop = await startMultiHost(request, port)
  })
  test.afterAll(async () => {
    await stop?.()
  })

  for (const [label, start] of START) {
    test(`every link and form on ${label} reaches a page`, async ({ browser, request }) => {
      const context = await browser.newContext({ serviceWorkers: 'block' })
      await serveProductionHosts(context, request, port)
      const page = await context.newPage()
      const problems: string[] = []
      const beacons: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy|violates/i.test(message.text()))
          problems.push(`console: ${message.text()}`)
      })
      page.on('request', (sent) => {
        if (sent.method() === 'POST' && new URL(sent.url()).pathname === '/e') beacons.push(new URL(sent.url()).origin)
      })
      await page.setExtraHTTPHeaders({ 'x-forwarded-for': visitorAddress() })
      await page.goto(start)
      await page.waitForLoadState('load')
      const found = await collect(page)
      expect(found.length, `${label} has links`).toBeGreaterThan(0)

      for (const item of found) {
        const where = `${item.kind} "${item.name}" → ${item.url}`
        const url = new URL(item.url)
        // An in-page link (the skip link, a section anchor) only needs its target on this page.
        if (item.target !== undefined) {
          if (!item.target) problems.push(`${where}: nothing on the page has that id`)
          continue
        }
        if (url.protocol === 'mailto:') continue
        if (!OURS.test(url.origin)) {
          if (url.protocol !== 'https:') problems.push(`${where}: an external link must be absolute https`)
          continue
        }
        if (item.method !== 'GET' && url.origin !== new URL(page.url()).origin) {
          // The CSP's form-action 'self' needs a form that posts on the page's own origin.
          problems.push(`${where}: posts to another origin`)
          continue
        }
        const end = item.method === 'GET' ? await follow(request, item.url) : await submit(request, item.url)
        if (end.notFound) problems.push(`${where}: ends on "Page not found" at ${end.at}`)
        else if (end.status >= 400) problems.push(`${where}: ends on ${end.status} at ${end.at}`)
      }

      // Each page beacons its vitals to its own origin, which serves /e and its CSP allows.
      await expect.poll(() => beacons.length, { timeout: 10_000 }).toBeGreaterThan(0)
      for (const beacon of beacons) expect(beacon, 'the vitals beacon’s origin').toBe(new URL(page.url()).origin)
      await test.info().attach('links', {
        body: found.map((item) => `${item.kind} ${item.method} ${item.url}`).join('\n'),
        contentType: 'text/plain'
      })
      expect(problems, `${label}:\n${problems.join('\n')}`).toEqual([])
      await context.unrouteAll({ behavior: 'ignoreErrors' })
      await context.close()
    })
  }

  test('sign-in’s privacy link opens the marketing host’s page as a document, with no redirect on the way', async ({
    browser,
    request
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await serveProductionHosts(context, request, port)
    const page = await context.newPage()
    const blocked: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') blocked.push(message.text())
    })
    await page.goto(`${APP}/sign-in`)
    await page.waitForLoadState('networkidle')
    // The link is absolute to the marketing origin, so it never depends on the app host's redirect (which the next
    // test pins) and the router never fetches the other host's page as its own.
    const document = page.waitForResponse(
      (response) => response.request().isNavigationRequest() && new URL(response.url()).pathname === '/legal/privacy'
    )
    await page.locator('a[href*="/legal/privacy"]').first().click()
    const answered = await document
    expect(`${answered.status()} ${answered.url()}`).toBe(`200 ${MARKETING}/legal/privacy`)
    await expect(page.locator('h1')).toBeVisible()
    expect(blocked.filter((text) => /Content Security Policy|Failed to fetch RSC/.test(text))).toEqual([])
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('each of sign-in’s no-JavaScript form routes answers back to a page on the app host', async ({ request }) => {
    // The email, Google, confirm and resend forms; the last two render only once a link was sent.
    for (const path of ['/sign-in/link', '/sign-in/google', '/sign-in/confirm', '/sign-in/resend']) {
      const end = await submit(request, `${APP}${path}`)
      expect(end.notFound, `${path} ends on "Page not found" at ${end.at}`).toBe(false)
      expect(end.status, `${path} ends at ${end.at}`).toBe(200)
      expect(new URL(end.at).origin, path).toBe(APP)
      expect(new URL(end.at).pathname, path).toBe('/sign-in')
    }
  })

  test('a page path on the other host is redirected there, with its query; the app host’s home is sign-in’s continue', async ({
    request
  }) => {
    const answer = async (url: string, method = 'GET') => {
      const at = new URL(url)
      const response = await request.fetch(`${origin}${at.pathname}${at.search}`, {
        method,
        headers: { host: at.host, 'x-forwarded-for': visitorAddress() },
        maxRedirects: 0
      })
      return `${response.status()} ${response.headers().location ?? ''}`.trim()
    }
    const owner = await makeOrg()
    expect(await answer(`${APP}/`)).toBe(`307 ${APP}/api/auth/continue`)
    expect(await answer(`${APP}/legal/privacy?from=sign-in`)).toBe(`308 ${MARKETING}/legal/privacy?from=sign-in`)
    expect(await answer(`${APP}/ms/legal/privacy`)).toBe(`308 ${MARKETING}/ms/legal/privacy`)
    expect(await answer(`${MARKETING}/sign-in?next=%2Fnew`)).toBe(`308 ${APP}/sign-in?next=%2Fnew`)
    expect(await answer(`${MARKETING}/sign-up`)).toBe(`308 ${APP}/sign-up`)
    expect(await answer(`${MARKETING}/account/profile`)).toBe(`308 ${APP}/account/profile`)
    expect(await answer(`${MARKETING}/${owner.slug}/bukit-jalil/windows`)).toBe(
      `308 ${APP}/${owner.slug}/bukit-jalil/windows`
    )
    // An organisation that doesn't exist, an unknown path, the API and a form post stay the not-found page.
    for (const url of [
      `${MARKETING}/no-such-organisation/bukit-jalil`,
      `${MARKETING}/account/nothing-here`,
      `${MARKETING}/guest`,
      `${MARKETING}/legal/no-such-page`,
      `${MARKETING}/v1/public/commons/bukit-jalil/status`,
      `${APP}/v1/projects`,
      `${APP}/status`
    ])
      expect(await answer(url), url).toBe('404')
    expect(await answer(`${MARKETING}/sign-in`, 'POST')).toBe('404')
    // A forged forwarding header never steers where the redirect goes.
    const forged = await request.get(`${origin}/sign-in`, {
      headers: { host: 'skyclause.m1ku.tech', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' },
      maxRedirects: 0
    })
    expect(forged.headers().location).toBe(`${APP}/sign-in`)
    const unknown = await request.get(`${origin}/sign-in`, { headers: { host: 'evil.example' }, maxRedirects: 0 })
    expect(unknown.status()).toBe(404)
  })

  test('sign-in’s continue sends a signed-out visitor to sign-in and a member to their organisation', async ({
    request
  }) => {
    const continued = (cookie?: string) =>
      request.get(`${origin}/api/auth/continue`, {
        headers: { host: 'app.skyclause.m1ku.tech', ...(cookie ? { cookie } : {}) },
        maxRedirects: 0
      })
    expect((await continued()).headers().location).toBe('/sign-in')
    const org = await makeOrg()
    const account = await makeAccount()
    await addMember(org.id, account.id, 'owner')
    const { cookie } = await signIn(account.id)
    const member = await continued(cookie.startsWith('__Secure-') ? cookie : `__Secure-${cookie}`)
    expect(member.headers().location).toBe(`/${org.slug}`)
  })

  test('a signed-out visit to the app goes to sign-in and back, never to a shell of errors', async ({ request }) => {
    const org = await makeOrg()
    const project = await inOrg(org.id, (tx) => makeProject(tx))
    for (const path of [
      `/${org.slug}`,
      `/${org.slug}/${project.slug}`,
      `/${org.slug}/${project.slug}/ledger?tab=evidence`,
      `/${org.slug}/settings/members`,
      '/account/profile',
      '/connect',
      '/new',
      '/developers/webhooks'
    ]) {
      const response = await request.get(`${origin}${path}`, {
        headers: { host: 'app.skyclause.m1ku.tech' },
        maxRedirects: 0
      })
      // A real redirect, before any of the shell is sent.
      expect(`${response.status()} ${response.headers().location}`, path).toBe(
        `307 /sign-in?next=${encodeURIComponent(path)}`
      )
    }
    const landed = await request.get(`${origin}/sign-in?next=${encodeURIComponent(`/${org.slug}/${project.slug}`)}`, {
      headers: { host: 'app.skyclause.m1ku.tech' }
    })
    expect(landed.status()).toBe(200)
    const html = await landed.text()
    expect(html).not.toMatch(/answered \d{3}/)
    expect(html).not.toContain('app-shell')
    // An unknown organisation stays the not-found page, signed out or not.
    const unknown = await request.get(`${origin}/no-such-organisation`, {
      headers: { host: 'app.skyclause.m1ku.tech' },
      maxRedirects: 0
    })
    expect(unknown.status()).toBe(404)
  })

  test('a share link still opens its project’s ledger without an account', async ({ request }) => {
    const org = await makeOrg()
    const project = await inOrg(org.id, (tx) => makeProject(tx))
    const link = await makeShareLinkFor({ orgId: org.id, access: 'reviewer', projectId: project.id })
    const response = await request.get(`${origin}/${org.slug}/${project.slug}/ledger`, {
      headers: { host: 'app.skyclause.m1ku.tech', cookie: `sc_share=${link.token}` },
      maxRedirects: 0
    })
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('ledger-page')
  })

  test('the public pages and sign-in name themselves, with a canonical URL and a share card that loads', async ({
    browser,
    request
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await serveProductionHosts(context, request, port)
    const page = await context.newPage()
    for (const [url, title, canonical] of [
      [`${MARKETING}/`, 'Skyclause · The call for every window', `${MARKETING}/`],
      [`${MARKETING}/legal/privacy`, 'Privacy notice · Skyclause', `${MARKETING}/legal/privacy`],
      [`${MARKETING}/legal/terms`, 'Terms of service · Skyclause', `${MARKETING}/legal/terms`],
      [`${MARKETING}/ms/legal/privacy`, 'Notis privasi · Skyclause', `${MARKETING}/ms/legal/privacy`],
      [`${APP}/sign-in`, 'Sign in to Skyclause', `${APP}/sign-in`],
      [`${APP}/sign-up`, 'Create an account · Skyclause', `${APP}/sign-up`]
    ] as const) {
      await page.goto(url)
      await expect(page, url).toHaveTitle(title)
      const meta = (selector: string) => page.locator(selector).first().getAttribute('content')
      expect((await meta('meta[name="description"]'))?.length, `${url} description`).toBeGreaterThan(40)
      expect(await page.locator('link[rel="canonical"]').first().getAttribute('href'), url).toBe(canonical)
      expect(await meta('meta[property="og:url"]'), url).toBe(canonical)
      expect(await meta('meta[property="og:title"]'), url).toBe(title)
      expect(await meta('meta[name="twitter:card"]'), url).toBe('summary_large_image')
      const image = await meta('meta[property="og:image"]')
      expect(image, url).toMatch(/^https:\/\/skyclause\.m1ku\.tech\/og\.png\?page=/)
      expect(await meta('meta[name="twitter:image"]'), url).toBe(image)
      const card = await request.get(`${origin}${new URL(image!).pathname}${new URL(image!).search}`, {
        headers: { host: 'skyclause.m1ku.tech' }
      })
      expect(card.status(), image!).toBe(200)
      expect(card.headers()['content-type']).toBe('image/png')
      const png = await card.body()
      // The PNG's IHDR: width and height, big-endian, at bytes 16 and 20.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], image!).toEqual([1200, 630])
    }
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('robots.txt opens the marketing host’s public pages and closes the rest; the sitemap lists them', async ({
    request
  }) => {
    const get = (host: string, path: string) => request.get(`${origin}${path}`, { headers: { host }, maxRedirects: 0 })
    const marketing = await (await get('skyclause.m1ku.tech', '/robots.txt')).text()
    expect(marketing).toContain('Allow: /\n')
    for (const closed of ['/api', '/v1', '/sign-in', '/account']) expect(marketing).toContain(`Disallow: ${closed}\n`)
    expect(marketing).toContain('Sitemap: https://skyclause.m1ku.tech/sitemap.xml')
    for (const host of ['app.skyclause.m1ku.tech', 'api.skyclause.m1ku.tech', 'mcp.skyclause.m1ku.tech']) {
      const robots = await get(host, '/robots.txt')
      expect(robots.status(), host).toBe(200)
      expect(await robots.text(), host).toBe('User-agent: *\nDisallow: /\n')
    }
    const sitemap = await get('skyclause.m1ku.tech', '/sitemap.xml')
    expect(sitemap.headers()['content-type']).toMatch(/^application\/xml/)
    const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    expect(locs).toEqual([
      'https://skyclause.m1ku.tech/',
      'https://skyclause.m1ku.tech/legal/privacy',
      'https://skyclause.m1ku.tech/legal/terms',
      'https://skyclause.m1ku.tech/ms/legal/privacy'
    ])
    for (const locUrl of locs) expect((await follow(request, locUrl!)).status, locUrl).toBe(200)
    expect((await get('app.skyclause.m1ku.tech', '/sitemap.xml')).status()).toBe(404)
  })

  test('the saved language is the language pages render in, from the next page on', async ({ browser, request }) => {
    const org = await makeOrg()
    const account = await makeAccount()
    await addMember(org.id, account.id, 'owner')
    const { cookie } = await signIn(account.id)
    const [name, value] = (cookie.startsWith('__Secure-') ? cookie : `__Secure-${cookie}`).split(/=(.*)/s) as [
      string,
      string
    ]
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-GB' })
    await serveProductionHosts(context, request, port)
    await context.addCookies([
      { name, value, domain: 'app.skyclause.m1ku.tech', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }
    ])
    const page = await context.newPage()
    await page.goto(`${APP}/account/appearance`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByText('Language and shortcuts')).toBeVisible()
    const reloaded = page.waitForEvent('load')
    await page.locator('select[name="language"]').selectOption('ms')
    await reloaded
    await expect(page.locator('html')).toHaveAttribute('lang', 'ms')
    await expect(page.getByText('Bahasa dan pintasan')).toBeVisible()
    // Every later page is in it too, ahead of the browser's English.
    await page.goto(`${APP}/account/profile`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ms')
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('the legal and not-found pages are Dusk for a visitor who made no choice, even with a light OS', async ({
    browser,
    request
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light' })
    await serveProductionHosts(context, request, port)
    const page = await context.newPage()
    for (const url of [`${MARKETING}/legal/privacy`, `${MARKETING}/no-such-page`, `${APP}/aaa/bbb/ccc/ddd`]) {
      await page.goto(url)
      await expect(page.locator('html'), url).toHaveClass(/(^| )dark( |$)/)
      await expect(page.locator('html'), url).toHaveAttribute('data-theme', 'dark')
    }
    await context.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })
})
