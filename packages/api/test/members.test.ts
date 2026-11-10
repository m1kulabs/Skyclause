import { randomUUID } from 'node:crypto'
import { analyticsEvent, findMembership, member, recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import { invitation, rotaShift } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { makeMember, makeOrganization, makeProject, makeUser } from '@skyclause/db/test/factories/index'
import { expectOneAudit, memberOf } from '@skyclause/db/test/harness/index'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Principal } from '@skyclause/contracts'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  apiRequest,
  asSession,
  createMailbox,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg,
  TEST_NOW
} from './harness'

const RUN_ID = randomUUID().slice(0, 8)
const ORG = `members-home-${RUN_ID}`
const OTHER = `members-other-${RUN_ID}`
const mail = createMailbox()
const deps = testDeps({
  withTenant,
  recordAudit,
  email: mail,
  membership: {
    lookup: (ref, accountId) => withSystem('test membership', (tx) => findMembership(tx, ref, accountId))
  }
})
const { api } = createTestApi({ deps })
let orgId: string
let otherId: string

beforeAll(async () => {
  orgId = testOrg(ORG).id
  otherId = testOrg(OTHER).id
  await makeOrganization({ id: orgId, slug: ORG })
  await makeOrganization({ id: otherId, slug: OTHER })
})

async function actor(role: 'owner' | 'admin' | 'approver' | 'editor' | 'viewer', org = ORG) {
  const session = asSession({ org, role }) as Extract<Principal, { kind: 'session' }>
  session.accountId = await uuidV7()
  const user = await makeUser({
    id: session.accountId,
    email: `${session.accountId}@example.test`,
    emailVerified: true
  })
  const membership = await makeMember({
    organizationId: org === ORG ? orgId : otherId,
    userId: user.id,
    role
  })
  return { session, user, membership }
}

async function accountSession(email?: string, org = ORG) {
  const session = asSession({ org, role: 'viewer' }) as Extract<Principal, { kind: 'session' }>
  session.accountId = await uuidV7()
  const user = await makeUser({
    id: session.accountId,
    email: email ?? `${session.accountId}@example.test`,
    emailVerified: true
  })
  return { session, user }
}

function request(
  as: Parameters<typeof apiRequest>[1]['as'] | null,
  method: string,
  path: string,
  options: { org?: string; body?: unknown; query?: Record<string, string>; idempotencyKey?: string; ip?: string } = {}
) {
  return apiRequest(api, {
    as: as ?? undefined,
    method,
    path,
    org: options.org ?? ORG,
    body: options.body,
    query: options.query,
    idempotencyKey: options.idempotencyKey,
    headers: { 'X-Forwarded-For': options.ip ?? `192.0.2.${Math.floor(Math.random() * 200) + 1}` }
  })
}

function tokenFrom(message: string) {
  const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(message)?.[1]
  expect(token, 'invitation message includes the one-time URL token').toBeTruthy()
  return token!
}

const recordOneAudit = (action: string, targetId: string) =>
  expectOneAudit(action as Parameters<typeof expectOneAudit>[0], { orgId, targetId })

async function uuidV7() {
  const result = await withSystem('test UUIDv7', (tx) => tx.execute<{ id: string }>(sql`SELECT uuidv7() AS id`))
  return result.rows[0]!.id
}

