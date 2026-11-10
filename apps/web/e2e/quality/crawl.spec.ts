// The #116 crawl: every built page, per role, in dark, light and high contrast at the project's size, at 375 px,
// at 320 px (200% zoom) and under reduced motion. One failure lists route, role, theme, size and rule.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { inspectPage, motionFindings, type Finding } from './checks'
import { KNOWN_GAPS } from './known-gaps'
import { sessions, signedOut, type Role, type Session } from './roles'
import { builtRoutes, type CrawlRoute } from './routes'
import { visit } from './visit'
import { onboardingOperations } from '../../features/onboarding/operations'
import { AUTH_REAUTH_DIALOG_SELECTOR, isAuthRoute } from '../../features/sign-in/model'
import { sourceOperations } from '../../features/sources/operations'
import { stubDashboard } from '../dashboard/doubles'
import { stubApi } from '../harness'
import { prepareCrawl } from '../project-ui/fixtures'

const PLANTED_FAILURE = '/quality-planted/unlabelled-input'
const PUBLIC_GROUPS = new Set(['marketing', 'public'])
const PROJECT_UI_ROUTES = new Set([
  '/[org]/[project]',
  '/[org]/[project]/settings',
  '/[org]/[project]/settings/rota',
  '/[org]/[project]/settings/share'
])

interface Variant {
  theme: 'dark' | 'light' | 'high contrast'
  size: string
  viewport?: { width: number; height: number }
  reflow?: boolean
}

const VARIANTS: Variant[] = [
  { theme: 'dark', size: 'project size' },
  { theme: 'light', size: 'project size' },
  { theme: 'high contrast', size: 'project size' },
  { theme: 'dark', size: '375 px', viewport: { width: 375, height: 812 } },
  // 320 CSS px is a 640 px window at 200% zoom (WCAG 1.4.10 reflow).
  { theme: 'dark', size: '320 px (200% zoom)', viewport: { width: 320, height: 640 }, reflow: true }
]

const CRAWL_NOW = '2026-11-05T13:13:00.000Z'
const CRAWL_PROJECT = {
  id: '019b7f4a-1e00-7000-8000-000000000201',
  org_id: '019b7f4a-1e00-7000-8000-000000000001',
  name: 'Quality crawl project',
  slug: 'crawl-project',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: null,
  site_name: 'APU',
  site_lat: 3.0559,
  site_lon: 101.6997,
  archived_at: null,
  camera_day_start: null,
  camera_day_end: null,
  warning_area_terms: [],
  packs: [
    { pack: 'sky', enabled: true, sheet_id: '019b7f4a-1e00-7000-8000-000000000401', schedule: null, sla_s: 600 },
    { pack: 'crowd', enabled: false, sheet_id: '019b7f4a-1e00-7000-8000-000000000402', schedule: null, sla_s: 7200 }
  ]
}

function onboardingFor(org: string, projectDone: boolean) {
  const project = `/${org}/crawl-project`
  return {
    steps: [
      {
        step: 'organisation',
        completed_at: CRAWL_NOW,
        skipped: false,
        result: 'Crawl organisation active',
        href: '/new'
      },
      {
        step: 'project',
        completed_at: projectDone ? CRAWL_NOW : null,
        skipped: false,
        result: projectDone ? 'Quality crawl project created' : null,
        href: `/${org}/new`
      },
      { step: 'sources', completed_at: null, skipped: false, result: null, href: `${project}/settings/packs` },
      { step: 'window', completed_at: null, skipped: false, result: null, href: `${project}/windows?declare=window` },
      { step: 'rota', completed_at: null, skipped: false, result: null, href: `/${org}/settings/rota` },
      { step: 'channel', completed_at: null, skipped: false, result: null, href: `${project}/settings/channels` }
    ]
  }
}

async function stubDynamicPage(page: Page, route: CrawlRoute) {
  if (!route.params?.includes('org')) return
  const org = route.path.split('/')[1]!
  const projectPage = route.params.includes('project')
  await stubApi(page, 'getOnboarding', onboardingFor(org, projectPage), { registry: onboardingOperations })
  if (!projectPage) return

  await stubApi(page, 'listProjects', { data: [CRAWL_PROJECT], next_cursor: null }, { registry: onboardingOperations })
  await stubApi(page, 'listProjectSources', { data: [], next_cursor: null }, { registry: sourceOperations })
}

interface Located extends Finding {
  theme: string
  size: string
}

function note(info: TestInfo, type: string, description: string) {
  info.annotations.push({ type, description })
  console.log(`${type}: ${description}`)
}

