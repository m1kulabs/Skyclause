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
const reported = [['/[org]/settings/audit', 'chromium', 'focus-visible', 'input shows no :focus-visible ring']] as const

test.each(reported)('the %s gap in %s covers its reported %s finding', (route, project, check, detail) => {
  expect(sortFindings([{ check, detail }], { route, role: 'Owner', project }).open).toEqual([])
})

// Copied from the Chromium crawl, 11 November 2026, with the role that saw each.
const reportedTo = [
  ['/[org]/[project]/camera/[sourceId]', 'signed out', 'focus-visible', 'input shows no :focus-visible ring'],
  ['/[org]/[project]/subscribers', 'Approver', 'status', 'answered 200 with "Page not found", expected the page']
] as const

test('a ring gap leaves out Firefox, which rings a focused date or time field itself', () => {
  const where = { route: '/[org]/settings/audit', role: 'Owner' as const, project: 'firefox' }
  expect(sortFindings([], where).stale.map((gap) => gap.check)).not.toContain('focus-visible')
})

test.each(reportedTo)('the %s gap for %s covers its reported %s finding', (route, role, check, detail) => {
  expect(sortFindings([{ check, detail }], { route, role, project: 'chromium' }).open).toEqual([])
})

test('a gap for a page that renders instead of 404 never covers a member, who should see it', () => {
  const shown = { check: 'status', detail: 'answered 200 with the page, expected 404' }
  const where = { route: '/[org]/[project]/bundles/[id]', role: 'Viewer' as const, project: 'chromium' }
  expect(sortFindings([shown], where).open).toEqual([shown])
})
