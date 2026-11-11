import { analyticsEvent, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeMember,
  makeOrganization,
  makeProject,
  makeProjectChannel,
  makeProjectSource,
  makeReading,
  makeRotaShift,
  makeSource,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { and, eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

const deps = testDeps({ withTenant })
const { api } = createTestApi({ deps })

async function newOrg(slug: string) {
  const orgId = testOrg(slug).id
  await makeOrganization({ id: orgId, slug })
  await makeMember({ organizationId: orgId, role: 'owner' })
  return { orgId, slug, admin: asSession({ org: slug, role: 'admin' }) }
}

const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)

describe('ORG-6 onboarding API', () => {
  test('reports the six owner rows with their result lines and owner routes', async () => {
    const { orgId, slug: org, admin } = await newOrg('onboarding-api-state')
    const { projectId, sourceId } = await inOrg(orgId, async (tx) => {
      const project = await makeProject(tx, { slug: 'first-run', name: 'First run project' })
      const source = await makeSource(tx, {
        kind: 'apims',
        externalId: 'CA16W',
        name: 'Cheras',
        cadenceS: 3600,
        staleAfterS: 7200,
        licenceId: 'unpublished',
        licenceLabel: 'no published terms'
      })
      await makeProjectSource(tx, { projectId: project.id, sourceId: source.id, role: 'api_station' })
      await makeReading(tx, {
        sourceId: source.id,
        metric: 'api',
        unit: null,
        value: 16,
        observedAt: new Date('2026-11-05T13:00:00.000Z'),
        receivedAt: new Date('2026-11-05T13:01:00.000Z')
      })
      await makeWindow(tx, {
        projectId: project.id,
        guest: false,
        title: 'First class',
        startsAt: new Date('2026-11-10T02:00:00.000Z'),
        endsAt: new Date('2026-11-10T03:00:00.000Z')
      })
      const member = await makeMember({ organizationId: orgId, role: 'approver' })
      await makeRotaShift(tx, { accountId: member.userId })
      await makeProjectChannel(tx, { projectId: project.id, channel: 'email', enabled: true })
      return { projectId: project.id, sourceId: source.id }
    })

    const response = await apiRequest(api, { as: admin, method: 'GET', path: `/api/orgs/${org}/onboarding` })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { steps: Array<Record<string, unknown>> }
    expect(body.steps.map((step) => step.step)).toEqual([
      'organisation',
      'project',
      'sources',
      'window',
      'rota',
      'channel'
    ])
    expect(body.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: 'project',
          completed_at: expect.any(String),
          skipped: false,
          href: `/${org}/new`,
          result: 'First run project created'
        }),
        expect.objectContaining({
          step: 'sources',
          completed_at: expect.any(String),
          skipped: false,
          href: `/${org}/first-run/settings/packs`,
          result: expect.stringContaining('CA16W bound · API 16')
        }),
        expect.objectContaining({
          step: 'window',
          completed_at: expect.any(String),
          skipped: false,
          href: `/${org}/first-run/windows?declare=window`
        }),
        expect.objectContaining({
          step: 'rota',
          completed_at: expect.any(String),
          skipped: false,
          href: `/${org}/settings/rota`
        }),
        expect.objectContaining({
          step: 'channel',
          completed_at: expect.any(String),
          skipped: false,
          href: `/${org}/first-run/settings/channels`
        })
      ])
    )
    expect(sourceId).toEqual(expect.any(String))
    expect(projectId).toEqual(expect.any(String))
  })

  test('POST skip persists a step, DELETE resumes it, and the skip event is written only once', async () => {
    const { orgId, slug: org, admin } = await newOrg('onboarding-api-skip')
    const path = `/api/orgs/${org}/onboarding/project/skip`
    const skipped = await apiRequest(api, { as: admin, method: 'POST', path })
    expect(skipped.status).toBe(200)
    expect(await skipped.json()).toMatchObject({
      steps: expect.arrayContaining([expect.objectContaining({ step: 'project', completed_at: null, skipped: true })])
    })

    const resumed = await apiRequest(api, { as: admin, method: 'DELETE', path })
    expect(resumed.status).toBe(200)
    expect(await resumed.json()).toMatchObject({
      steps: expect.arrayContaining([expect.objectContaining({ step: 'project', completed_at: null, skipped: false })])
    })

    const events = await withSystem('test', (tx) =>
      tx
        .select()
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.orgId, orgId), eq(analyticsEvent.name, 'onboarding_step')))
    )
    const eventStep = (event: (typeof events)[number]) => (event.props as { step: string }).step
    expect(events.filter((event) => eventStep(event) === 'project_created')).toHaveLength(1)
    expect(events.find((event) => eventStep(event) === 'project_created')?.props).toEqual({
      step: 'project_created',
      skipped: true
    })
  })

  test('status reads track an observed completion once with skipped false', async () => {
    const { orgId, slug: org, admin } = await newOrg('onboarding-api-event')
    await inOrg(orgId, async (tx) => {
      await makeProject(tx, { slug: 'tracked-first-run' })
    })
    const path = `/api/orgs/${org}/onboarding`
    for (let read = 0; read < 2; read++) {
      expect((await apiRequest(api, { as: admin, method: 'GET', path })).status).toBe(200)
    }
    const events = await withSystem('test', (tx) =>
      tx
        .select()
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.orgId, orgId), eq(analyticsEvent.name, 'onboarding_step')))
    )
    const eventStep = (event: (typeof events)[number]) => (event.props as { step: string }).step
    expect(events.filter((event) => eventStep(event) === 'project_created')).toHaveLength(1)
    expect(events.find((event) => eventStep(event) === 'project_created')?.props).toEqual({
      step: 'project_created',
      skipped: false
    })
  })

  test('each operation answers 404 across organisations and denies non-session credentials', async () => {
    const home = await newOrg('onboarding-api-permissions-home')
    const outside = await newOrg('onboarding-api-permissions-outside')
    const outsideParams = (step?: string): Record<string, string> =>
      step ? { org: outside.slug, step } : { org: outside.slug }
    const operations = [
      {
        operationId: 'getOnboarding',
        method: 'GET' as const,
        path: (org: string) => `/api/orgs/${org}/onboarding`,
        params: outsideParams()
      },
      {
        operationId: 'skipOnboardingStep',
        method: 'POST' as const,
        path: (org: string) => `/api/orgs/${org}/onboarding/project/skip`,
        params: outsideParams('project')
      },
      {
        operationId: 'resumeOnboardingStep',
        method: 'DELETE' as const,
        path: (org: string) => `/api/orgs/${org}/onboarding/project/skip`,
        params: outsideParams('project')
      }
    ]

    for (const operation of operations) {
      await crossOrgCase(operation.operationId, {
        app: api,
        as: home.admin,
        org: home.slug,
        params: operation.params
      }).run()
      const denied = await apiRequest(api, {
        as: asApiKey({ org: home.slug, role: 'admin', scopes: ['read'] }),
        method: operation.method,
        path: operation.path(home.slug),
        org: home.slug
      })
      expect(denied.status, operation.operationId).toBe(403)
    }
  })
})
