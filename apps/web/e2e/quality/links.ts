// No dead links: an href on this origin must reach a built page. An organisation or project segment matches only a
// slug the product would accept (contracts' SLUG_REGEX, never a reserved name), so /docs, /status, /guest,
// /{org}/approvals, /c/{callId} and /p/... count as the unbuilt pages they are, not as an organisation's or a project's.
import { RESERVED_SLUGS, SLUG_REGEX } from '@skyclause/contracts'

export interface FoundLink {
  href: string
  /** Where it was seen, for the failure message. */
  at: string
}

const reserved = new Set<string>(RESERVED_SLUGS)
/** The Commons is the one organisation with a reserved slug (PRD GST-2), so no other may take it. */
const COMMONS = 'commons'

/** Pages only test builds serve (`page.plant.tsx`) and Next's own: no product link may go there. */
const testOnly = (path: string) =>
  path.split('/').some((segment) => segment.startsWith('_') || segment === 'quality-planted')

function segmentMatches(pattern: string, value: string) {
  if (pattern === '[org]' && value === COMMONS) return true
  if (pattern === '[org]' || pattern === '[project]') return SLUG_REGEX.test(value) && !reserved.has(value)
  return /^\[[^\]]+\]$/.test(pattern) ? value.length > 0 : pattern === value
}

/** Matches paths against `pages`, route patterns such as `/[org]/[project]/ledger`. */
export function pageMatcher(pages: readonly string[]) {
  const patterns = pages.filter((path) => !testOnly(path)).map((path) => path.split('/').filter(Boolean))
  /** The page `pathname` reaches, or null. */
  const builtPage = (pathname: string) => {
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const page = patterns.find(
      (pattern) => pattern.length === parts.length && pattern.every((segment, i) => segmentMatches(segment, parts[i]!))
    )
    return page ? `/${page.join('/')}` : null
  }
  /** The links in `found` to a path on `origin` that no page serves. */
  const deadLinks = (found: readonly FoundLink[], origin: string) =>
    found.filter(({ href }) => {
      if (href.startsWith('#')) return false
      const url = new URL(href, origin)
      return url.origin === origin && builtPage(url.pathname) === null
    })
  return { builtPage, deadLinks }
}

/** Paths every matcher must refuse: the unbuilt routes the redesign may not link (#730). */
export const UNBUILT_PATHS = [
  '/guest',
  '/docs',
  '/developers',
  '/status',
  '/acme/approvals',
  '/acme/site/clauses',
  '/c/019a45b0-0000-7000-8000-000000000004',
  '/p/acme/site',
  '/_test/shell'
]
