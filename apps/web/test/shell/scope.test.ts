import { expect, test } from 'vitest'
import { RESERVED_SLUGS } from '@skyclause/contracts'
import { shellScope } from '../../features/shell/scope'
import type { ShellData } from '../../features/shell/types'

const nobody: ShellData = { memberships: [], projects: [] }
const member: ShellData = {
  memberships: [{ org_id: 'org-one', org_name: 'Test organisation', org_slug: 'test-org', role: 'owner' }],
  projects: [{ id: 'project-one', org_id: 'org-one', name: 'Test project', slug: 'test-project' }]
}

test('an account with no memberships still gets links for the organisation in the URL', () => {
  // The org-live spec runs without a shell cookie: the bar's Review control follows the URL's organisation.
  const scope = shellScope(nobody, '/test-org/test-project/windows', { org: 'test-org', project: 'test-project' })
  expect(scope.org).toBe('test-org')
  expect(scope.core.map((item) => item.href)).toContain('/test-org/test-project/windows')
})

test('a 404 under a reserved first segment has no organisation, so the bar draws no dead links', () => {
  for (const reserved of RESERVED_SLUGS) {
    const scope = shellScope(nobody, `/${reserved}/none`, { org: reserved, project: 'none' })
    expect(scope.org, reserved).toBeUndefined()
    expect(scope.core, reserved).toEqual([])
    expect(scope.projectMenu, reserved).toEqual([])
  }
})

test('the scope carries the request language into the names the bar prints', () => {
  expect(shellScope(nobody, '/', {}, 'en').orgName).toBe('No organisations')
  expect(shellScope(nobody, '/', {}, 'ms').orgName).toBe('Tiada organisasi')
  expect(shellScope(member, '/test-org', { org: 'test-org' }, 'ms').projectName).toBe('Pilih projek')
})

test('a project the member does not have (the not-found page) gets no project links, only the organisation’s', () => {
  const scope = shellScope(member, '/test-org/no-such-page', { org: 'test-org', project: 'no-such-page' })
  expect(scope.org).toBe('test-org')
  expect(scope.core).toEqual([])
  expect(scope.projectMenu).toEqual([])
  expect(scope.current).toBeUndefined()
  expect(scope.organisationMenu.map((item) => item.href)).toContain('/test-org')
  // The member's own project keeps its links.
  const own = shellScope(member, '/test-org/test-project/windows', { org: 'test-org', project: 'test-project' })
  expect(own.core.map((item) => item.href)).toContain('/test-org/test-project/windows')
  // When the project list could not be read, the URL's project is all there is to go on: its links stay.
  const unread = shellScope(
    { ...member, projectsError: { 'org-one': { status: 503, at: '2026-11-13T00:00:00.000Z' } } },
    '/test-org/test-project/windows',
    { org: 'test-org', project: 'test-project' }
  )
  expect(unread.core.map((item) => item.href)).toContain('/test-org/test-project/windows')
})
