import '@skyclause/auth/test/harness/database'
import { can } from '@skyclause/auth/can'
import { bindSource, listCatalogueSources, unbindSource, updateProjectPack } from '@skyclause/api'
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
import {
  makeOrganization,
  makeProject,
  makeProjectPack,
  makeReading,
  makeSource
} from '@skyclause/db/test/factories/index'
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

describe('binding', () => {
  test('service_permissions uses production Can for direct calls and HTTP', async () => {
    const [a, b] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
    const source = await withSystem('binding-real-can', (tx) => makeSource(tx))
    const session = (role: 'admin' | 'owner' | 'editor' | 'viewer') => ({
      ...asSession({ org: ORG, role }),
      orgId,
      role
    })
    const allowed = [
      session('admin'),
      session('owner'),
      asApiKey({ org: ORG, role: 'admin', scopes: ['admin'] }),
      asApiKey({ org: ORG, role: 'owner', scopes: ['admin'] })
    ]
    const denied = [
      session('editor'),
      session('viewer'),
      { ...asSession({ org: ORG, role: 'guest', guest: true }), orgId, role: 'guest' as const },
      asApiKey({ org: ORG, role: 'editor', scopes: ['admin'] }),
      asApiKey({ org: ORG, role: 'admin', scopes: ['read'] }),
      asOAuth({ org: ORG, role: 'admin', projectIds: [a.id] }),
      asShareLink({ org: ORG, projectId: a.id, access: 'reviewer' }),
      asDevice({ org: ORG })
    ]
    for (const principal of allowed) {
      // Use the actual app login, including public-source reads, rather than system setup privilege.
      const result = await withTenant({ orgId, principal }, (tx) =>
        bindSource({ tx, principal }, { projectId: a.id, sourceId: source.id }, { now: new Date(), can })
      )
      expect(result.role).toBe('rain_gauge')
      const response = await apiRequest(v1, {
        as: principal,
        method: 'POST',
        path: `/v1/projects/${a.id}/sources`,
        org: ORG,
        body: { source_id: source.id },
        idempotencyKey: randomUUID()
      })
      expect(response.status).toBe(201)
      await withTenant({ orgId, principal }, (tx) =>
        unbindSource({ tx, principal }, { projectId: a.id, sourceId: source.id }, { now: new Date(), can })
      )
    }
    for (const principal of denied) {
      for (const service of [bindSource, unbindSource])
        await expect(
          withTenant({ orgId, principal }, async (tx) => {
            await service({ tx, principal }, { projectId: a.id, sourceId: source.id }, { now: new Date(), can })
          })
        ).rejects.toMatchObject({ status: 403 })
      for (const method of ['POST', 'DELETE']) {
        const response = await apiRequest(v1, {
          as: principal,
          method,
          path: `/v1/projects/${a.id}/sources${method === 'DELETE' ? `/${source.id}` : ''}`,
          org: ORG,
          ...(method === 'POST' ? { body: { source_id: source.id }, idempotencyKey: randomUUID() } : {})
        })
        expect(response.status).toBe(403)
      }
    }
    for (const principal of [
      asOAuth({ org: ORG, role: 'admin', projectIds: [a.id] }),
      asShareLink({ org: ORG, projectId: a.id })
    ]) {
      for (const service of [bindSource, unbindSource])
        await expect(
          withTenant({ orgId, principal }, async (tx) => {
            await service({ tx, principal }, { projectId: b.id, sourceId: source.id }, { now: new Date(), can })
          })
        ).rejects.toMatchObject({ status: 404 })
      for (const method of ['POST', 'DELETE']) {
        const response = await apiRequest(v1, {
          as: principal,
          method,
          path: `/v1/projects/${b.id}/sources${method === 'DELETE' ? `/${source.id}` : ''}`,
          org: ORG,
          ...(method === 'POST' ? { body: { source_id: source.id }, idempotencyKey: randomUUID() } : {})
        })
        // Uniform denial precedes HTTP resource lookup for principals prohibited from binding.
        expect(response.status).toBe(403)
      }
    }
  })
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

describe('pack settings', () => {
  test('service_permissions uses production Can for direct pack writes and HTTP', async () => {
    const [a, b] = await tenant(async (tx) => {
      const a = await makeProject(tx)
      await makeProjectPack(tx, { projectId: a.id, pack: 'sky' })
      return [a, await makeProject(tx)]
    })
    const session = (role: 'admin' | 'owner' | 'editor' | 'viewer' | 'guest') => ({
      ...asSession({ org: ORG, role }),
      orgId,
      role
    })
    const allowed = [
      session('admin'),
      session('owner'),
      asApiKey({ org: ORG, role: 'admin', scopes: ['admin'] }),
      asApiKey({ org: ORG, role: 'owner', scopes: ['admin'] })
    ]
    const denied = [
      session('editor'),
      session('viewer'),
      session('guest'),
      asApiKey({ org: ORG, role: 'editor', scopes: ['admin'] }),
      asApiKey({ org: ORG, role: 'admin', scopes: ['read'] }),
      asOAuth({ org: ORG, role: 'admin', projectIds: [a.id] }),
      asShareLink({ org: ORG, projectId: a.id }),
      asDevice({ org: ORG })
    ]
    for (const principal of [...allowed, ...denied]) {
      const write = () =>
        withTenant({ orgId, principal }, (tx) =>
          updateProjectPack(
            { tx, principal },
            { projectId: a.id, pack: 'sky', enabled: true },
            { can, now: new Date() }
          )
        )
      if (allowed.includes(principal)) expect(await write()).toMatchObject({ pack: 'sky', enabled: true })
      else await expect(write()).rejects.toMatchObject({ status: 403 })
      const response = await apiRequest(v1, {
        as: principal,
        org: ORG,
        method: 'PATCH',
        path: `/v1/projects/${a.id}/packs/sky`,
        body: { enabled: true }
      })
      expect(response.status).toBe(allowed.includes(principal) ? 200 : 403)
    }
    for (const principal of [
      asOAuth({ org: ORG, role: 'admin', projectIds: [a.id] }),
      asShareLink({ org: ORG, projectId: a.id })
    ]) {
      await expect(
        withTenant({ orgId, principal }, (tx) =>
          updateProjectPack(
            { tx, principal },
            { projectId: b.id, pack: 'sky', enabled: true },
            { can, now: new Date() }
          )
        )
      ).rejects.toMatchObject({ status: 404 })
    }
  })
})
