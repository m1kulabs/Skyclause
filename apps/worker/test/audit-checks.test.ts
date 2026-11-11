// #456, #535: the model-retirement, crossing-without-bundle and no-approver checks, as the worker composes them, run
// by one real auditor tick on the test database. Notifications and staff email go to doubles.
import { MODELS } from '@skyclause/agent'
import type { EmailTransport, Notify } from '@skyclause/contracts'
import { auditFinding, systemPrincipal, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCrossing,
  makeMember,
  makeOrganization,
  makeProject,
  makeRun
} from '@skyclause/db/test/factories/index'
import { runScene } from '@skyclause/db/test/runs/scene'
import { expect, test, vi } from 'vitest'
import { noApproverCheck } from '../src/alerts'
import { auditChecks, createAuditor } from '../src/auditor'
import '../src/registry'

// models.ts pins one model, retiring no earlier than 2 September 2027: 4 August is 29 days out (MYT).
const NOW = new Date('2027-08-04T01:00:00Z')
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000)
const registered = (name: string) => auditChecks().find((c) => c.name === name)!

test('one tick reports a finding from each registered check, and the next opens nothing new', async () => {
  const orgId = (await makeOrganization()).id
  const owner = await makeMember({ organizationId: orgId, role: 'owner' })
  const admin = await makeMember({ organizationId: orgId, role: 'admin' })
  const admins = [owner.userId, admin.userId].sort()
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)

  const crossing = await inOrg(async (tx) => {
    const scene = await runScene(tx)
    return makeCrossing(tx, {
      snapshotId: scene.snapshotId,
      projectId: scene.projectId,
      scopeKind: 'window',
      scopeId: scene.windowId,
      from: 'normal',
      to: 'commute_disruption',
      at: minutes(-10)
    })
  })
  const due = await inOrg(async (tx) => {
    const project = await makeProject(tx)
    const run = await makeRun(tx, { projectId: project.id })
    return makeBundle(tx, { runId: run.id, state: 'needs_review', needsReviewAt: minutes(-10), slaDueAt: minutes(1) })
  })

  const notify = vi.fn<Notify>(async () => {})
  const send = vi.fn<EmailTransport['send']>(async () => ({ providerMessageId: 'test' }))
  const tick = createAuditor({
    // `no_approver` is registered on production's rota lookup, which is a placeholder until its owner lands, so
    // this tick runs the same check on a rota that has nobody on duty.
    checks: () => [
      registered('model_retirement'),
      registered('crossing_without_bundle'),
      noApproverCheck({ onDuty: async () => [] })
    ],
    notify,
    email: { send },
    staffEmails: () => ['staff@example.org'],
    heartbeat: () => {}
  }).batch!.auditor!
  const opened = () =>
    withSystem('auditor', async (tx) =>
      (await tx.select().from(auditFinding)).map(({ check, key, orgId, recoveredAt }) => ({
        check,
        key,
        orgId,
        recovered: recoveredAt !== null
      }))
    )

  await tick(NOW)

  expect((await opened()).sort((a, b) => a.check.localeCompare(b.check))).toEqual([
    { check: 'crossing_without_bundle', key: `crossing:${crossing.id}`, orgId, recovered: false },
    { check: 'model_retirement', key: `model_retirement:${MODELS[0]!.model}`, orgId: null, recovered: false },
    { check: 'no_approver', key: `no_approver:${due.id}`, orgId, recovered: false }
  ])
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]![0]).toMatchObject({ to: 'staff@example.org', category: 'auditor' })
  expect(send.mock.calls[0]![0].subject).toContain(`model_retirement / model_retirement:${MODELS[0]!.model}`)
  expect(notify.mock.calls.map(([, n]) => [n.ref, n.accountIds])).toEqual([
    [{ type: 'crossing', id: crossing.id }, admins],
    [{ type: 'bundle', id: due.id }, admins]
  ])

  const sent = [send.mock.calls.length, notify.mock.calls.length]
  await tick(minutes(15))
  expect([send.mock.calls.length, notify.mock.calls.length]).toEqual(sent)
})
