import { randomUUID } from 'node:crypto'
import { createBundle, project, systemPrincipal, withTenant } from '@skyclause/db'
import { bundleScene, callDraft, runOf, windowOf } from '@skyclause/db/test/bundles/scene'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import type { WithTenant } from '../src/tenancy'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

const A = 'calls-open-a'
const B = 'calls-open-b'
const { api } = createTestApi({ deps: testDeps({ withTenant: withTenant as unknown as WithTenant }) })
let callId: string
let projectSlug: string

beforeAll(async () => {
  for (const slug of [A, B]) await makeOrganization({ id: testOrg(slug).id, slug })

  const created = await withTenant({ orgId: testOrg(A).id, principal: systemPrincipal('test') }, async (tx) => {
    const projectRow = await makeProject(tx)
    const scene = await bundleScene(tx, { projectId: projectRow.id })
    const window = await windowOf(tx, scene, new Date('2026-11-02T07:15:00Z'), new Date('2026-11-02T07:30:00Z'))
    const run = await runOf(tx, scene, new Date('2026-11-02T07:05:00Z'))
    const bundle = await createBundle(tx, {
      runId: run.id,
      pack: 'sky',
      draftOnly: false,
      calls: [callDraft({ windowId: window.id })],
      triggeredAt: run.triggeredAt,
      now: new Date('2026-11-02T07:10:00Z')
    })
    const [row] = await tx.select({ slug: project.slug }).from(project).where(eq(project.id, projectRow.id))
    return { callId: bundle.callIds[0]!, projectSlug: row!.slug }
  })
  callId = created.callId
  projectSlug = created.projectSlug
})

describe('GET /api/calls/{id}/open', () => {
  test('redirects a member to the call page and drops the query string', async () => {
    const response = await apiRequest(api, {
      as: asSession({ org: A, role: 'viewer' }),
      method: 'GET',
      path: `/api/calls/${callId}/open?source=private-page`
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`/${A}/${projectSlug}/calls/${callId}`)
  })

  test('hides another organisation’s call from a member', async () => {
    await crossOrgCase('openCall', {
      app: api,
      as: asSession({ org: B, role: 'viewer' }),
      params: { id: callId }
    }).run()
  })

  test('returns 404 for an unknown call', async () => {
    const response = await apiRequest(api, {
      as: asSession({ org: A, role: 'viewer' }),
      method: 'GET',
      path: `/api/calls/${randomUUID()}/open`
    })

    expect(response.status).toBe(404)
  })

  test('refuses an API key', async () => {
    const response = await apiRequest(api, {
      as: asApiKey({ org: A, role: 'viewer', scopes: ['read'] }),
      method: 'GET',
      path: `/api/calls/${callId}/open`
    })

    expect(response.status).toBe(403)
  })
})
