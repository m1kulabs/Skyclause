import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import type { Role } from '@skyclause/contracts'
import {
  coreDestinations,
  currentDestination,
  organisationMenuDestinations,
  projectMenuDestinations,
  reviewHref
} from '../../features/shell/navigation'

const keys = (items: { key: string }[]) => items.map((item) => item.key)
const roles: Role[] = ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']

test('the bar carries the four core destinations of the project in the URL; bundles count as Calls', () => {
  expect(coreDestinations('test-org', 'test-project')).toEqual([
    { key: 'windows', href: '/test-org/test-project/windows' },
    { key: 'signals', href: '/test-org/test-project/signals' },
    { key: 'calls', href: '/test-org/test-project/calls', also: ['/test-org/test-project/bundles'] },
    { key: 'ledger', href: '/test-org/test-project/ledger' }
  ])
})

test('the project menu gates Subscribers to approvers and up, and settings to owners and admins', () => {
  const byRole = Object.fromEntries(
    roles.map((role) => [role, keys(projectMenuDestinations('test-org', 'test-project', role))])
  )
  expect(byRole).toEqual({
    owner: ['overview', 'projectAnalysis', 'subscribers', 'projectSettings'],
    admin: ['overview', 'projectAnalysis', 'subscribers', 'projectSettings'],
    approver: ['overview', 'projectAnalysis', 'subscribers'],
    editor: ['overview', 'projectAnalysis'],
    viewer: ['overview', 'projectAnalysis'],
    guest: ['overview', 'projectAnalysis']
  })
  expect(keys(projectMenuDestinations('test-org', 'test-project'))).toEqual(['overview', 'projectAnalysis'])
})

test('the organisation and account menu follows each role, and a guest account sees only Appearance', () => {
  const byRole = Object.fromEntries(
    roles.map((role) => [role, keys(organisationMenuDestinations('test-org', role, role === 'guest'))])
  )
  expect(byRole).toEqual({
    owner: ['dashboard', 'projects', 'organisationAnalysis', 'organisationSettings', 'connect', 'account'],
    admin: ['dashboard', 'projects', 'organisationAnalysis', 'organisationSettings', 'connect', 'account'],
    approver: ['dashboard', 'projects', 'organisationAnalysis', 'organisationSettings', 'connect', 'account'],
    editor: ['dashboard', 'projects', 'organisationAnalysis', 'connect', 'account'],
    viewer: ['dashboard', 'projects', 'organisationAnalysis', 'connect', 'account'],
    guest: ['dashboard', 'projects', 'organisationAnalysis', 'appearance']
  })
  const settings = (role: Role) =>
    organisationMenuDestinations('test-org', role).find((item) => item.key === 'organisationSettings')?.href
  expect(settings('owner')).toBe('/test-org/settings/general')
  expect(settings('approver')).toBe('/test-org/settings/rota')
  expect(keys(organisationMenuDestinations(undefined))).toEqual(['connect', 'account'])
})

/**
 * Every href the shell can produce, for every role, resolves to a built page.tsx under app/(app), and none is a page
 * whose operations have no handler yet: webhooks (e-webhooks) render only "not available yet" until they do.
 */
test('nothing links to a page that is not built', () => {
  const app = path.resolve(import.meta.dirname, '../../app/(app)')
  const pages: RegExp[] = []
  // The shell's links below use test-org and test-project, so those parameters must match exactly: a link to
  // /test-org/approvals must not pass as the project page /[org]/[project].
  const segment = (name: string) =>
    name === '[org]' ? 'test-org' : name === '[project]' ? 'test-project' : /^\[.+\]$/.test(name) ? '[^/]+' : name
  const walk = (directory: string, route: string) => {
    for (const name of readdirSync(directory)) {
      const full = path.join(directory, name)
      if (statSync(full).isDirectory()) {
        walk(full, /^\(.+\)$/.test(name) ? route : `${route}/${segment(name)}`)
      } else if (name === 'page.tsx') {
        pages.push(new RegExp(`^${route || '/'}$`))
      }
    }
  }
  walk(app, '')
  const hrefs = new Set<string>()
  for (const role of [...roles, undefined]) {
    for (const item of [
      ...coreDestinations('test-org', 'test-project'),
      ...projectMenuDestinations('test-org', 'test-project', role),
      ...organisationMenuDestinations('test-org', role, role === 'guest'),
      ...organisationMenuDestinations(undefined, role)
    ])
      hrefs.add(item.href)
  }
  hrefs.add(reviewHref('test-org').split('#')[0]!)
  for (const href of hrefs)
    expect(
      pages.some((page) => page.test(href)),
      href
    ).toBe(true)
  expect([...hrefs].filter((href) => /\/(approvals|clauses|docs|webhooks)\b|^\/developers\b/.test(href))).toEqual([])
})

test('Review opens the dashboard at its needs-review block', () => {
  expect(reviewHref('test-org')).toBe('/test-org#dashboard-needs-review')
})

test('the current destination is the longest match; overview and dashboard only on their own path', () => {
  const all = [
    ...coreDestinations('test-org', 'test-project'),
    ...projectMenuDestinations('test-org', 'test-project', 'owner'),
    ...organisationMenuDestinations('test-org', 'owner')
  ]
  expect(currentDestination('/test-org/test-project/calls/019a45b0', all)).toBe('calls')
  expect(currentDestination('/test-org/test-project/signals/probation/source', all)).toBe('signals')
  expect(currentDestination('/test-org/test-project', all)).toBe('overview')
  expect(currentDestination('/test-org/test-project/settings/packs', all)).toBe('projectSettings')
  expect(currentDestination('/test-org/test-project/bundles/019a45b0', all)).toBe('calls')
  expect(currentDestination('/test-org/test-project/bundles/019a45b0', coreDestinations('o', 'p'))).toBeUndefined()
  expect(currentDestination('/o/p/bundles/x', coreDestinations('o', 'p'))).toBe('calls')
  expect(currentDestination('/test-org', all)).toBe('dashboard')
  expect(currentDestination('/test-org/settings/members', all)).toBe('organisationSettings')
  // Reached by URL, the webhooks section is still under Organisation settings.
  expect(currentDestination('/test-org/settings/webhooks', all)).toBe('organisationSettings')
  expect(currentDestination('/account/security', all)).toBe('account')
  expect(currentDestination('/test-org/new', all)).toBeUndefined()
})
