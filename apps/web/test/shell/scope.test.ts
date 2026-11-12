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