describe('members and ownership', () => {
  test('keeps the last Owner, then transfers ownership only after the target accepts', async () => {
    const owner = await actor('owner')
    const target = await actor('approver')
    await withTenant({ orgId, principal: owner.session }, async (tx) => {
      await tx.insert(rotaShift).values({
        orgId,
        accountId: owner.session.accountId,
        projectId: null,
        days: [1],
        localStart: '14:00',
        localEnd: '19:15',
        condition: null,
        order: 1,
        template: 'storm_afternoon'
      })
    })

    const lower = await request(owner.session, 'PATCH', `/api/orgs/${ORG}/members/${owner.membership.id}`, {
      body: { role: 'admin' }
    })
    expect(lower.status).toBe(409)
    expect(await lower.json()).toMatchObject({ type: expect.stringContaining('/last-owner') })

    const removeLast = await request(owner.session, 'DELETE', `/api/orgs/${ORG}/members/${owner.membership.id}`)
    expect(removeLast.status).toBe(409)
    expect(await removeLast.json()).toMatchObject({ type: expect.stringContaining('/last-owner') })

    const started = await request(owner.session, 'POST', `/api/orgs/${ORG}/ownership-transfers`, {
      body: { to_member_id: target.membership.id },
      idempotencyKey: randomUUID()
    })
    expect(started.status).toBe(201)
    const transfer = (await started.json()) as { id: string; status: string; to_member_id: string }
    expect(transfer).toMatchObject({ status: 'pending', to_member_id: target.membership.id })
    const token = tokenFrom(mail.sent.at(-1)!.text)
    expect(mail.sent.at(-1)).toMatchObject({ to: target.user.email, from: 'system' })

    const accepted = await request(target.session, 'POST', `/api/ownership-transfers/${token}/accept`, {
      org: undefined
    })
    expect(accepted.status, await accepted.clone().text()).toBe(200)
    expect(await accepted.json()).toMatchObject({ status: 'accepted', to_member_id: target.membership.id })

    const oldOwner = await authDatabase()
      .select({ role: member.role })
      .from(member)
      .where(eq(member.id, owner.membership.id))
    const newOwner = await authDatabase()
      .select({ role: member.role })
      .from(member)
      .where(eq(member.id, target.membership.id))
    expect(oldOwner).toEqual([{ role: 'admin' }])
    expect(newOwner).toEqual([{ role: 'owner' }])

    const removedAfterTransfer = await request(
      target.session,
      'DELETE',
      `/api/orgs/${ORG}/members/${owner.membership.id}`
    )
    expect(removedAfterTransfer.status).toBe(204)
    const removedOwnerShifts = await withTenant({ orgId, principal: target.session }, (tx) =>
      tx.select().from(rotaShift).where(eq(rotaShift.accountId, owner.session.accountId))
    )
    expect(removedOwnerShifts).toHaveLength(0)
    const remainingOwners = await authDatabase()
      .select()
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.role, 'owner')))
    expect(remainingOwners).toHaveLength(1)
    await recordOneAudit('ownership_transfer.created', transfer.id)
    await recordOneAudit('ownership_transfer.accepted', transfer.id)
    await recordOneAudit('member.removed', owner.membership.id)
  })

  test('an Owner can cancel one pending ownership transfer', async () => {
    const owner = await actor('owner')
    const target = await actor('approver')
    const started = await request(owner.session, 'POST', `/api/orgs/${ORG}/ownership-transfers`, {
      body: { to_member_id: target.membership.id },
      idempotencyKey: randomUUID()
    })
    const transferId = ((await started.json()) as { id: string }).id
    const cancelled = await request(owner.session, 'DELETE', `/api/orgs/${ORG}/ownership-transfers/${transferId}`)
    expect(cancelled.status, await cancelled.clone().text()).toBe(204)
    const state = await request(null, 'GET', `/api/invite/${tokenFrom(mail.sent.at(-1)!.text)}`, { org: undefined })
    expect(await state.json()).toMatchObject({ kind: 'ownership_transfer', state: 'withdrawn' })
    await recordOneAudit('ownership_transfer.cancelled', transferId)
  })

  test('role changes and Malay-reader changes are audited once each', async () => {
    const admin = await actor('admin')
    const target = await actor('viewer')
    const response = await request(admin.session, 'PATCH', `/api/orgs/${ORG}/members/${target.membership.id}`, {
      body: { role: 'editor', reads_malay: true }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ role: 'editor', reads_malay: true })
    await recordOneAudit('member.role_changed', target.membership.id)
    await recordOneAudit('member.reads_malay_changed', target.membership.id)
  })
})

