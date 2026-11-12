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

const ADMINS: Role[] = ['Owner', 'Admin']
const NON_MEMBERS: Role[] = ['share-link reviewer', 'signed out']
const SHOWN = /^answered 200 with the page, expected 404$/

export const KNOWN_GAPS: KnownGap[] = [
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
    route: '/[org]/[project]/bundles/[id]',
    check: 'status',
    detail: SHOWN,
    issue: 596,
    why: 'the bundle page renders for non-members instead of 404',
    roles: NON_MEMBERS
  },
  {
    route: '/[org]/[project]/camera/[sourceId]',
    check: 'focus-visible',
    detail: /^input shows no :focus-visible ring$/,
    issue: 596,
    why: 'the day start and end times show no ring on their last segment',
    projects: ['chromium', 'webkit', 'iphone']
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
