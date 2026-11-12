// @vitest-environment node
import '@skyclause/auth/test/harness/database'
import { randomUUID } from 'node:crypto'
import { can } from '@skyclause/auth/can'
import type { Principal } from '@skyclause/contracts'
import { budgetGate, domainEvent, ledgerEntry, window, windowSeries, withTenant, type Tx } from '@skyclause/db'
import { makeOrganization, makeProject, makeWindow } from '@skyclause/db/test/factories/index'
import { beforeAll, expect, test } from 'vitest'
import {
  cancelWindow,
  createWindow,
  createWindowSeries,
  updateWindow,
  type WindowBody
} from '../../../../packages/api/src/services/windows'

const now = new Date('2026-11-08T02:00:00Z')
const access = { can, now } // Production budgetGate default; no injected policy or budget success.
const missing = '01900000-0000-7000-8000-000000000000'
const body: WindowBody = {
  title: 'Member declaration',
  kind: 'class',
  starts_at: '2026-11-16T01:00:00Z',
  ends_at: '2026-11-16T02:00:00Z',
  tz: 'Asia/Kuala_Lumpur'
}
const recurrence: NonNullable<WindowBody['recurrence']> = {
  frequency: 'weekly',
  days_of_week: ['monday'],
  count: 2,
  skip_dates: []
}
let orgId: string
let projectId: string
let windowId: string
let foreignId: string
function session(role: 'editor' | 'viewer' | 'guest'): Extract<Principal, { kind: 'session' }> {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: randomUUID(),
    sessionId: randomUUID(),
    isGuest: false,
    staff: false,
    orgId,
    role,
    authenticatedAt: now
  }
}
const inOrg = <T>(principal: Principal, fn: (ctx: { tx: Tx; principal: Principal }) => Promise<T>) =>
  withTenant({ orgId, principal }, (tx) => fn({ tx, principal }))
beforeAll(async () => {
  orgId = (await makeOrganization()).id
  const member = session('editor')
  projectId = await inOrg(member, async ({ tx }) => (await makeProject(tx)).id)
  windowId = await inOrg(
    member,
    async (ctx) => (await createWindowSeries(ctx, { projectId, body: { ...body, recurrence } }, access)).id
  )
  const otherOrg = await makeOrganization()
  const otherMember = { ...session('editor'), orgId: otherOrg.id }
  foreignId = await withTenant({ orgId: otherOrg.id, principal: otherMember }, async (tx) => (await makeWindow(tx)).id)
})

function excluded(shape: 'guest-session' | 'guest-key' | 'guest-oauth' | 'unlinked-null-oauth'): Principal {
  if (shape === 'guest-session') return session('guest')
  if (shape === 'guest-key')
    return {
      kind: 'api_key',
      client: 'api',
      clientName: null,
      orgId,
      role: 'guest',
      accountId: randomUUID(),
      keyId: randomUUID(),
      scopes: ['draft']
    }
  return {
    kind: 'oauth',
    client: 'mcp',
    clientName: null,
    orgId,
    role: shape === 'guest-oauth' ? 'guest' : null,
    accountId: randomUUID(),
    grantId: randomUUID(),
    clientId: randomUUID(),
    resource: 'mcp',
    projectIds: 'all',
    scopes: ['draft'],
    shareLinkId: null
  }
}

const shapes = ['guest-session', 'guest-key', 'guest-oauth', 'unlinked-null-oauth'] as const
const operations = [
  'single-create',
  'recurring-create',
  'direct-series-create',
  'occurrence-edit',
  'series-edit',
  'occurrence-cancel',
  'series-cancel'
] as const
test.each(shapes.flatMap((shape) => operations.map((operation) => ({ shape, operation }))))(
  'canonical member boundary denies $shape for $operation before target discovery',
  async ({ shape, operation }) => {
    const principal = excluded(shape)
    // These real lower layers allow the shape; member admission is the lifecycle service's own boundary.
    expect(can(principal, 'window.declare')).toBe(true)
    await inOrg(principal, async ({ tx }) =>
      expect(await budgetGate.consume(tx, principal, 'window')).toEqual({ ok: true })
    )
    const target = operation.includes('create')
      ? projectId
      : await inOrg(
          session('editor'),
          async (ctx) => (await createWindowSeries(ctx, { projectId, body: { ...body, recurrence } }, access)).id
        )
    const snapshot = () =>
      inOrg(session('editor'), async ({ tx }) => ({
        windows: await tx.select().from(window).orderBy(window.id),
        series: await tx.select().from(windowSeries).orderBy(windowSeries.id),
        events: await tx.select().from(domainEvent).orderBy(domainEvent.seq),
        ledger: await tx.select().from(ledgerEntry).orderBy(ledgerEntry.seq)
      }))
    const before = await snapshot()
    for (const id of [target, missing]) {
      const attempt = () =>
        inOrg(principal, (ctx) => {
          switch (operation) {
            case 'single-create':
              return createWindow(ctx, { projectId: id, body }, access)
            case 'recurring-create':
              return createWindow(ctx, { projectId: id, body: { ...body, recurrence } }, access)
            case 'direct-series-create':
              return createWindowSeries(ctx, { projectId: id, body: { ...body, recurrence } }, access)
            case 'occurrence-edit':
              return updateWindow(ctx, { id, scope: 'occurrence', patch: { title: 'Not a member annotation' } }, access)
            case 'series-edit':
              return updateWindow(ctx, { id, scope: 'series', patch: { title: 'Not a member annotation' } }, access)
            case 'occurrence-cancel':
              return cancelWindow(ctx, { id, scope: 'occurrence' }, access)
            case 'series-cancel':
              return cancelWindow(ctx, { id, scope: 'series' }, access)
          }
        })
      // Rejection returns no WindowView containing member title/declarer fields.
      await expect(attempt()).rejects.toMatchObject({ status: 403 })
    }
    expect(await snapshot()).toEqual(before)
  }
)

test('canonical member controls preserve Viewer/unscoped 403 and authorized foreign 404', async () => {
  const viewer = session('viewer')
  const readKey: Principal = {
    kind: 'api_key',
    client: 'api',
    clientName: null,
    orgId,
    role: 'editor',
    accountId: randomUUID(),
    keyId: randomUUID(),
    scopes: ['read']
  }
  for (const principal of [viewer, readKey])
    for (const id of [windowId, missing, foreignId]) {
      await expect(
        inOrg(principal, (ctx) => updateWindow(ctx, { id, scope: 'occurrence', patch: { title: 'Denied' } }, access))
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        inOrg(principal, (ctx) => cancelWindow(ctx, { id, scope: 'occurrence' }, access))
      ).rejects.toMatchObject({ status: 403 })
    }
  const member = session('editor')
  for (const id of [missing, foreignId]) {
    await expect(
      inOrg(member, (ctx) => updateWindow(ctx, { id, scope: 'occurrence', patch: { title: 'Foreign' } }, access))
    ).rejects.toMatchObject({ status: 404 })
    await expect(inOrg(member, (ctx) => cancelWindow(ctx, { id, scope: 'occurrence' }, access))).rejects.toMatchObject({
      status: 404
    })
  }
  expect(
    await inOrg(member, (ctx) =>
      updateWindow(ctx, { id: windowId, scope: 'occurrence', patch: { title: 'Member annotation' } }, access)
    )
  ).toMatchObject({ id: windowId, title: 'Member annotation' })
})
