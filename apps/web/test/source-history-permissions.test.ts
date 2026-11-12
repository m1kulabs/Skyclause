import '@skyclause/auth/test/harness/database'
import { can } from '@skyclause/auth/can'
import { listSourceReadings, listSourcePolls } from '@skyclause/api'
import {
  apiRequest,
  asSession,
  asApiKey,
  asDevice,
  asSystem,
  asGuestToken,
  asOAuth,
  asShareLink,
  createTestApi,
  testDeps,
  testOrg
} from '@skyclause/api/testing'
import type { Principal } from '@skyclause/contracts'
import { recordAudit, withSystem, withTenant } from '@skyclause/db'
import { makeOrganization, makeProject, makeSource } from '@skyclause/db/test/factories/index'
import { beforeAll, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'

const ORG = 'source-history-real-can'
const OTHER = 'source-history-real-can-other'
const orgId = testOrg(ORG).id
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId, role: 'viewer' as const }
const now = new Date('2026-11-12T13:13:00Z')
const { v1 } = createTestApi({ deps: testDeps({ can, withTenant, recordAudit, now: () => now }) })
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})
for (const [kind, service] of [
  ['readings', listSourceReadings],
  ['polls', listSourcePolls]
] as const) {
  test(`production Can permits unbound catalogue ${kind} with independently scoped grants`, async () => {
    const src = await withSystem('source-history-real-can-test', (tx) => makeSource(tx))
    for (const principal of [
      viewer,
      { ...asSession({ org: ORG, role: 'guest', guest: true }), orgId, role: 'guest' as const },
      asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
      asGuestToken({ org: ORG }),
      asOAuth({ org: ORG, role: 'viewer', projectIds: [] }),
      asShareLink({ org: ORG, projectId: randomUUID(), access: 'reviewer' })
    ]) {
      expect(
        await withTenant({ orgId, principal }, async (tx) =>
          service({ tx, principal }, { sourceId: src.id, query: { limit: 50 } }, { can, now })
        )
      ).toEqual({ data: [], next_cursor: null })
      expect(
        (await apiRequest(v1, { as: principal, org: ORG, method: 'GET', path: `/v1/sources/${src.id}/${kind}` })).status
      ).toBe(200)
    }
  })
}

for (const [kind, service] of [
  ['readings', listSourceReadings],
  ['polls', listSourcePolls]
] as const) {
  const direct = (sourceId: string, principal: Principal) =>
    withTenant({ orgId, principal }, async (tx) =>
      service({ tx, principal }, { sourceId, query: { limit: 50 } }, { can, now })
    )
  const request = (sourceId: string, principal: Principal) =>
    apiRequest(v1, { as: principal, org: ORG, method: 'GET', path: `/v1/sources/${sourceId}/${kind}` })
  test(`production Can bounds private ${kind} to its actual project and permits catalogue across organisations`, async () => {
    const [own, other] = await withTenant({ orgId, principal: viewer }, async (tx) => [
      await makeProject(tx),
      await makeProject(tx)
    ])
    const privateSource = await withTenant({ orgId, principal: viewer }, (tx) =>
      makeSource(tx, { kind: 'camera', meta: { project_id: own.id } })
    )
    const allowed = [
      viewer,
      { ...asSession({ org: ORG, role: 'guest', guest: true }), orgId, role: 'guest' as const },
      asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
      asGuestToken({ org: ORG }),
      asOAuth({ org: ORG, role: 'viewer', projectIds: [own.id] }),
      asOAuth({ org: ORG, role: null, projectIds: [own.id], shareLinkId: randomUUID() }),
      asShareLink({ org: ORG, projectId: own.id, access: 'reviewer' })
    ]
    for (const principal of allowed) {
      expect(await direct(privateSource.id, principal)).toEqual({ data: [], next_cursor: null })
      expect((await request(privateSource.id, principal)).status).toBe(200)
    }
    for (const principal of [
      asOAuth({ org: ORG, role: 'viewer', projectIds: [other.id] }),
      asOAuth({ org: ORG, role: null, projectIds: [other.id], shareLinkId: randomUUID() }),
      asShareLink({ org: ORG, projectId: other.id, access: 'reviewer' })
    ]) {
      await expect(direct(privateSource.id, principal)).rejects.toMatchObject({ status: 404 })
      expect((await request(privateSource.id, principal)).status).toBe(404)
    }
    const catalogue = await withSystem('source-history-real-can-test', (tx) => makeSource(tx))
    const otherOrg = testOrg(OTHER).id
    const principal = {
      ...asSession({ org: OTHER, role: 'guest', guest: true }),
      orgId: otherOrg,
      role: 'guest' as const
    }
    expect(
      await withTenant({ orgId: otherOrg, principal }, async (tx) =>
        service({ tx, principal }, { sourceId: catalogue.id, query: { limit: 50 } }, { can, now })
      )
    ).toEqual({ data: [], next_cursor: null })
    expect(
      (await apiRequest(v1, { as: principal, org: OTHER, method: 'GET', path: `/v1/sources/${catalogue.id}/${kind}` }))
        .status
    ).toBe(200)
  })
  test(`production Can uniformly denies forbidden ${kind} actors and hides foreign or corrupt private ownership`, async () => {
    const local = await withSystem('source-history-real-can-test', (tx) => makeSource(tx))
    const otherOrg = testOrg(OTHER).id
    const foreign = await withTenant({ orgId: otherOrg, principal: { ...viewer, orgId: otherOrg } }, async (tx) => {
      const p = await makeProject(tx)
      return makeSource(tx, { kind: 'pi', meta: { project_id: p.id } })
    })
    for (const principal of [
      asDevice({ org: ORG }),
      asSystem('source-history-real-can-test'),
      asApiKey({ org: ORG, role: 'viewer', scopes: [] }),
      asOAuth({ org: ORG, role: 'viewer', scopes: [] }),
      asGuestToken({ org: ORG, scopes: [] }),
      { ...viewer, role: null }
    ]) {
      for (const sourceId of [local.id, foreign.id, randomUUID()]) {
        await expect(direct(sourceId, principal)).rejects.toMatchObject({ status: 403 })
        // HTTP middleware resolves a session's role afresh from membership.
        if (principal.kind !== 'session') expect((await request(sourceId, principal)).status).toBe(403)
      }
    }
    const corrupt = await withTenant({ orgId, principal: viewer }, (tx) =>
      makeSource(tx, { kind: 'camera', meta: { project_id: 'invalid' } })
    )
    for (const sourceId of [foreign.id, corrupt.id])
      for (const principal of [
        viewer,
        asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
        asOAuth({ org: ORG, role: 'viewer', projectIds: [randomUUID()] }),
        asShareLink({ org: ORG, projectId: randomUUID(), access: 'reviewer' })
      ]) {
        await expect(direct(sourceId, principal)).rejects.toMatchObject({ status: 404 })
        expect((await request(sourceId, principal)).status).toBe(404)
      }
  })
}
