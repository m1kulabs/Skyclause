// #111's product-health views: system-only reads over operations rows, with an injected clock at week and SLA
// boundaries. Each view is queried inside `withTenant` as a system principal; `app` and `public_reader` are refused.
import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { readBundlesPastSla, readSignalHealth, readWeeklyApprovers, systemPrincipal, withTenant, type Tx } from '../src'
import {
  makeApproval,
  makeBundle,
  makeOrganization,
  makePoll,
  makeProject,
  makeRotaShift,
  makeRun,
  makeSource,
  makeSourceState
} from './factories'
import { asLogin, memberOf, refusal } from './harness'

const asSystem = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test-health') }, fn)
const asMember = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)

test('each view returns no rows for a fresh organisation, and app and public_reader are refused all three', async () => {
  const orgId = (await makeOrganization()).id
  expect(await asSystem(orgId, readWeeklyApprovers)).toEqual([])
  expect(await asSystem(orgId, readBundlesPastSla)).toEqual([])
  expect(await asSystem(orgId, readSignalHealth)).toEqual([])
  for (const view of ['weekly_approvers', 'bundles_past_sla', 'signal_health']) {
    expect(await refusal(asLogin('app', (client) => client.query(`SELECT FROM ${view}`))), view).toMatch(
      /permission denied/
    )
  }
  expect(
    await refusal(
      asLogin('postgres', async (client) => {
        await client.query('SET ROLE public_reader')
        await client.query('SELECT FROM weekly_approvers')
      })
    )
  ).toMatch(/permission denied/)
})

test('weekly approvers counts distinct approving members per ISO week against storm and surge rota slots', async () => {
  const orgId = (await makeOrganization()).id
  const monday = new Date('2026-11-02T00:00:00Z')
  const sunday = new Date('2026-11-01T23:59:59Z')
  await asMember(orgId, async (tx) => {
    const bundleId = (await makeBundle(tx)).id
    const [amy, ben, cat] = [randomUUID(), randomUUID(), randomUUID()]
    await makeApproval(tx, { bundleId, actorId: amy, action: 'approve', createdAt: monday })
    await makeApproval(tx, { bundleId, actorId: amy, action: 'edit', createdAt: monday })
    await makeApproval(tx, { bundleId, actorId: ben, action: 'reject', createdAt: monday })
    await makeApproval(tx, { bundleId, actorId: cat, action: 'approve', createdAt: sunday })
    await makeApproval(tx, { bundleId, actorId: amy, action: 'escalate', createdAt: monday })
    await makeRotaShift(tx, { template: 'storm_afternoon' })
    await makeRotaShift(tx, { template: 'surge_night' })
    await makeRotaShift(tx, { template: 'custom' })
  })
  expect(await asSystem(orgId, readWeeklyApprovers)).toEqual([
    { orgId, weekStart: '2026-10-26', approvers: 1, rotaSlots: 2 },
    { orgId, weekStart: '2026-11-02', approvers: 2, rotaSlots: 2 }
  ])
})

test('bundles past SLA are escalated bundles and expired ones with no escalation', async () => {
  const orgId = (await makeOrganization()).id
  const due = new Date('2026-11-08T01:00:00Z')
  const ids = await asMember(orgId, async (tx) => {
    const projectId = (await makeProject(tx)).id
    const runId = (await makeRun(tx, { projectId })).id
    const escalated = await makeBundle(tx, { runId, state: 'needs_review', escalationLevel: 1, slaDueAt: due })
    const expired = await makeBundle(tx, { runId, state: 'expired', escalationLevel: 0, slaDueAt: due })
    const expiredEscalated = await makeBundle(tx, { runId, state: 'expired', escalationLevel: 2, slaDueAt: due })
    const approved = await makeBundle(tx, { runId, state: 'approved', slaDueAt: due })
    return {
      escalated: escalated.id,
      expired: expired.id,
      expiredEscalated: expiredEscalated.id,
      approved: approved.id
    }
  })
  const rows = await asSystem(orgId, readBundlesPastSla)
  expect(rows.map(({ bundleId, reason }) => ({ bundleId, reason }))).toEqual([
    { bundleId: ids.escalated, reason: 'escalated' },
    { bundleId: ids.expired, reason: 'expired_unescalated' },
    { bundleId: ids.expiredEscalated, reason: 'escalated' }
  ])
  expect(rows.map(({ bundleId }) => bundleId)).not.toContain(ids.approved)
  expect(rows[0]).toMatchObject({ orgId, slaDueAt: due })
})

test('signal health shares poll hours fresh, stale and erroring, with the current state', async () => {
  const orgId = (await makeOrganization()).id
  const at = (hour: number, minute: number) => new Date(Date.UTC(2026, 10, 2, hour, minute))
  const sourceId = await withTenant({ orgId, principal: systemPrincipal('test-catalogue-sync') }, async (tx) => {
    const { id } = await makeSource(tx)
    await makePoll(tx, { sourceId: id, startedAt: at(6, 15) })
    await makePoll(tx, { sourceId: id, startedAt: at(6, 45) })
    await makePoll(tx, { sourceId: id, startedAt: at(6, 59), outcome: 'unchanged', httpStatus: 304 })
    await makePoll(tx, { sourceId: id, startedAt: at(7, 0), outcome: 'timeout', httpStatus: 503, errorCode: 'timeout' })
    await makePoll(tx, { sourceId: id, startedAt: at(8, 30), outcome: 'stale_snapshot', httpStatus: 200 })
    await makePoll(tx, { sourceId: id, startedAt: at(9, 0), outcome: 'error', httpStatus: 404 })
    await makePoll(tx, { sourceId: id, startedAt: at(10, 0), outcome: 'error', httpStatus: null })
    await makeSourceState(tx, { sourceId: id, state: 'stale', since: at(8, 45) })
    return id
  })
  const quietId = await withTenant({ orgId, principal: systemPrincipal('test-catalogue-sync') }, async (tx) => {
    const { id } = await makeSource(tx)
    await makeSourceState(tx, { sourceId: id, state: 'fresh', since: at(5, 0) })
    return id
  })
  const rows = await asSystem(orgId, readSignalHealth)
  expect(rows).toEqual([
    {
      sourceId,
      currentState: 'stale',
      stateSince: at(8, 45),
      hoursTotal: 5,
      hoursFresh: 1,
      hoursStale: 1,
      hoursError: 3,
      shareFresh: 1 / 5,
      shareStale: 1 / 5,
      shareError: 3 / 5
    },
    {
      sourceId: quietId,
      currentState: 'fresh',
      stateSince: at(5, 0),
      hoursTotal: 0,
      hoursFresh: 0,
      hoursStale: 0,
      hoursError: 0,
      shareFresh: null,
      shareStale: null,
      shareError: null
    }
  ])
})
