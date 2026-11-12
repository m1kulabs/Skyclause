import '@skyclause/auth/test/harness/database'
import { randomUUID } from 'node:crypto'
import { withTenant } from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { beforeAll, expect, test } from 'vitest'
import { projectVisible } from '../../features/overview/server-gate'

const orgId = randomUUID()
const other = randomUUID()

beforeAll(async () => {
  await makeOrganization({ id: orgId, slug: `gate-${orgId.slice(0, 8)}` })
  await makeOrganization({ id: other, slug: `gate-${other.slice(0, 8)}` })
  await withTenant({ orgId, principal: memberOf(orgId) }, (tx) => makeProject(tx, { slug: 'own-project' }))
  await withTenant({ orgId: other, principal: memberOf(other) }, (tx) => makeProject(tx, { slug: 'their-project' }))
})

test('a member sees their own project by its slug', async () => {
  expect(await projectVisible(memberOf(orgId, 'viewer'), orgId, 'own-project')).toBe(true)
})

test('a mistyped slug, or another organisation’s project, is not visible', async () => {
  expect(await projectVisible(memberOf(orgId, 'viewer'), orgId, 'no-such-project')).toBe(false)
  expect(await projectVisible(memberOf(orgId, 'viewer'), orgId, 'their-project')).toBe(false)
})
