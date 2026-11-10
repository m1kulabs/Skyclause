// Findings the crawl expects today, each owned by an open issue. A listed gap is reported, not failed; a gap
// that stops occurring fails the crawl so its entry is removed.
import type { Role } from './roles'

export interface KnownGap {
  route: string
  check: string
  issue: number
  why: string
  /** The roles that see the finding, when the others get a different page; every role if unset. */
  roles?: Role[]
  /** The browser projects that see it, when an engine renders differently; every project if unset. */
  projects?: string[]
}

const MEMBERS: Role[] = ['Owner', 'Admin', 'Approver', 'Editor', 'Viewer', 'guest']
const ADMINS: Role[] = ['Owner', 'Admin']

export const KNOWN_GAPS: KnownGap[] = [
  { route: '/[org]/projects', check: 'headings', issue: 596, why: 'the empty state has no h1', roles: MEMBERS },
  { route: '/[org]/analysis', check: 'form-fields', issue: 596, why: 'the project select has no name', roles: MEMBERS },
  {
    route: '/[org]/analysis',
    check: 'target-size',
    issue: 596,
    why: 'WebKit draws the project select 21 px tall',
    roles: MEMBERS,
    projects: ['webkit', 'iphone']
  },
  {
    route: '/[org]/settings/integrations',
    check: 'form-fields',
    issue: 596,
    why: 'the OAuth client form has no names',
    roles: ADMINS
  },
  {
    route: '/[org]/settings/integrations',
    check: 'axe',
    issue: 596,
    why: 'scrolling tables have no keyboard stop at 375 and 320 px',
    roles: ADMINS
  },
  {
    route: '/[org]/settings/audit',
    check: 'focus-visible',
    issue: 596,
    why: 'the date filters have no ring',
    roles: ADMINS
  },
  {
    route: '/[org]/settings/general',
    check: 'form-fields',
    issue: 596,
    why: 'the slug field has no autocomplete',
    roles: ADMINS
  }
]