describe('invitation lifecycle', () => {
  test('hashes tokens, sends system mail, and reports valid, used, expired and withdrawn states', async () => {
    const admin = await actor('admin')
    const invite = async (email: string) => {
      const response = await request(admin.session, 'POST', `/api/orgs/${ORG}/invitations`, {
        body: { email, role: 'viewer' },
        idempotencyKey: randomUUID()
      })
      expect(response.status).toBe(201)
      return (await response.json()) as { id: string; email: string; role: string; expires_at: string }
    }

    const first = await invite('valid@example.test')
    const firstMail = mail.sent.at(-1)!
    const usedToken = tokenFrom(firstMail.text)
    expect(firstMail).toMatchObject({ to: 'valid@example.test', from: 'system' })
    await recordOneAudit('invite.created', first.id)
    const hashRow = await authDatabase()
      .select({ tokenHash: invitation.tokenHash, email: invitation.email })
      .from(invitation)
      .where(eq(invitation.id, first.id))
    expect(hashRow[0]?.tokenHash).not.toBe(usedToken)
    expect(hashRow[0]?.tokenHash).toBeTruthy()
    expect(JSON.stringify(first)).not.toContain(usedToken)
    const valid = await request(null, 'GET', `/api/invite/${usedToken}`, { org: undefined })
    expect(await valid.json()).toEqual({ kind: 'invitation', state: 'valid' })

    const mismatch = await accountSession('other@example.test')
    const mismatched = await request(mismatch.session, 'POST', `/api/invite/${usedToken}`, { org: undefined })
    expect(mismatched.status).toBe(403)
    const used = await accountSession('valid@example.test')
    const accepted = await request(used.session, 'POST', `/api/invite/${usedToken}`, { org: undefined })
    expect(accepted.status).toBe(201)
    await recordOneAudit('invite.accepted', first.id)
    const secondAccept = await request(used.session, 'POST', `/api/invite/${usedToken}`, { org: undefined })
    expect(secondAccept.status).toBe(409)
    const usedState = await request(null, 'GET', `/api/invite/${usedToken}`, { org: undefined })
    expect(await usedState.json()).toEqual({ kind: 'invitation', state: 'used' })

    const revoked = await invite('revoked@example.test')
    const revokedToken = tokenFrom(mail.sent.at(-1)!.text)
    const revoke = await request(admin.session, 'DELETE', `/api/orgs/${ORG}/invitations/${revoked.id}`)
    expect(revoke.status).toBe(204)
    await recordOneAudit('invite.created', revoked.id)
    const revokedState = await request(null, 'GET', `/api/invite/${revokedToken}`, { org: undefined })
    expect(await revokedState.json()).toEqual({ kind: 'invitation', state: 'withdrawn' })
    const revokedAccept = await request(
      (await accountSession('revoked@example.test')).session,
      'POST',
      `/api/invite/${revokedToken}`,
      { org: undefined }
    )
    expect(revokedAccept.status).toBe(410)
    expect(await revokedAccept.json()).toMatchObject({ type: expect.stringContaining('/invite-withdrawn') })
    await recordOneAudit('invite.revoked', revoked.id)

    const resent = await invite('resend@example.test')
    const oldToken = tokenFrom(mail.sent.at(-1)!.text)
    const resentResponse = await request(admin.session, 'POST', `/api/orgs/${ORG}/invitations/${resent.id}/resend`)
    expect(resentResponse.status).toBe(200)
    const replacement = (await resentResponse.json()) as { id: string }
    const newToken = tokenFrom(mail.sent.at(-1)!.text)
    expect(newToken).not.toBe(oldToken)
    const oldState = await request(null, 'GET', `/api/invite/${oldToken}`, { org: undefined })
    const newState = await request(null, 'GET', `/api/invite/${newToken}`, { org: undefined })
    expect(await oldState.json()).toEqual({ kind: 'invitation', state: 'withdrawn' })
    expect(await newState.json()).toEqual({ kind: 'invitation', state: 'valid' })
    await recordOneAudit('invite.revoked', resent.id)
    await recordOneAudit('invite.created', replacement.id)

    const expired = await invite('expired@example.test')
    const expiredToken = tokenFrom(mail.sent.at(-1)!.text)
    deps.clock.advance(7 * 24 * 60 * 60 * 1000 + 1000)
    const expiredState = await request(null, 'GET', `/api/invite/${expiredToken}`, { org: undefined })
    expect(await expiredState.json()).toEqual({ kind: 'invitation', state: 'expired' })
    const expiredAccept = await request(
      (await accountSession('expired@example.test')).session,
      'POST',
      `/api/invite/${expiredToken}`,
      { org: undefined }
    )
    expect(expiredAccept.status).toBe(410)
    expect(await expiredAccept.json()).toMatchObject({ type: expect.stringContaining('/link-expired') })

    const expiredRow = await authDatabase()
      .select({ expiresAt: invitation.expiresAt })
      .from(invitation)
      .where(eq(invitation.id, expired.id))
    expect(expiredRow[0]!.expiresAt.getTime()).toBe(new Date(TEST_NOW).getTime() + 7 * 24 * 60 * 60 * 1000)
  })

  test('limits unauthenticated token lookups to 30 per IP per hour', async () => {
    const owner = await actor('owner')
    const response = await request(owner.session, 'POST', `/api/orgs/${ORG}/invitations`, {
      body: { email: 'limited@example.test', role: 'viewer' },
      idempotencyKey: randomUUID()
    })
    const token = tokenFrom(mail.sent.at(-1)!.text)
    expect(response.status).toBe(201)
    const ip = '198.51.100.240'
    let last: Response | undefined
    for (let i = 0; i < 31; i++) last = await request(null, 'GET', `/api/invite/${token}`, { org: undefined, ip })
    expect(last!.status).toBe(429)
    expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThan(0)
  })
})

