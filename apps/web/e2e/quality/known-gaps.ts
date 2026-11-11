// Findings the crawl expects today, each owned by an open issue. A listed gap is reported, not failed; a gap
// that stops occurring fails the crawl so its entry is removed.
import type { Finding } from './checks'
import type { Role } from './roles'

export interface KnownGap {
  route: string
  check: string
  /** The findings it covers within `check`; any other finding in the same check still fails. */
  detail: RegExp
  issue: number
  why: string
  /** The roles that see the finding, when the others get a different page; every role if unset. */
  roles?: Role[]
  /** The browser projects that see it, when an engine renders differently; every project if unset. */
  projects?: string[]
}

const MEMBERS: Role[] = ['Owner', 'Admin', 'Approver', 'Editor', 'Viewer', 'guest']
const ADMINS: Role[] = ['Owner', 'Admin']
const NON_MEMBERS: Role[] = ['share-link reviewer', 'signed out']
const SHOWN = /^answered 200 with the page, expected 404$/

export const KNOWN_GAPS: KnownGap[] = [
  {
    route: '/[org]/projects',
    check: 'headings',
    detail: /^0 h1 elements/,
    issue: 596,
    why: 'the empty state has no h1',
    roles: MEMBERS
  },
  {
    route: '/[org]/analysis',
    check: 'status',
    detail: SHOWN,
    issue: 596,
    why: 'the organisation roll-up renders for non-members instead of 404',
    roles: NON_MEMBERS
  },
  {
    route: '/[org]/analysis',
    check: 'form-fields',
    detail: /^select "Choose a project" has no (?:name|autocomplete)$/,
    issue: 596,
    why: 'the project select has no name or autocomplete',
    roles: MEMBERS
  },
  {
    route: '/[org]/analysis',
    check: 'target-size',
    detail: /^select "Choose a project" is \d+×21 px$/,
    issue: 596,
    why: 'WebKit draws the project select 21 px tall',
    roles: MEMBERS,
    projects: ['webkit', 'iphone']
  },
  {
    route: '/[org]/settings/integrations',
    check: 'form-fields',
    detail: /^input#oauth-client-name has no (?:name|autocomplete)$/,
    issue: 596,
    why: 'the OAuth client name has no name or autocomplete',
    roles: ADMINS
  },
  {
    route: '/[org]/settings/integrations',
    check: 'form-fields',
    detail: /^input has no name$/,
    issue: 596,
    why: 'the OAuth scope checkboxes have no name',
    roles: ADMINS
  },
  {
    route: '/[org]/settings/integrations',
    check: 'axe',
    // axe names the region by whichever selector is shortest, which differs between engines.
    detail: /^scrollable-region-focusable \(serious\): /,
    issue: 596,
    why: 'scrolling tables have no keyboard stop at 375 and 320 px',
    roles: ADMINS
  },
  {
    route: '/[org]/settings/members',
    check: 'axe',
    detail: /^color-contrast \(serious\): .* at \.\w+_activityCell$/,
    issue: 596,
    why: 'the activity column fails contrast at 320 px in WebKit',
    roles: ADMINS,
    projects: ['webkit', 'iphone']
  },
  {
    route: '/[org]/settings/audit',
    check: 'focus-visible',
    detail: /^input shows no :focus-visible ring$/,
    issue: 596,
    why: 'the date filters have no ring',
    roles: ADMINS,
    // Firefox draws its own ring on a focused date field.
    projects: ['chromium', 'webkit', 'iphone']
  },
  {
    route: '/[org]/settings/general',
    check: 'form-fields',
    detail: /^input#org-general-slug\[name="slug"\] has no autocomplete$/,
    issue: 596,
    why: 'the slug field has no autocomplete',
    roles: ADMINS
  },
  {
    route: '/[org]/[project]/analysis',
    check: 'status',
    detail: SHOWN,
    issue: 596,
    why: 'the project analysis renders for non-members instead of 404',
    roles: NON_MEMBERS
  },
  {
    route: '/[org]/[project]/analysis',
    check: 'form-fields',
    detail:
      /^(?:select "(?:Choose a clause sheet|Choose a version or draft|Published version(?:Draft)?|Each recorded reading.*)"|input#base-ui-_r_\w+_) has no (?:name|autocomplete)$/,
    issue: 596,
    why: 'the replay’s selects and dates have no name or autocomplete',
    roles: MEMBERS
  },
  {
    route: '/[org]/[project]/analysis',
    check: 'focus-visible',
    detail: /^input shows no :focus-visible ring$/,
    issue: 596,
    why: 'the replay’s dates have no ring',
    roles: MEMBERS,
    // Firefox draws its own ring on a focused date field.
    projects: ['chromium', 'webkit', 'iphone']
  },
  {
    route: '/[org]/[project]/analysis',
    check: 'target-size',
    detail:
      /^select "(?:Choose a clause sheet|Choose a version or draft|Published version(?:Draft)?|Each recorded reading.*)" is \d+×21 px$/,
    issue: 596,
    why: 'WebKit draws the replay’s selects 21 px tall',
    roles: MEMBERS,
    projects: ['webkit', 'iphone']
  },
  {
    route: '/[org]/[project]/bundles/[id]',
    check: 'status',
    detail: SHOWN,
    issue: 596,
    why: 'the bundle page renders for non-members instead of 404',
    roles: NON_MEMBERS
  },
  {
    route: '/[org]/[project]/bundles/[id]',
    check: 'target-size',
    detail: /^(?:a "Open project"|button "Read inputs · \d+ ms") is \d+×\d+ px$/,
    issue: 596,
    why: 'the project link and the trace’s step buttons are under 24 px tall',
    roles: MEMBERS
  },
  {
    route: '/[org]/[project]/camera/[sourceId]',
    check: 'focus-visible',
    detail: /^input shows no :focus-visible ring$/,
    issue: 596,
    why: 'the day start and end times show no ring on their last segment',
    projects: ['chromium', 'webkit', 'iphone']
  },
  {
    route: '/[org]/[project]/ledger',
    check: 'status',
    detail: SHOWN,
    issue: 596,
    why: 'the ledger renders for non-members instead of 404',
    roles: NON_MEMBERS
  },
  {
    route: '/[org]/[project]/ledger',
    check: 'form-fields',
    detail: /^select#ledger-(pack|mode|state)\[name="\1"\] ".*" has no autocomplete$/,
    issue: 596,
    why: 'the pack, mode and state filters have no autocomplete',
    roles: MEMBERS
  },
  {
    route: '/[org]/[project]/ledger',
    check: 'focus-visible',
    detail: /^input shows no :focus-visible ring$/,
    issue: 596,
    why: 'the date filters have no ring',
    roles: MEMBERS,
    projects: ['chromium', 'webkit', 'iphone']
  },
  {
    route: '/[org]/[project]/ledger',
    check: 'target-size',
    detail: /^select#ledger-(pack|mode|state)\[name="\1"\] ".*" is \d+×20 px$/,
    issue: 596,
    why: 'WebKit draws the pack, mode and state filters 20 px tall',
    roles: MEMBERS,
    projects: ['webkit', 'iphone']
  },
  {
    route: '/[org]/[project]/subscribers',
    check: 'status',
    detail: /^answered \d+ with "Page not found", expected the page$/,
    issue: 596,
    why: 'the page gate compares the URL’s organisation with a real session’s orgId, which is always null',
    roles: ['Owner', 'Admin', 'Approver']
  },
  ...['', '/confirm', '/feedback', '/reply', '/unsubscribe'].map((page) => ({
    route: `/subscribe/[token]${page}`,
    check: 'target-size',
    detail: /^a "Access, export or erase your data" is \d+×20 px$/,
    issue: 596,
    why: 'the footer’s data link is 20 px tall'
  })),
  {
    route: '/subscribe/[token]/data',
    check: 'form-fields',
    detail: /^input has no (?:name|autocomplete)$/,
    issue: 596,
    why: 'the correction form’s email and role fields have no name, and role no autocomplete'
  },
  {
    route: '/subscribe/[token]/data',
    check: 'spellcheck',
    detail: /^input needs spellcheck="false"$/,
    issue: 596,
    why: 'the correction form’s email field leaves spellcheck on'
  },
  {
    route: '/subscribe/[token]/data',
    check: 'reflow',
    detail: /^the page is \d+ px wide in a 320 px viewport$/,
    issue: 596,
    why: 'the page scrolls sideways at 320 px'
  }
]

export interface GapContext {
  route: string
  role: Role
  project: string
}

/**
 * Sorts one crawl case's findings: `open` ones fail it, `seen` gaps covered at least one finding, and `stale` gaps
 * applied here but covered none, so their entries should go.
 */
export function sortFindings<F extends Finding>(findings: F[], where: GapContext, gaps: KnownGap[] = KNOWN_GAPS) {
  const applicable = gaps.filter(
    (gap) =>
      gap.route === where.route &&
      (!gap.roles || gap.roles.includes(where.role)) &&
      (!gap.projects || gap.projects.includes(where.project))
  )
  const covers = (gap: KnownGap, finding: Finding) => gap.check === finding.check && gap.detail.test(finding.detail)
  return {
    open: findings.filter((finding) => !applicable.some((gap) => covers(gap, finding))),
    seen: applicable.filter((gap) => findings.some((finding) => covers(gap, finding))),
    stale: applicable.filter((gap) => !findings.some((finding) => covers(gap, finding)))
  }
}
