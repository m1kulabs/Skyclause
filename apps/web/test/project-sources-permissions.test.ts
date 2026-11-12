import '@skyclause/auth/test/harness/database'
import { can } from '@skyclause/auth/can'
import { listProjectSources } from '@skyclause/api'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  testDeps,
  testOrg
} from '@skyclause/api/testing'
import { type Principal } from '@skyclause/contracts'
import { recordAudit, withTenant } from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { beforeAll, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'

const ORG = 'project-sources-real-can'
const OTHER = 'project-sources-real-can-other'
const orgId = testOrg(ORG).id
const now = new Date('2026-11-12T13:13:00Z')
const tenant = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const { v1 } = createTestApi({ deps: testDeps({ can, withTenant, recordAudit, now: () => now }) })
const request = (projectId: string, principal: Principal) =>
  apiRequest(v1, { as: principal, org: ORG, method: 'GET', path: `/v1/projects/${projectId}/sources` })
const direct = (projectId: string, principal: Principal) =>
  withTenant({ orgId, principal }, (tx) =>
    listProjectSources({ tx, principal }, { projectId, query: { limit: 50 } }, { can, now })
  )

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

test('production Can composes project source reads for permitted roles and bounded grants', async () => {
  const [a, b] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
  const allowed = [
    { ...asSession({ org: ORG, role: 'viewer' }), orgId, role: 'viewer' as const },
    { ...asSession({ org: ORG, role: 'guest', guest: true }), orgId, role: 'guest' as const },
    asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
    asOAuth({ org: ORG, role: 'viewer', projectIds: [a.id] }),
    asOAuth({ org: ORG, role: null, projectIds: [a.id], shareLinkId: randomUUID() }),
    asShareLink({ org: ORG, projectId: a.id, access: 'reviewer' })
  ]
  for (const principal of allowed) {
    expect(await direct(a.id, principal)).toEqual({ data: [], next_cursor: null })
    expect((await request(a.id, principal)).status).toBe(200)
  }
  for (const principal of allowed.slice(3)) {
    await expect(direct(b.id, principal)).rejects.toMatchObject({ status: 404 })
    expect((await request(b.id, principal)).status).toBe(404)
  }
})

test('production Can uniformly denies ingest-only and scopeless actors before local or foreign project lookup', async () => {
  const local = await tenant((tx) => makeProject(tx))
  const otherOrg = testOrg(OTHER).id
  const foreign = await withTenant({ orgId: otherOrg, principal: memberOf(otherOrg) }, (tx) => makeProject(tx))
  for (const principal of [
    asDevice({ org: ORG }),
    asApiKey({ org: ORG, role: 'viewer', scopes: [] }),
    asOAuth({ org: ORG, role: 'viewer', scopes: [], projectIds: [] })
  ]) {
    for (const projectId of [local.id, foreign.id]) {
      await expect(direct(projectId, principal)).rejects.toMatchObject({ status: 403 })
      expect((await request(projectId, principal)).status).toBe(403)
    }
  }
  for (const principal of [
    asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
    asOAuth({ org: ORG, role: 'viewer', projectIds: [foreign.id] }),
    asShareLink({ org: ORG, projectId: foreign.id, access: 'reviewer' })
  ]) {
    await expect(direct(foreign.id, principal)).rejects.toMatchObject({ status: 404 })
    expect((await request(foreign.id, principal)).status).toBe(404)
  }
})
