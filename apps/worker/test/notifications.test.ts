// #156 (c-notifications): the worker's `notifications` consumer turns §5's needs-review, escalation, source-error and
// review-item events into in-app items, through `onEvent` and `handleOnce`. None of their emitters is merged yet
// (#150, #155, b-evaluator, #161), so each test emits its event with `emitEvent`; #103's `nextApprovers` is a double.
import type { EventType, Role } from '@skyclause/contracts'
import {
  emitEvent,
  notificationRows,
  setNotificationPreferences,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeBundle,
  makeMember,
  makeOrganization,
  makeProject,
  makeReviewItem,
  makeSource,
  makeUser
} from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { dispatchEvent } from '../src/events'
import { notificationsPart } from '../src/notifications'

const nextApprovers = vi.fn(async () => [] as string[])
const [consumer] = notificationsPart({ nextApprovers }).events!

let orgId: string
let projectId: string
const people = {} as Record<Role, string>
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, id = orgId) =>
  withTenant({ orgId: id, principal: systemPrincipal('test') }, fn)
const itemsOf = (accountId: string, id = orgId) => inOrg((tx) => notificationRows(tx, { accountId }), id)

async function member(org: string, role: Role) {
  const user = await makeUser()
  await makeMember({ organizationId: org, userId: user.id, role })
  return user.id
}
/** Emits the event in the project (emitEvent validates `data`), then delivers it to the consumer like a Pub/Sub push. */
async function deliver(type: EventType, data: Record<string, unknown>, project = projectId) {
  const { id } = await inOrg((tx) =>
    emitEvent(tx, { projectId: project, type, data } as Parameters<typeof emitEvent>[1])
  )
  await dispatchEvent([consumer!], id)
  return id
}
const bundleData = (bundleId: string, state = 'needs_review') => ({
  bundle_id: bundleId,
  pack: 'sky',
  state,
  call_ids: [],
  sla_due_at: '2026-11-09T08:10:00Z'
})

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  projectId = (await inOrg((tx) => makeProject(tx))).id
  for (const role of ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest'] as const) {
    people[role] = await member(orgId, role)
  }
})

describe('the notifications consumer', () => {
  test('NTC-6: turning off source errors stops them for that account only', async () => {
    const [ana, ben] = [await member(orgId, 'viewer'), await member(orgId, 'viewer')]
    const outsider = await member((await makeOrganization()).id, 'owner')
    await inOrg((tx) => setNotificationPreferences(tx, ana, [{ kind: 'source_error', enabled: false }]))
    const source = await inOrg((tx) => makeSource(tx))
    await deliver('source.error', {
      source_id: source.id,
      state: 'error',
      since: '2026-11-09T07:00:00Z',
      http_status: 503
    })
    expect(await itemsOf(ana)).toEqual([])
    expect(await itemsOf(ben)).toEqual([
      expect.objectContaining({
        kind: 'source_error',
        ref: { type: 'source', id: source.id },
        project: expect.objectContaining({ id: projectId })
      })
    ])
    expect(await itemsOf(outsider)).toEqual([])
  })

  test('a source error reaches every member once, even for a source bound to two projects', async () => {
    const source = await inOrg((tx) => makeSource(tx))
    const second = (await inOrg((tx) => makeProject(tx))).id
    const data = { source_id: source.id, state: 'error', since: '2026-11-09T07:00:00Z', http_status: 0 }
    await deliver('source.error', data)
    await deliver('source.error', data, second)
    for (const accountId of Object.values(people)) {
      expect((await itemsOf(accountId)).filter((n) => n.ref.id === source.id)).toHaveLength(1)
    }
  })

  test.each([
    ['bundle.needs_review', 'needs_review', 'bundle'],
    ['review_item.opened', 'review_item', 'review_item']
  ] as const)(
    '%s reaches each member whose role grants bundle.approve, once; a redelivery adds none',
    async (type, kind, refType) => {
      const refId = await inOrg(async (tx) =>
        refType === 'bundle' ? (await makeBundle(tx, { projectId })).id : (await makeReviewItem(tx)).id
      )
      const id = await deliver(
        type,
        refType === 'bundle' ? bundleData(refId) : { review_item_id: refId, outcome: 'miss' }
      )
      await dispatchEvent([consumer!], id)
      const reached = async (role: Role) => (await itemsOf(people[role])).filter((n) => n.ref.id === refId)
      for (const role of ['owner', 'admin', 'approver'] as const) {
        expect(await reached(role), role).toEqual([
          expect.objectContaining({ kind, ref: { type: refType, id: refId } })
        ])
      }
      for (const role of ['editor', 'viewer', 'guest'] as const) expect(await reached(role), role).toEqual([])
    }
  )

  test("an escalation reaches the level's accounts: nextApprovers for next_approver, Owners and Admins for admins", async () => {
    const bundleId = await inOrg(async (tx) => (await makeBundle(tx, { projectId })).id)
    nextApprovers.mockResolvedValueOnce([people.approver])
    const first = await deliver('bundle.escalated', { ...bundleData(bundleId, 'escalated'), level: 'next_approver' })
    expect(nextApprovers).toHaveBeenCalledWith(expect.anything(), { projectId, bundleId, at: expect.any(Date) })
    await deliver('bundle.escalated', { ...bundleData(bundleId, 'escalated'), level: 'admins' })
    await dispatchEvent([consumer!], first)
    const escalated = async (role: Role) =>
      (await itemsOf(people[role])).filter((n) => n.kind === 'escalated' && n.ref.id === bundleId)
    for (const role of ['approver', 'owner', 'admin'] as const) expect(await escalated(role), role).toHaveLength(1)
    for (const role of ['editor', 'viewer', 'guest'] as const) expect(await escalated(role), role).toEqual([])
    expect(nextApprovers).toHaveBeenCalledTimes(1)
  })
})
