import { expect, test } from 'vitest'
import { sortFindings, type KnownGap } from '../../e2e/quality/known-gaps'

const gap: KnownGap = {
  route: '/[org]/settings/integrations',
  check: 'axe',
  detail: /^scrollable-region-focusable \(serious\)/,
  issue: 596,
  why: 'scrolling tables have no keyboard stop',
  roles: ['Owner'],
  projects: ['chromium']
}
const where = { route: '/[org]/settings/integrations', role: 'Owner' as const, project: 'chromium' }
const scroll = {
  check: 'axe',
  detail: 'scrollable-region-focusable (serious): Scrollable region must have keyboard access'
}
const contrast = { check: 'axe', detail: 'color-contrast (serious): Elements must meet minimum color contrast' }

test('a known gap covers only the findings its check and detail match', () => {
  expect(sortFindings([scroll, contrast], where, [gap])).toEqual({ open: [contrast], seen: [gap], stale: [] })
})

test('a known gap that no finding matches is stale', () => {
  expect(sortFindings([contrast], where, [gap])).toEqual({ open: [contrast], seen: [], stale: [gap] })
})

test('a known gap applies only to its route, roles and browser projects', () => {
  for (const elsewhere of [
    { ...where, route: '/[org]/settings/audit' },
    { ...where, role: 'Viewer' as const },
    { ...where, project: 'firefox' }
  ]) {
    expect(sortFindings([scroll], elsewhere, [gap])).toEqual({ open: [scroll], seen: [], stale: [] })
  }
})

// Copied from the Chromium, WebKit and iPhone crawl output of 11 November 2026 that #596 lists.
const reported = [
  ['/[org]/projects', 'chromium', 'headings', '0 h1 elements; a screen has exactly one'],
  ['/[org]/analysis', 'chromium', 'form-fields', 'select "Choose a project" has no name'],
  ['/[org]/analysis', 'chromium', 'form-fields', 'select "Choose a project" has no autocomplete'],
  ['/[org]/analysis', 'webkit', 'target-size', 'select "Choose a project" is 480×21 px'],
  ['/[org]/analysis', 'iphone', 'target-size', 'select "Choose a project" is 264×21 px'],
  ['/[org]/settings/integrations', 'chromium', 'form-fields', 'input has no name'],
  ['/[org]/settings/integrations', 'chromium', 'form-fields', 'input#oauth-client-name has no name'],
  ['/[org]/settings/integrations', 'chromium', 'form-fields', 'input#oauth-client-name has no autocomplete'],
  [
    '/[org]/settings/integrations',
    'chromium',
    'axe',
    'scrollable-region-focusable (serious): Scrollable region must have keyboard access at section[aria-labelledby="oauth-grants-heading"] > .overflow-x-auto.relative[data-slot="table-container"]'
  ],
  [
    '/[org]/settings/integrations',
    'iphone',
    'axe',
    'scrollable-region-focusable (serious): Scrollable region must have keyboard access at .overflow-x-auto'
  ],
  [
    '/[org]/settings/members',
    'webkit',
    'axe',
    'color-contrast (serious): Elements must meet minimum color contrast ratio thresholds at .WiivEq_activityCell'
  ],
  ['/[org]/settings/audit', 'chromium', 'focus-visible', 'input shows no :focus-visible ring'],
  ['/[org]/settings/general', 'chromium', 'form-fields', 'input#org-general-slug[name="slug"] has no autocomplete']
] as const

test.each(reported)('the %s gap in %s covers its reported %s finding', (route, project, check, detail) => {
  expect(sortFindings([{ check, detail }], { route, role: 'Owner', project }).open).toEqual([])
})

// Copied from the Chromium crawl, 11 November 2026, with the role that saw each.
const reportedTo = [
  ['/[org]/analysis', 'signed out', 'status', 'answered 200 with the page, expected 404'],
  ['/[org]/[project]/analysis', 'share-link reviewer', 'status', 'answered 200 with the page, expected 404'],
  ['/[org]/[project]/analysis', 'Viewer', 'form-fields', 'select "Choose a clause sheet" has no name'],
  ['/[org]/[project]/analysis', 'Owner', 'form-fields', 'select "Published versionDraft" has no autocomplete'],
  [
    '/[org]/[project]/analysis',
    'Owner',
    'form-fields',
    'select "Each recorded readingEvery 5 minutesEver" has no name'
  ],
  ['/[org]/[project]/analysis', 'guest', 'form-fields', 'input#base-ui-_r_h_ has no autocomplete'],
  ['/[org]/[project]/analysis', 'Editor', 'focus-visible', 'input shows no :focus-visible ring'],
  ['/[org]/[project]/bundles/[id]', 'Approver', 'target-size', 'a "Open project" is 89×16 px'],
  ['/[org]/[project]/bundles/[id]', 'Approver', 'target-size', 'button "Read inputs · 12 ms" is 144×20 px'],
  ['/[org]/[project]/camera/[sourceId]', 'signed out', 'focus-visible', 'input shows no :focus-visible ring'],
  [
    '/[org]/[project]/ledger',
    'Admin',
    'form-fields',
    'select#ledger-mode[name="mode"] "AllNormalOutdoor limitedCommute disrupti" has no autocomplete'
  ],
  ['/[org]/[project]/subscribers', 'Approver', 'status', 'answered 200 with "Page not found", expected the page'],
  ['/subscribe/[token]/reply', 'guest', 'target-size', 'a "Access, export or erase your data" is 295×20 px'],
  ['/subscribe/[token]/data', 'share-link reviewer', 'reflow', 'the page is 360 px wide in a 320 px viewport']
] as const

// The same pages in the other engines (`QUALITY_BROWSERS=all`), 11 November 2026.
const reportedIn = [
  ['/[org]/[project]/analysis', 'webkit', 'target-size', 'select "Choose a clause sheet" is 435×21 px'],
  [
    '/[org]/[project]/analysis',
    'iphone',
    'target-size',
    'select "Each recorded readingEvery 5 minutesEver" is 295×21 px'
  ],
  ['/[org]/[project]/ledger', 'webkit', 'target-size', 'select#ledger-pack[name="pack"] "AllSkyCrowd" is 189×20 px'],
  ['/[org]/[project]/bundles/[id]', 'firefox', 'target-size', 'a "Open project" is 89×18 px']
] as const

test.each(reportedIn)('the %s gap in %s covers its reported %s finding', (route, project, check, detail) => {
  expect(sortFindings([{ check, detail }], { route, role: 'Editor', project }).open).toEqual([])
})

test('a ring gap leaves out Firefox, which rings a focused date or time field itself', () => {
  const where = { route: '/[org]/[project]/ledger', role: 'Owner' as const, project: 'firefox' }
  expect(sortFindings([], where).stale.map((gap) => gap.check)).not.toContain('focus-visible')
})

test.each(reportedTo)('the %s gap for %s covers its reported %s finding', (route, role, check, detail) => {
  expect(sortFindings([{ check, detail }], { route, role, project: 'chromium' }).open).toEqual([])
})

test('a gap for a page that renders instead of 404 never covers a member, who should see it', () => {
  const shown = { check: 'status', detail: 'answered 200 with the page, expected 404' }
  const where = { route: '/[org]/analysis', role: 'Viewer' as const, project: 'chromium' }
  expect(sortFindings([shown], where).open).toEqual([shown])
})
