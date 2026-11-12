import type { Role } from '@skyclause/contracts'

/**
 * Every destination the shell offers, in one place for the bar, its menus, the phone sheet and the command palette.
 * Each one is a built page; unbuilt routes (clauses, the approvals queue, the developers index, /docs) are never
 * listed, and neither are pages whose operations have no handler yet: webhooks (e-webhooks; `/{org}/settings/webhooks`
 * and `/developers/webhooks` say so when reached by URL). Role gates mirror the pages' own:
 * features/settings/access.ts and e2e/quality/visit.ts.
 */
export type DestinationKey =
  | 'windows'
  | 'signals'
  | 'calls'
  | 'ledger'
  | 'overview'
  | 'projectAnalysis'
  | 'subscribers'
  | 'projectSettings'
  | 'dashboard'
  | 'projects'
  | 'organisationAnalysis'
  | 'connect'
  | 'organisationSettings'
  | 'account'
  | 'appearance'

export interface Destination {
  key: DestinationKey
  href: string
  /** Pages under this prefix count as this destination; the destination's own href when unset. */
  match?: string
  /** Further prefixes that count as this destination (a bundle under review is a batch of calls). */
  also?: string[]
  /** Only this exact path counts (an overview or a dashboard has deeper pages that are not it). */
  exact?: boolean
}

const path = (...segments: string[]) => `/${segments.map(encodeURIComponent).join('/')}`
const manages = (role?: Role) => role === 'owner' || role === 'admin'

/** The four core destinations of a project: the bar's text links. Bundle review counts as Calls. */
export function coreDestinations(org: string, project: string): Destination[] {
  return (['windows', 'signals', 'calls', 'ledger'] as const).map((key) =>
    key === 'calls'
      ? { key, href: path(org, project, key), also: [path(org, project, 'bundles')] }
      : { key, href: path(org, project, key) }
  )
}

/** The project menu: the rest of a project's pages, filtered by the member's role. */
export function projectMenuDestinations(org: string, project: string, role?: Role): Destination[] {
  const destinations: Destination[] = [
    { key: 'overview', href: path(org, project), exact: true },
    { key: 'projectAnalysis', href: path(org, project, 'analysis') }
  ]
  if (manages(role) || role === 'approver')
    destinations.push({ key: 'subscribers', href: path(org, project, 'subscribers') })
  if (manages(role))
    destinations.push({
      key: 'projectSettings',
      href: path(org, project, 'settings'),
      match: path(org, project, 'settings')
    })
  return destinations
}

/**
 * The organisation and account menu. A guest account (every membership a guest's) has only Appearance for its account
 * and no Connect; an unknown role sees no role-gated organisation page.
 */
export function organisationMenuDestinations(
  org: string | undefined,
  role?: Role,
  guestAccount = false
): Destination[] {
  const destinations: Destination[] = []
  if (org) {
    destinations.push(
      { key: 'dashboard', href: path(org), exact: true },
      { key: 'projects', href: path(org, 'projects') },
      { key: 'organisationAnalysis', href: path(org, 'analysis') }
    )
    if (manages(role) || role === 'approver') {
      destinations.push({
        key: 'organisationSettings',
        href: path(org, 'settings', manages(role) ? 'general' : 'rota'),
        match: path(org, 'settings')
      })
    }
  }
  if (!guestAccount) destinations.push({ key: 'connect', href: '/connect' })
  destinations.push(
    guestAccount
      ? { key: 'appearance', href: '/account/appearance' }
      : { key: 'account', href: '/account/profile', match: '/account' }
  )
  return destinations
}

/** The Review control opens the dashboard at its needs-review block (DSH-1); `/{org}/approvals` is not built. */
export function reviewHref(org: string): string {
  return `${path(org)}#dashboard-needs-review`
}

/** The destination the path is on: the longest matching prefix, so a call's page is under Calls. */
export function currentDestination(pathname: string, destinations: readonly Destination[]): DestinationKey | undefined {
  let best: { key: DestinationKey; length: number } | undefined
  for (const destination of destinations) {
    for (const prefix of [destination.match ?? destination.href, ...(destination.also ?? [])]) {
      const hit = destination.exact
        ? pathname === destination.href
        : pathname === prefix || pathname.startsWith(`${prefix}/`)
      if (hit && (!best || prefix.length > best.length)) best = { key: destination.key, length: prefix.length }
    }
  }
  return best?.key
}
