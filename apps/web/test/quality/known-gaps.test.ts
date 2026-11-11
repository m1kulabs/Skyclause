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