describe('rota', () => {
  test('returns the two constants and seven days of unstaffed slots, and Approvers can replace only their own shifts', async () => {
    const admin = await actor('admin')
    const approver = await actor('approver')
    const other = await actor('viewer')
    const fresh = await request(admin.session, 'GET', `/api/orgs/${ORG}/rota`)
    expect(fresh.status).toBe(200)
    const empty = (await fresh.json()) as {
      time_zone: string
      templates: Array<{ template: string; local_start: string; local_end: string; condition: string | null }>
      shifts: unknown[]
      unstaffed_slots: Array<{ date: string; template: string; condition_state: string }>
    }
    expect(empty.time_zone).toBe('Asia/Kuala_Lumpur')
    expect(empty.templates).toEqual([
      { template: 'storm_afternoon', local_start: '14:00', local_end: '19:15', condition: 'storm_afternoon' },
      { template: 'surge_night', local_start: '08:00', local_end: '22:00', condition: 'surge_night' }
    ])
    expect(empty.shifts).toEqual([])
    expect(new Set(empty.unstaffed_slots.map((slot) => slot.date)).size).toBe(7)
    expect(empty.unstaffed_slots).toHaveLength(14)
    expect(empty.unstaffed_slots.every((slot) => slot.condition_state === 'unknown')).toBe(true)

    const saveBody = {
      project_id: null,
      templates: empty.templates,
      shifts: [
        {
          account_id: approver.session.accountId,
          days: [1, 2, 3, 4, 5, 6, 7],
          local_start: '14:00',
          local_end: '19:15',
          condition: 'storm_afternoon',
          order: 1,
          template: 'storm_afternoon'
        }
      ]
    }
    const saved = await request(approver.session, 'PUT', `/api/orgs/${ORG}/rota/shifts`, {
      body: saveBody,
      idempotencyKey: randomUUID()
    })
    expect(saved.status, await saved.clone().text()).toBe(200)
    const updated = (await saved.json()) as { shifts: Array<{ account_id: string }>; unstaffed_slots: unknown[] }
    expect(updated.shifts).toHaveLength(1)
    expect(updated.shifts[0]!.account_id).toBe(approver.session.accountId)
    const trackRows = await withSystem('test', (tx) =>
      tx
        .select({ props: analyticsEvent.props })
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.orgId, orgId), eq(analyticsEvent.name, 'rota_set')))
    )
    expect(trackRows).toContainEqual({ props: { shifts: 1, conditional: true } })

    const rejected = await request(approver.session, 'PUT', `/api/orgs/${ORG}/rota/shifts`, {
      body: { ...saveBody, shifts: [{ ...saveBody.shifts[0], account_id: other.session.accountId }] },
      idempotencyKey: randomUUID()
    })
    expect(rejected.status).toBe(403)
    const afterReject = await withSystem('test', (tx) =>
      tx
        .select({ props: analyticsEvent.props })
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.orgId, orgId), eq(analyticsEvent.name, 'rota_set')))
    )
    expect(afterReject).toHaveLength(1)
    expect(trackRows).toHaveLength(1)
  })

  test('Approvers preserve colleagues when replacing or clearing their own shifts', async () => {
    const approver = await actor('approver')
    const colleague = await actor('approver')
    const { ROTA_TEMPLATES } = await import('../src/services/rota')
    const project = await withTenant({ orgId, principal: approver.session }, (tx) =>
      makeProject(tx, { name: 'Approver replacement' })
    )
    const shift = {
      days: [1],
      local_start: '14:00',
      local_end: '19:15',
      condition: null,
      order: 1,
      template: 'storm_afternoon'
    }
    const [original] = await withTenant({ orgId, principal: approver.session }, (tx) =>
      tx
        .insert(rotaShift)
        .values({
          orgId,
          projectId: project.id,
          accountId: colleague.session.accountId,
          days: shift.days,
          localStart: shift.local_start,
          localEnd: shift.local_end,
          condition: shift.condition,
          order: shift.order,
          template: 'storm_afternoon'
        })
        .returning()
    )
    for (const shifts of [[{ ...shift, account_id: approver.session.accountId }], []]) {
      const response = await request(approver.session, 'PUT', `/api/orgs/${ORG}/rota/shifts`, {
        body: { project_id: project.id, templates: ROTA_TEMPLATES, shifts },
        idempotencyKey: randomUUID()
      })
      expect(response.status, await response.clone().text()).toBe(200)
      const body = (await response.json()) as { shifts: Array<{ id: string; account_id: string }> }
      expect(body.shifts).toHaveLength(shifts.length + 1)
      expect(body.shifts).toContainEqual(
        expect.objectContaining({ id: original!.id, account_id: colleague.session.accountId })
      )
    }
  })

  test('reports inactive condition days in unstaffed slots', async () => {
    const admin = await actor('admin')
    const project = await withTenant({ orgId, principal: admin.session }, (tx) =>
      makeProject(tx, { name: 'Inactive rota conditions' })
    )
    const { createRotaService } = await import('../src/services/rota')
    const service = createRotaService({
      async isActive() {
        return false
      }
    })
    const rota = await withTenant({ orgId, principal: admin.session }, (tx) =>
      service.getRota({ tx, principal: admin.session }, { projectId: project.id, at: TEST_NOW })
    )
    expect(rota.unstaffed_slots).toHaveLength(14)
    expect(new Set(rota.unstaffed_slots.map((slot) => slot.date)).size).toBe(7)
    expect(rota.unstaffed_slots.every((slot) => slot.condition_state === 'inactive')).toBe(true)
  })

  test('onDuty and nextApprovers honour conditions, overrides, current roles and the half-open 19:15 MYT edge', async () => {
    const admin = await actor('admin')
    const a = await actor('approver')
    const b = await actor('approver')
    const c = await actor('approver')
    const firstProject = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      makeProject(tx, { name: 'Override project', timeZone: 'Asia/Kuala_Lumpur' })
    )
    const secondProject = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      makeProject(tx, { name: 'Organisation project', timeZone: 'Asia/Kuala_Lumpur' })
    )
    await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
      const day = [1]
      await tx.insert(rotaShift).values([
        {
          orgId,
          accountId: a.session.accountId,
          days: day,
          localStart: '14:00',
          localEnd: '19:15',
          condition: 'storm_afternoon',
          order: 1,
          template: 'storm_afternoon'
        },
        {
          orgId,
          accountId: b.session.accountId,
          days: day,
          localStart: '08:00',
          localEnd: '22:00',
          condition: 'surge_night',
          order: 1,
          template: 'surge_night'
        },
        {
          orgId,
          accountId: c.session.accountId,
          projectId: firstProject.id,
          days: day,
          localStart: '14:00',
          localEnd: '19:15',
          condition: 'storm_afternoon',
          order: 1,
          template: 'storm_afternoon'
        },
        {
          orgId,
          accountId: a.session.accountId,
          projectId: firstProject.id,
          days: day,
          localStart: '20:00',
          localEnd: '21:00',
          condition: 'storm_afternoon',
          order: 2,
          template: 'storm_afternoon'
        }
      ])
    })

    const states = new Map<string, boolean | 'unknown'>([
      [`${firstProject.id}:storm_afternoon`, true],
      [`${firstProject.id}:surge_night`, 'unknown'],
      [`${secondProject.id}:storm_afternoon`, true],
      [`${secondProject.id}:surge_night`, true]
    ])
    const serviceModule = await import('../src/services/rota')
    const service = serviceModule.createRotaService({
      async isActive(_tx: Tx, q: { projectId: string; condition: 'storm_afternoon' | 'surge_night' }) {
        return states.get(`${q.projectId}:${q.condition}`) ?? 'unknown'
      }
    })
    const at = new Date('2026-11-09T11:14:59.999Z')
    const live = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => ({
      onDuty: await service.onDuty(tx, { projectId: firstProject.id, at }),
      next: await service.nextApprovers(tx, { projectId: firstProject.id, bundleId: randomUUID(), at })
    }))
    expect(live.onDuty.map((row) => row.accountId).sort()).toEqual([b.session.accountId, c.session.accountId].sort())
    expect(live.next).toEqual([a.session.accountId])

    states.set(`${firstProject.id}:storm_afternoon`, false)
    const inactive = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      service.onDuty(tx, { projectId: firstProject.id, at })
    )
    expect(inactive.map((row) => row.accountId)).toEqual([b.session.accountId])

    states.set(`${firstProject.id}:storm_afternoon`, 'unknown')
    const unknown = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      service.onDuty(tx, { projectId: firstProject.id, at })
    )
    expect(unknown.map((row) => row.accountId).sort()).toContain(c.session.accountId)

    await authDatabase().update(member).set({ role: 'viewer' }).where(eq(member.id, b.membership.id))
    const lowered = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      service.onDuty(tx, { projectId: firstProject.id, at })
    )
    expect(lowered.map((row) => row.accountId)).not.toContain(b.session.accountId)

    const boundary = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      service.onDuty(tx, { projectId: firstProject.id, at: new Date('2026-11-09T11:15:00Z') })
    )
    expect(boundary.map((row) => row.accountId)).not.toContain(c.session.accountId)

    const fallback = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
      service.onDuty(tx, { projectId: secondProject.id, at })
    )
    expect(fallback.map((row) => row.accountId)).toContain(a.session.accountId)

    await authDatabase().update(member).set({ role: 'viewer' }).where(eq(member.id, a.membership.id))
    await authDatabase().update(member).set({ role: 'viewer' }).where(eq(member.id, c.membership.id))
    const admins = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      service.nextApprovers(tx, { projectId: firstProject.id, bundleId: randomUUID(), at })
    )
    const adminFallback = await withSystem('test D22 fallback', (tx) =>
      tx
        .select({ accountId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, orgId), inArray(member.role, ['owner', 'admin'])))
    )
    expect(admins).toEqual(adminFallback.map((row) => row.accountId).sort())
    expect(admins).toContain(admin.session.accountId)
  })
})

