// #156 (c-notifications): §1's `notify` and the in-app item reads, on the #79 §7 test database.
import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  accountOrganisations,
  markNotificationRead,
  notificationPreferences,
  notificationRows,
  notify,
  orgMembers,
  setNotificationPreferences,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '../src'
import { makeMember, makeNotificationPreference, makeOrganization, makeProject, makeUser } from './factories'

let orgId: string
let org: { id: string; slug: string }
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, principal: Principal = systemPrincipal('test')) =>
  withTenant({ orgId, principal }, fn)
const rows = (accountId: string) => inOrg((tx) => notificationRows(tx, { accountId, limit: 50 }))

beforeAll(async () => {
  org = await makeOrganization()
  orgId = org.id
})

describe('notify', () => {
  test('creates one unread item per named account, with its project and ref', async () => {
    const [ana, ben] = [randomUUID(), randomUUID()]
    const project = await inOrg((tx) => makeProject(tx, { slug: `p-${randomUUID()}` }))
    const bundleId = randomUUID()
    await inOrg((tx) =>
      notify(tx, {
        accountIds: [ana, ben, ana],
        kind: 'needs_review',
        ref: { type: 'bundle', id: bundleId },
        projectId: project.id
      })
    )
    for (const accountId of [ana, ben]) {
      expect(await rows(accountId)).toEqual([
        expect.objectContaining({
          kind: 'needs_review',
          ref: { type: 'bundle', id: bundleId },
          project: { id: project.id, slug: project.slug, orgSlug: org.slug },
          recovered: false,
          readAt: null
        })
      ])
    }
  })

  test('skips only the accounts that turned the kind off', async () => {
    const [ana, ben] = [randomUUID(), randomUUID()]
    await inOrg((tx) => makeNotificationPreference(tx, { accountId: ana, kind: 'source_error', enabled: false }))
    await inOrg((tx) => makeNotificationPreference(tx, { accountId: ben, kind: 'needs_review', enabled: false }))
    const ref = { type: 'source', id: randomUUID() }
    await inOrg((tx) => notify(tx, { accountIds: [ana, ben], kind: 'source_error', ref }))
    expect(await rows(ana)).toEqual([])
    expect(await rows(ben)).toEqual([expect.objectContaining({ kind: 'source_error', ref, project: null })])
  })

  test('a repeat while the item is unread adds none; recovered: true adds a recovery item beside the open one', async () => {
    const ana = randomUUID()
    const finding = { accountIds: [ana], kind: 'auditor' as const, ref: { type: 'source', id: randomUUID() } }
    await inOrg((tx) => notify(tx, finding))
    await inOrg((tx) => notify(tx, finding))
    await inOrg((tx) => notify(tx, { ...finding, recovered: true }))
    await inOrg((tx) => notify(tx, { ...finding, recovered: true }))
    expect((await rows(ana)).map((row) => row.recovered).sort()).toEqual([false, true])
  })

  test('recovered: true without an open item still adds the recovery item', async () => {
    const ana = randomUUID()
    await inOrg((tx) =>
      notify(tx, { accountIds: [ana], kind: 'auditor', ref: { type: 'source', id: randomUUID() }, recovered: true })
    )
    expect(await rows(ana)).toEqual([expect.objectContaining({ kind: 'auditor', recovered: true })])
  })

  test('a condition that reopens after its item was read notifies again', async () => {
    const ana = randomUUID()
    const finding = { accountIds: [ana], kind: 'auditor' as const, ref: { type: 'source', id: randomUUID() } }
    await inOrg((tx) => notify(tx, finding))
    const [first] = await rows(ana)
    await inOrg((tx) => markNotificationRead(tx, { accountId: ana, id: first!.id, now: new Date() }))
    await inOrg((tx) => notify(tx, finding))
    const after = await rows(ana)
    expect(after).toHaveLength(2)
    expect(after.filter((row) => row.readAt === null)).toHaveLength(1)
  })

  test('concurrent duplicates make one item', async () => {
    const ana = randomUUID()
    const once = { accountIds: [ana], kind: 'needs_review' as const, ref: { type: 'bundle', id: randomUUID() } }
    await Promise.all(Array.from({ length: 5 }, () => inOrg((tx) => notify(tx, once))))
    expect(await rows(ana)).toHaveLength(1)
  })

  test('needs a withTenant transaction', async () => {
    await expect(
      withSystem('test', (tx) =>
        notify(tx, { accountIds: [randomUUID()], kind: 'auditor', ref: { type: 'x', id: 'y' } })
      )
    ).rejects.toThrow(/withTenant/)
  })
})

describe('preferences', () => {
  test('every kind defaults to on; a write changes only the given kinds of that account, the last duplicate winning', async () => {
    const [ana, ben] = [randomUUID(), randomUUID()]
    await inOrg((tx) => makeNotificationPreference(tx, { accountId: ben, kind: 'source_error', enabled: false }))
    expect(await inOrg((tx) => notificationPreferences(tx, ana))).toEqual([
      { kind: 'needs_review', enabled: true },
      { kind: 'escalated', enabled: true },
      { kind: 'source_error', enabled: true },
      { kind: 'review_item', enabled: true },
      { kind: 'auditor', enabled: true }
    ])
    await inOrg((tx) =>
      setNotificationPreferences(tx, ana, [
        { kind: 'source_error', enabled: true },
        { kind: 'source_error', enabled: false },
        { kind: 'auditor', enabled: false }
      ])
    )
    await inOrg((tx) => setNotificationPreferences(tx, ana, [{ kind: 'auditor', enabled: true }]))
    const off = async (accountId: string) =>
      (await inOrg((tx) => notificationPreferences(tx, accountId))).filter((p) => !p.enabled).map((p) => p.kind)
    expect(await off(ana)).toEqual(['source_error'])
    expect(await off(ben)).toEqual(['source_error'])
  })
})

describe('members', () => {
  test("orgMembers lists the organisation's members with §1 roles; accountOrganisations lists an account's organisations", async () => {
    const other = await makeOrganization()
    const ana = await makeUser()
    await makeMember({ organizationId: orgId, userId: ana.id, role: 'approver' })
    await makeMember({ organizationId: other.id, userId: ana.id, role: 'viewer' })
    const ben = await makeMember({ organizationId: orgId, role: 'member' }) // Better Auth's default: no §1 role
    const members = await inOrg((tx) => orgMembers(tx))
    expect(members).toContainEqual({ accountId: ana.id, role: 'approver' })
    expect(members.map((m) => m.accountId)).not.toContain(ben.userId)
    expect(await withSystem('test', (tx) => accountOrganisations(tx, ana.id))).toEqual(
      expect.arrayContaining([
        { orgId, role: 'approver' },
        { orgId: other.id, role: 'viewer' }
      ])
    )
    expect(await withSystem('test', (tx) => accountOrganisations(tx, ben.userId))).toEqual([])
  })
})
