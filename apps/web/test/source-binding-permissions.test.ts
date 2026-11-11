import '@skyclause/auth/test/harness/database'
import { can } from '@skyclause/auth/can'
import { listCatalogueSources } from '@skyclause/api'
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
import { withSystem, withTenant } from '@skyclause/db'
import { makeOrganization, makeProject, makeReading, makeSource } from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { beforeAll, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'

const ORG = 'catalogue-real-can'
const orgId = testOrg(ORG).id
const tenant = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const { v1 } = createTestApi({ deps: testDeps({ can, withTenant }) })

beforeAll(async () => {
  await makeOrganization({ id: orgId, slug: ORG })
})

describe('catalogue', () => {
  test('catalogue_permissions uses production Can for roles, scopes and device project bounds', async () => {
    const q = randomUUID()
    const [a, b] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
    const devices = await tenant(async (tx) => {
      const rows = []
      for (const project of [a, b]) {
        const src = await makeSource(tx, { kind: 'pi', name: q, meta: { project_id: project.id } })
        await makeReading(tx, { sourceId: src.id, valueJson: { private: project.id } })
        rows.push(src)
      }
      return rows
    })
    const publicSource = await withSystem('catalogue-real-can', (tx) => makeSource(tx, { name: q }))
    for (const principal of [
      asOAuth({ org: ORG, role: 'viewer', projectIds: [a.id] }),
      asShareLink({ org: ORG, projectId: a.id })
    ]) {
      const result = await tenant((tx) =>
        listCatalogueSources({ tx, principal }, { q, limit: 50 }, { now: new Date(), can })
      )
      expect(result.data.map((s) => s.id).sort()).toEqual([devices[0]!.id, publicSource.id].sort())
      expect(JSON.stringify(result)).not.toContain(b.id)
      const response = await apiRequest(v1, {
        as: principal,
        method: 'GET',
        path: '/v1/catalogue/sources',
        org: ORG,
        query: { q }
      })
      expect(response.status).toBe(200)
      expect((await response.json()).data.map((s: { id: string }) => s.id).sort()).toEqual(
        [devices[0]!.id, publicSource.id].sort()
      )
    }
    const allowed = [asSession({ org: ORG, role: 'viewer' }), asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] })]
    for (const principal of allowed) {
      const response = await apiRequest(v1, {
        as: principal,
        method: 'GET',
        path: '/v1/catalogue/sources',
        org: ORG,
        query: { q }
      })
      expect(response.status).toBe(200)
      expect((await response.json()).data).toHaveLength(3)
    }
    for (const principal of [asDevice({ org: ORG }), asOAuth({ org: ORG, role: 'viewer', scopes: [] })]) {
      await tenant(async (tx) => {
        await expect(
          listCatalogueSources({ tx, principal }, { q, limit: 50 }, { now: new Date(), can })
        ).rejects.toMatchObject({ status: 403 })
      })
      expect(
        (await apiRequest(v1, { as: principal, method: 'GET', path: '/v1/catalogue/sources', org: ORG, query: { q } }))
          .status
      ).toBe(403)
    }
  })
})