describe('member route permissions and tenancy', () => {
  test.each(['viewer', 'editor', 'approver'] as const)('%s cannot manage members', async (role) => {
    const person = await actor(role)
    const response = await request(person.session, 'GET', `/api/orgs/${ORG}/members`)
    expect(response.status).toBe(403)
  })

  test('an Admin cannot grant Owner directly', async () => {
    const admin = await actor('admin')
    const target = await actor('viewer')
    const response = await request(admin.session, 'PATCH', `/api/orgs/${ORG}/members/${target.membership.id}`, {
      body: { role: 'owner' }
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ type: expect.stringContaining('/role-not-grantable') })
  })

  test('organisation-scoped member, invitation, transfer and rota operations hide foreign rows', async () => {
    const outside = await actor('owner', OTHER)
    const inside = await actor('owner', ORG)
    const invite = await request(inside.session, 'POST', `/api/orgs/${ORG}/invitations`, {
      body: { email: 'cross-org@example.test', role: 'viewer' },
      idempotencyKey: randomUUID()
    })
    const invitationId = ((await invite.json()) as { id: string }).id
    const transferTarget = await actor('approver', ORG)
    const transfer = await request(inside.session, 'POST', `/api/orgs/${ORG}/ownership-transfers`, {
      body: { to_member_id: transferTarget.membership.id },
      idempotencyKey: randomUUID()
    })
    const transferId = ((await transfer.json()) as { id: string }).id
    const projectId = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => (await makeProject(tx)).id)
    const savedShift = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
      const [row] = await tx
        .insert(rotaShift)
        .values({
          orgId,
          accountId: inside.session.accountId,
          projectId: null,
          days: [1],
          localStart: '14:00',
          localEnd: '19:15',
          condition: null,
          order: 1,
          template: 'storm_afternoon'
        })
        .returning()
      return row!
    })
    const cases: Array<{ operationId: string; params: Record<string, string>; body?: unknown }> = [
      { operationId: 'listMembers', params: { org: OTHER } },
      { operationId: 'updateMember', params: { org: OTHER, id: inside.membership.id }, body: { role: 'editor' } },
      { operationId: 'removeMember', params: { org: OTHER, id: inside.membership.id } },
      { operationId: 'listInvitations', params: { org: OTHER } },
      {
        operationId: 'createInvitation',
        params: { org: OTHER },
        body: { email: 'nobody@example.test', role: 'viewer' }
      },
      { operationId: 'revokeInvitation', params: { org: OTHER, id: invitationId } },
      { operationId: 'resendInvitation', params: { org: OTHER, id: invitationId } },
      {
        operationId: 'createOwnershipTransfer',
        params: { org: OTHER },
        body: { to_member_id: transferTarget.membership.id }
      },
      { operationId: 'cancelOwnershipTransfer', params: { org: OTHER, id: transferId } },
      { operationId: 'getRota', params: { org: OTHER } },
      { operationId: 'updateRota', params: { org: OTHER }, body: {} },
      {
        operationId: 'replaceRotaShifts',
        params: { org: OTHER },
        body: { project_id: null, templates: [], shifts: [] }
      },
      {
        operationId: 'createRotaShift',
        params: { org: OTHER },
        body: {
          org_id: otherId,
          account_id: outside.session.accountId,
          project_id: null,
          days: [1],
          local_start: '14:00',
          local_end: '19:15',
          condition: null,
          order: 1,
          template: 'storm_afternoon'
        }
      },
      { operationId: 'updateRotaShift', params: { org: OTHER, id: savedShift.id }, body: { local_start: '15:00' } },
      { operationId: 'deleteRotaShift', params: { org: OTHER, id: savedShift.id } }
    ]
    for (const entry of cases) {
      const { run } = crossOrgCase(entry.operationId, {
        app: api,
        as: inside.session,
        org: OTHER,
        params: entry.params,
        body: entry.body,
        idempotencyKey: randomUUID()
      })
      await run()
    }
    const foreignProject = await request(outside.session, 'GET', `/api/orgs/${OTHER}/rota`, {
      query: { project_id: projectId }
    })
    expect(foreignProject.status).toBe(404)
  })
})
