import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { expect, test } from 'vitest'
import type { Role } from '@skyclause/contracts'
import { pageMatcher, UNBUILT_PATHS, type FoundLink } from '../../e2e/quality/links'
import { paletteSources, type PaletteContext } from '../../features/palette/sources'

const app = join(import.meta.dirname, '../../app')

/**
 * The production build's pages, as Next routes the app directory: every `page` file outside a private `_folder`,
 * route groups and slots dropped, `%5F` read as `_`. The e2e (links.spec.ts) checks rendered links against the
 * build's own manifest; this reads the same tree without a build.
 */
function appPages() {
  return readdirSync(app, { recursive: true, encoding: 'utf8' })
    .filter((file) => /(?:^|[/\\])page\.(?:tsx|ts|jsx|js)$/.test(file))
    .map((file) => relative(app, join(app, file)).split(sep).slice(0, -1))
    .filter((segments) => !segments.some((segment) => segment.startsWith('_')))
    .map(
      (segments) =>
        `/${segments
          .filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith('@'))
          .map(decodeURIComponent)
          .join('/')}`
    )
}

const { builtPage, deadLinks } = pageMatcher(appPages())
const origin = 'https://skyclause.test'

test('the page list has the app, public and auth pages and none of the unbuilt ones', () => {
  for (const path of ['/', '/acme', '/acme/site/ledger', '/acme/site/settings/share', '/legal/terms', '/connect'])
    expect(builtPage(path), path).not.toBeNull()
  for (const path of UNBUILT_PATHS) expect(builtPage(path), path).toBeNull()
})

test('a link elsewhere, to the same page or to a page that is built is not dead', () => {
  const links = ['https://www.met.gov.my/', '#how', '/acme/site/windows?declare=window', '/acme#dashboard-needs-review']
  expect(
    deadLinks(
      links.map((href) => ({ href, at: 'test' })),
      origin
    )
  ).toEqual([])
  expect(deadLinks([{ href: '/acme/approvals', at: 'test' }], origin)).toEqual([
    { href: '/acme/approvals', at: 'test' }
  ])
})

const ROLES: Role[] = ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']

test('every place the command palette goes is a built page, for every role and scope', () => {
  const found: FoundLink[] = []
  for (const role of ROLES) {
    const org = role === 'guest' ? 'commons' : 'acme'
    const membership = { account_id: 'account-1', org_id: 'org-1', org_name: 'Acme', org_slug: org, role }
    const project = { ...membership, id: 'project-1', name: 'Site', slug: 'site' }
    const scopes: Array<Pick<PaletteContext, 'pathname' | 'org' | 'project'>> = [
      { pathname: `/${org}/site`, org, project: 'site' },
      { pathname: `/${org}`, org },
      { pathname: '/account/profile' }
    ]
    for (const scope of scopes) {
      for (const projectChoice of [null, 'window', 'ledger'] as const) {
        const at = `${role} at ${scope.pathname}${projectChoice ? `, choosing a project for ${projectChoice}` : ''}`
        const context: PaletteContext = {
          ...scope,
          memberships: [membership],
          projects: [project],
          query: 'flood',
          projectQuery: 'flood',
          projectChoice,
          changeTheme: () => undefined,
          chooseProject: () => undefined,
          navigate: (href) => found.push({ href, at })
        }
        for (const source of paletteSources) {
          for (const item of [...(source.items ?? []), ...(source.itemsFor?.(context) ?? [])]) item.onSelect()
        }
      }
    }
  }
  // Every role reaches at least its organisation's pages and its account.
  expect(new Set(found.map(({ at }) => at.split(' ')[0])).size).toBe(ROLES.length)
  expect(deadLinks(found, origin)).toEqual([])
})
