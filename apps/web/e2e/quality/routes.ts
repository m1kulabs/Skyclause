// Route discovery for the crawl: every page in the Next build's app-path manifest, so a new route is crawled
// without editing the suite.
import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface CrawlRoute {
  path: string
  /** The route group folder, `(marketing)` → `marketing`; null outside a group. */
  group: string | null
  /** Has `[param]` segments, which need param fixtures to visit. */
  dynamic: boolean
  /** Dynamic parameters the crawl can replace with a real test organisation and project. */
  params?: Array<'org' | 'project'>
  status: 200 | 404
}

// Next renders `_global-error` only when the root layout throws; it has no URL to visit.
const UNVISITABLE = new Set(['/_global-error'])
/** A page under an organisation with no other parameter, such as `/[org]/settings/members`: each role's own one. */
const ORG_PAGE = /^\/\[org\](?:\/[^[\]/]+)+$/
/** A page under a project, such as `/[org]/[project]/ledger`: a project in each role's organisation. */
const PROJECT_PAGE = /^\/\[org\]\/\[project\]\//

export function crawlRoutes(manifest: Record<string, string>): CrawlRoute[] {
  return Object.entries(manifest)
    .filter(([entry, url]) => entry.endsWith('/page') && !UNVISITABLE.has(url))
    .map(([entry, url]) => ({
      path: url,
      group: /\/\(([^)]+)\)\//.exec(entry)?.[1] ?? null,
      dynamic: url.includes('['),
      ...(PROJECT_PAGE.test(url)
        ? { params: ['org' as const, 'project' as const] }
        : ORG_PAGE.test(url)
          ? { params: ['org' as const] }
          : {}),
      status: url === '/_not-found' ? (404 as const) : (200 as const)
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1))
}

/** The manifest Playwright's web server just built; a missing build fails the run here, by name. */
export function builtRoutes(): CrawlRoute[] {
  const file = path.join(import.meta.dirname, '../../.next/app-path-routes-manifest.json')
  return crawlRoutes(JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
}
