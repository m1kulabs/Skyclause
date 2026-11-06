// The #116 crawl: every built page, per role, in dark, light and high contrast at the project's size, at 375 px,
// at 320 px (200% zoom) and under reduced motion. One failure lists route, role, theme, size and rule.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { inspectPage, motionFindings, type Finding } from './checks'
import { KNOWN_GAPS } from './known-gaps'
import { STAND_IN_REASON, sessions, signedOut, type Session } from './roles'
import { builtRoutes, type CrawlRoute } from './routes'
import { visit } from './visit'

const PLANTED_FAILURE = '/quality-planted/unlabelled-input'
const PUBLIC_GROUPS = new Set(['marketing', 'public'])

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

interface Located extends Finding {
  theme: string
  size: string
}

function note(info: TestInfo, type: string, description: string) {
  info.annotations.push({ type, description })
  console.log(`${type}: ${description}`)
}

async function crawl(page: Page, route: CrawlRoute, session: Session, info: TestInfo): Promise<Located[]> {
  const jsOn = info.project.use.javaScriptEnabled !== false
  const found: Located[] = []
  if (session.signIn) await session.signIn(page)
  else await signedOut(page)
  for (const variant of jsOn ? VARIANTS : VARIANTS.slice(0, 1)) {
    await page.emulateMedia({
      colorScheme: variant.theme === 'light' ? 'light' : 'dark',
      contrast: variant.theme === 'high contrast' ? 'more' : 'no-preference',
      reducedMotion: 'no-preference'
    })
    if (variant.viewport) await page.setViewportSize(variant.viewport)
    const findings = await visit(page, route, session.role)
    if (
      variant.theme === 'high contrast' &&
      !(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches))
    ) {
      // A browser that ignores the emulation would pass high contrast without testing it.
      findings.push({ check: 'emulation', detail: `${info.project.name} didn't apply prefers-contrast: more` })
    }
    findings.push(...(await inspectPage(page, { axe: jsOn, reflow: !!variant.reflow })))
    found.push(...findings.map((finding) => ({ ...finding, theme: variant.theme, size: variant.size })))
  }
  if (jsOn) {
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'no-preference', reducedMotion: 'reduce' })
    const findings = [...(await visit(page, route, session.role)), ...(await motionFindings(page))]
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
    const standIns = session.standIns.length ? ` (standing in for ${session.standIns.join(', ')})` : ''
    test(`${route.path} as ${session.role}${standIns}`, async ({ page }, info) => {
      const jsOn = info.project.use.javaScriptEnabled !== false
      test.slow(jsOn, 'One case runs five complete axe audits plus the reduced-motion check')
      test.skip(!jsOn && !(route.group && PUBLIC_GROUPS.has(route.group)), 'JavaScript off covers public pages only')
      test.fixme(route.dynamic, `${route.path} needs param fixtures with stubApi bodies (#95)`)
      if (session.standIns.length) {
        note(info, 'signed out stand-in', `${session.standIns.join(', ')} run signed out: ${STAND_IN_REASON}`)
      }
      const findings = await crawl(page, route, session, info)

      if (route.path === PLANTED_FAILURE) {
        // The planted unlabelled input must fail the crawl, by route, role, theme and rule.
        expect(report(route, session, findings)).toMatch(
          new RegExp(`${PLANTED_FAILURE} · signed out · dark · project size · form-fields: input has no label`)
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