async function crawl(
  page: Page,
  route: CrawlRoute,
  session: Session,
  info: TestInfo,
  beforeVisit?: () => Promise<void>
): Promise<Located[]> {
  const jsOn = info.project.use.javaScriptEnabled !== false
  const found: Located[] = []
  // The live event hub is still owned by d-org-api. Keep the UI's reconnecting
  // streams local to this crawl instead of invoking its notBuilt placeholder.
  await page.route('**/api/notifications/stream**', (request) =>
    request.fulfill({ status: 200, contentType: 'text/event-stream', body: ': crawl fixture\n\n' })
  )
  await page.route('**/v1/projects/*/bundles/stream**', (request) =>
    request.fulfill({ status: 200, contentType: 'text/event-stream', body: ': crawl fixture\n\n' })
  )
  // #174's project UI routes sign in through their fixtures' test principal and keep the pattern path, which visit()
  // fills with the fixtures' test-org/test-project; the other routes use a real session and its organisation.
  const projectUiRoute = PROJECT_UI_ROUTES.has(route.path)
  let org: { slug: string } | null = null
  if (projectUiRoute) await prepareCrawl(page, session.role)
  else if (session.signIn) org = await session.signIn(page)
  else await signedOut(page)
  const concreteRoute = projectUiRoute
    ? route
    : {
        ...route,
        path: route.path
          .replace('[org]', encodeURIComponent(org?.slug ?? 'crawl-org'))
          .replace('[project]', 'crawl-project')
      }
  if (!projectUiRoute) await stubDynamicPage(page, concreteRoute)
  await beforeVisit?.()
  for (const variant of jsOn ? VARIANTS : VARIANTS.slice(0, 1)) {
    await page.emulateMedia({
      colorScheme: variant.theme === 'light' ? 'light' : 'dark',
      contrast: variant.theme === 'high contrast' ? 'more' : 'no-preference',
      reducedMotion: 'no-preference'
    })
    if (variant.viewport) await page.setViewportSize(variant.viewport)
    const findings = await visit(page, concreteRoute, session.role)
    if (new URL(page.url()).pathname === '/api/auth/continue') return found
    const reauthDialog = page.locator(AUTH_REAUTH_DIALOG_SELECTOR)
    if (isAuthRoute(route.path) || (await reauthDialog.count()) > 0) {
      const passwordControls = page.locator(
        'input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]'
      )
      const count = await passwordControls.count()
      if (count) {
        findings.push({
          check: 'auth-password',
          detail: `${count} password control(s) exist on an auth route or re-authentication dialog`
        })
      }
    }
    if (
      variant.theme === 'high contrast' &&
      !(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches))
    ) {
      // A browser that ignores the emulation would pass high contrast without testing it.
      findings.push({ check: 'emulation', detail: `${info.project.name} didn't apply prefers-contrast: more` })
    }
    findings.push(...(await inspectPage(page, { axe: jsOn, reflow: !!variant.reflow })))
    const paymentArtifacts = await page.locator('input[autocomplete^="cc-"], iframe[src*="js.stripe.com"]').count()
    if (paymentArtifacts) {
      findings.push({
        check: 'BIL-1',
        detail: `${paymentArtifacts} payment field(s) or Stripe frame(s) appear in a P1 build`
      })
    }
    found.push(...findings.map((finding) => ({ ...finding, theme: variant.theme, size: variant.size })))
  }
  if (jsOn) {
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'no-preference', reducedMotion: 'reduce' })
    const findings = [...(await visit(page, concreteRoute, session.role)), ...(await motionFindings(page))]
    found.push(...findings.map((finding) => ({ ...finding, theme: 'dark, reduced motion', size: 'project size' })))
  } else {
    note(info, 'JavaScript off', 'axe and reduced motion need page scripts; they run in the JavaScript projects')
  }
  return found
}

function report(route: CrawlRoute, session: Session, findings: Located[]) {
  const lines = findings.map(
    (f) => `${route.path} · ${session.role} · ${f.theme} · ${f.size} · ${f.check}: ${f.detail}`
  )
  return `${findings.length} quality finding(s):\n${lines.join('\n')}`
}

for (const route of builtRoutes()) {
  for (const session of sessions()) {
    test(`${route.path} as ${session.role}`, async ({ page }, info) => {
      const jsOn = info.project.use.javaScriptEnabled !== false
      test.slow(jsOn, 'One case runs five complete axe audits plus the reduced-motion check')
      test.skip(!jsOn && !(route.group && PUBLIC_GROUPS.has(route.group)), 'JavaScript off covers public pages only')
      test.fixme(
        route.dynamic && !route.params && !PROJECT_UI_ROUTES.has(route.path) && route.path !== '/[org]',
        `${route.path} needs param fixtures with stubApi bodies (#95)`
      )
      const dashboard = route.path === '/[org]'
      const visitRoute = dashboard ? { ...route, path: '/test-org', dynamic: false } : route
      const dashboardRoles: Record<Role, 'owner' | 'admin' | 'approver' | 'editor' | 'viewer' | 'guest' | null> = {
        Owner: 'owner',
        Admin: 'admin',
        Approver: 'approver',
        Editor: 'editor',
        Viewer: 'viewer',
        guest: 'guest',
        'share-link reviewer': null,
        'signed out': null
      }
      const findings = await crawl(page, visitRoute, session, info, async () => {
        if (dashboard) await stubDashboard(page, { role: dashboardRoles[session.role], noProjects: true })
      })

      if (route.path === PLANTED_FAILURE) {
        // The planted unlabelled input must fail the crawl, by route, role, theme and rule.
        expect(report(route, session, findings)).toMatch(
          new RegExp(`${PLANTED_FAILURE} · ${session.role} · dark · project size · form-fields: input has no label`)
        )
        if (jsOn) expect(report(route, session, findings)).toMatch(/ · axe: label \(critical\)/)
        return
      }

      const gaps = KNOWN_GAPS.filter((gap) => gap.route === route.path)
      const open = findings.filter((finding) => !gaps.some((gap) => gap.check === finding.check))
      for (const gap of gaps) {
        if (findings.some((finding) => finding.check === gap.check)) {
          note(info, 'known gap', `${gap.check} on ${gap.route}: ${gap.why} (#${gap.issue})`)
        } else if (jsOn) {
          open.push({
            check: 'known-gaps',
            detail: `${gap.check} no longer fails here; remove its entry`,
            theme: '-',
            size: '-'
          })
        }
      }
      if (open.length) throw new Error(report(route, session, open))
    })
  }
}
