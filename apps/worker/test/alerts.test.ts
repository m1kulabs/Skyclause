// #155: approver alerts (CAL-18, CAL-10), SLA escalation (CAL-11), shift reminders (CAL-19), no-draft alerts (D24),
// the resend sweep and the auditor's no-approver check, through the worker part's handlers on the test database,
// with push, email, Cloud Tasks, rota and shift-condition doubles and an injected clock.
import type { EmailTransport, PushTransport, ShiftConditions } from '@skyclause/contracts'
import { emitEvent, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeMember,
  makeOrganization,
  makeProject,
  makePushSubscription,
  makeRotaShift,
  makeRun,
  makeShadowState,
  makeUser,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin, expectEvent, expectOneAudit } from '@skyclause/db/test/harness/index'
import { SesError } from '@skyclause/delivery'
import { afterAll, describe, expect, test } from 'vitest'
import { createAlertsPart, noApproverCheck, slaTimer, type AlertsDeps } from '../src/alerts'
import type { TimerTask } from '../src/bundles/cloud-tasks'
import { dispatchEvent } from '../src/events'
import { registry } from '../src/registry'

const at = (iso: string) => new Date(iso)
const NEEDS_REVIEW = at('2026-11-02T07:10:00Z') // 15:10 MYT
const SLA_DUE = at('2026-11-02T07:20:00Z') // a 10-minute Sky SLA

type Sent = { endpoint: string; payload: Parameters<PushTransport['send']>[1]; ttlS: number; at: Date }
type Mail = Parameters<EmailTransport['send']>[0]

/** Doubles for every seam; `clock` moves with real time from its start, so measured delays are real. */
function doubles(o: {
  clock: Date
  onDuty?: string[]
  next?: string[]
  status?: (endpoint: string) => number
  email?: (m: Mail) => Promise<{ providerMessageId: string }>
  conditions?: ShiftConditions['isActive']
}) {
  const started = Date.now()
  let base = o.clock.getTime()
  const pushes: Sent[] = []
  const mails: Mail[] = []
  const tasks: TimerTask[] = []
  const now = () => new Date(base + (Date.now() - started))
  const deps: AlertsDeps = {
    push: () => ({
      async send(s, payload, { ttlS }) {
        pushes.push({ endpoint: s.endpoint, payload, ttlS, at: now() })
        return { status: o.status?.(s.endpoint) ?? 201 }
      }
    }),
    email: () => ({
      async send(m) {
        if (o.email) return o.email(m)
        mails.push(m)
        return { providerMessageId: `ses-${mails.length}` }
      }
    }),
    schedule: async (task) => void tasks.push(task),
    onDuty: async () => o.onDuty ?? [],
    nextApprovers: async () => o.next ?? [],
    conditions: { isActive: o.conditions ?? (async () => 'unknown') },
    appOrigin: () => 'https://app.skyclause.m1ku.tech',
    now
  }
  return {
    deps,
    pushes,
    mails,
    tasks,
    setClock: (to: Date) => void (base = to.getTime() - (Date.now() - started))
  }
}

const orgs: string[] = []
async function org() {
  const made = await makeOrganization()
  orgs.push(made.id)
  return { id: made.id, slug: made.slug }
}
// The registry's own batch (server.test.ts) runs on this database with production's placeholder seams: leave it no
// shift to plan and no alert to resend.
afterAll(() =>
  asLogin('postgres', async (c) => {
    await c.query("UPDATE rota_shift SET days = '{}' WHERE org_id = ANY($1)", [orgs])
    await c.query("UPDATE notice SET status = 'expired' WHERE status = 'queued' AND org_id = ANY($1)", [orgs])
  })
)
const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const account = async (orgId: string, role = 'approver') =>
  (await makeMember({ organizationId: orgId, role, userId: (await makeUser()).id })).userId

/** A Commute disruption bundle in Needs review for a 15:15 MYT–15:30 MYT window, with its `bundle.needs_review`. */
async function reviewBundle(orgId: string, o: { state?: 'needs_review' | 'approved' } = {}) {
  return inOrg(orgId, async (tx) => {
    const project = await makeProject(tx, { name: 'Bukit Jalil' })
    const run = await makeRun(tx, { projectId: project.id })
    const b = await makeBundle(tx, {
      runId: run.id,
      state: o.state ?? 'needs_review',
      needsReviewAt: NEEDS_REVIEW,
      slaDueAt: SLA_DUE
    })
    const w = await makeWindow(tx, {
      projectId: project.id,
      startsAt: at('2026-11-02T07:15:00Z'),
      endsAt: at('2026-11-02T07:30:00Z')
    })
    const shadow = {
      clauses: [
        {
          key: 'storm_confirmed',
          result: 'fired',
          inputs: [{ name: 'site.rain_60m_mm', value: 39, unit: 'mm', ageS: 300 }]
        }
      ]
    }
    const c = await makeCall(tx, { bundleId: b.id, windowId: w.id, mode: 'commute_disruption', shadow })
    const event = await emitEvent(tx, {
      projectId: project.id,
      type: 'bundle.needs_review',
      data: { bundle_id: b.id, pack: 'sky', state: 'needs_review', call_ids: [c.id], sla_due_at: SLA_DUE.toISOString() }
    })
    return { projectId: project.id, projectSlug: project.slug, bundleId: b.id, eventId: event.id }
  })
}

const rows = <T>(sql: string, params: unknown[] = []) =>
  asLogin('postgres', async (client) => (await client.query(sql, params)).rows as T[])

describe('the alerts part', () => {
  test('is registered by c-approver-alerts with its consumers, queue and batch handlers', () => {
    expect(registry.queues['shift-reminders']).toBeTypeOf('function')
    expect(registry.batch['shift-reminder-plan']).toBeTypeOf('function')
    expect(registry.batch['approver-alert-resend']).toBeTypeOf('function')
    expect(registry.queues['bundle-timers']).toBeTypeOf('function')
    expect(registry.events.map((e) => e.consumer)).toEqual(
      expect.arrayContaining(['approver-alerts', 'approver-sla-timers', 'no-draft-alerts'])
    )
  })
})

describe('CAL-18 and CAL-10: Needs review alerts everyone on duty', () => {
  test('a push on each device and an email, within 30 s, once per account, channel and level', async () => {
    const o = await org()
    const [a, b] = [await account(o.id), await account(o.id)]
    const made = await reviewBundle(o.id)
    const devices = await inOrg(o.id, async (tx) => [
      await makePushSubscription(tx, { accountId: a }),
      await makePushSubscription(tx, { accountId: a })
    ])
    const d = doubles({ clock: at('2026-11-02T07:10:02Z'), onDuty: [a, b] })
    const part = createAlertsPart(d.deps)

    await dispatchEvent(part.events!, made.eventId)
    await dispatchEvent(part.events!, made.eventId)

    const url = `https://app.skyclause.m1ku.tech/${o.slug}/${made.projectSlug}/bundles/${made.bundleId}`
    expect(d.pushes.map((p) => p.endpoint).sort()).toEqual(devices.map((s) => s.endpoint).sort())
    for (const push of d.pushes) {
      expect(push.payload).toEqual({
        title: '1 call needs review · Bukit Jalil',
        body: 'Commute disruption for 15:15 MYT–15:30 MYT · 10 min of SLA left · site.rain_60m_mm 39 mm, 5 min old',
        url,
        tag: made.bundleId
      })
      expect(push.at.getTime() - NEEDS_REVIEW.getTime()).toBeLessThanOrEqual(30_000)
      expect(push.ttlS).toBeGreaterThan(590)
      expect(push.ttlS).toBeLessThanOrEqual(598)
    }
    expect(d.mails).toHaveLength(2)
    expect(d.mails[0]).toMatchObject({
      from: 'system',
      subject: '1 call needs review · Bukit Jalil',
      category: 'approver_alert'
    })
    expect(d.mails[0]!.text).toContain(url)

    const alerts = await rows<{ account_id: string; channel: string; level: string; accepted_at: Date }>(
      'SELECT account_id, channel, level, accepted_at FROM bundle_alert WHERE bundle_id = $1 ORDER BY account_id, channel::text',
      [made.bundleId]
    )
    expect(alerts.map((r) => [r.account_id, r.channel, r.level])).toEqual([
      [a, 'email', 'on_duty'],
      [a, 'web_push', 'on_duty'],
      [b, 'email', 'on_duty']
    ])
    for (const r of alerts) expect(r.accepted_at.getTime() - NEEDS_REVIEW.getTime()).toBeLessThanOrEqual(30_000)
    const notices = await rows<{ status: string; accepted_at: Date | null; provider_message_id: string | null }>(
      "SELECT status, accepted_at, provider_message_id FROM notice WHERE kind = 'approver_alert' AND project_id = $1",
      [made.projectId]
    )
    expect(notices.map((n) => n.status)).toEqual(['sent', 'sent', 'sent'])
    expect(notices.filter((n) => n.provider_message_id?.startsWith('ses-'))).toHaveLength(2)
    const tracked = await rows<{ props: { channel: string; seconds: number } }>(
      "SELECT props FROM analytics_event WHERE name = 'approver_alerted' AND project_id = $1",
      [made.projectId]
    )
    expect(tracked).toHaveLength(3)
    for (const { props } of tracked) expect(props.seconds).toBeLessThanOrEqual(30)
  })

  test('a 404 or 410 deletes that subscription; the other device and the email still go', async () => {
    const o = await org()
    const a = await account(o.id)
    const made = await reviewBundle(o.id)
    const [gone, kept] = await inOrg(o.id, async (tx) => [
      await makePushSubscription(tx, { accountId: a }),
      await makePushSubscription(tx, { accountId: a })
    ])
    const d = doubles({
      clock: at('2026-11-02T07:10:01Z'),
      onDuty: [a],
      status: (e) => (e === gone!.endpoint ? 410 : 201)
    })
    await dispatchEvent(createAlertsPart(d.deps).events!, made.eventId)
    const left = await rows<{ id: string; last_ok_at: Date | null }>(
      'SELECT id, last_ok_at FROM push_subscription WHERE account_id = $1',
      [a]
    )
    expect(left.map((s) => s.id)).toEqual([kept!.id])
    expect(left[0]!.last_ok_at).not.toBeNull()
    expect(d.mails).toHaveLength(1)
  })

  test('with every device gone the push notice fails and no web_push alert row is written', async () => {
    const o = await org()
    const a = await account(o.id)
    const made = await reviewBundle(o.id)
    await inOrg(o.id, (tx) => makePushSubscription(tx, { accountId: a }))
    const d = doubles({ clock: at('2026-11-02T07:10:01Z'), onDuty: [a], status: () => 404 })
    await dispatchEvent(createAlertsPart(d.deps).events!, made.eventId)
    expect(
      await rows("SELECT 1 FROM bundle_alert WHERE channel = 'web_push' AND bundle_id = $1", [made.bundleId])
    ).toEqual([])
    expect(
      (
        await rows<{ status: string }>("SELECT status FROM notice WHERE channel = 'push' AND project_id = $1", [
          made.projectId
        ])
      ).map((n) => n.status)
    ).toEqual(['failed'])
  })

  test('an SES rejection, such as the D48 sandbox refusing an unverified address, fails the email notice', async () => {
    const o = await org()
    const a = await account(o.id)
    const made = await reviewBundle(o.id)
    const rejected = new SesError(
      'SendEmail',
      Object.assign(new Error('Email address is not verified.'), {
        name: 'MessageRejected',
        $metadata: { httpStatusCode: 400 }
      })
    )
    const d = doubles({ clock: at('2026-11-02T07:10:01Z'), onDuty: [a], email: async () => Promise.reject(rejected) })
    await dispatchEvent(createAlertsPart(d.deps).events!, made.eventId)
    expect(
      (await rows<{ status: string }>('SELECT status FROM notice WHERE project_id = $1', [made.projectId])).map(
        (n) => n.status
      )
    ).toEqual(['failed'])
    expect(await rows('SELECT 1 FROM bundle_alert WHERE bundle_id = $1', [made.bundleId])).toEqual([])
  })
})

describe('CAL-11: unapproved at its SLA, the bundle escalates', () => {
  test('with a 10-minute SLA, the next approver is alerted at 10 minutes and Admins and Owners at 20', async () => {
    const o = await org()
    const onDuty = await account(o.id)
    const next = await account(o.id)
    const admin = await account(o.id, 'admin')
    const owner = await account(o.id, 'owner')
    const made = await reviewBundle(o.id)
    const d = doubles({ clock: at('2026-11-02T07:10:01Z'), onDuty: [onDuty], next: [next] })
    const part = createAlertsPart(d.deps)
    await dispatchEvent(part.events!, made.eventId)
    const body = { org_id: o.id, project_id: made.projectId, bundle_id: made.bundleId }
    expect(d.tasks.sort((x, y) => x.at.getTime() - y.at.getTime())).toEqual([
      {
        queue: 'bundle-timers',
        name: `sla-${made.bundleId}-next_approver`,
        at: SLA_DUE,
        body: { ...body, level: 'next_approver' }
      },
      {
        queue: 'bundle-timers',
        name: `sla-${made.bundleId}-admins`,
        at: at('2026-11-02T07:30:00Z'),
        body: { ...body, level: 'admins' }
      }
    ])
    const timer = slaTimer(d.deps)

    d.setClock(SLA_DUE)
    await timer({ name: d.tasks[0]!.name, retryCount: 0, body: d.tasks[0]!.body })
    await timer({ name: d.tasks[0]!.name, retryCount: 1, body: d.tasks[0]!.body })
    expect(d.mails.slice(1).map((m) => m.to)).toHaveLength(1)
    expect(d.mails[1]!.text).toContain('Escalated to you: Commute disruption for 15:15 MYT–15:30 MYT, 0 min past SLA')
    await expectOneAudit('bundle.escalated', { targetId: made.bundleId })
    const escalated = await expectEvent('bundle.escalated', { projectId: made.projectId })
    expect(escalated.data).toMatchObject({ bundle_id: made.bundleId, level: 'next_approver' })

    d.setClock(at('2026-11-02T07:30:00Z'))
    await timer({ name: d.tasks[1]!.name, retryCount: 0, body: d.tasks[1]!.body })
    expect(d.mails.slice(2).map((m) => m.text.split('\n')[0])).toEqual([
      'Escalated to you: Commute disruption for 15:15 MYT–15:30 MYT, 10 min past SLA',
      'Escalated to you: Commute disruption for 15:15 MYT–15:30 MYT, 10 min past SLA'
    ])

    const steps = await rows<{ diff: { level: string; account_ids: string[] } }>(
      "SELECT diff FROM approval WHERE bundle_id = $1 AND action = 'escalate' ORDER BY created_at",
      [made.bundleId]
    )
    expect(steps.map((s) => s.diff)).toEqual([
      { level: 'next_approver', account_ids: [next] },
      { level: 'admins', account_ids: [admin, owner].sort() }
    ])
    const audits = await rows("SELECT 1 FROM audit_event WHERE action = 'bundle.escalated' AND target_id = $1", [
      made.bundleId
    ])
    expect(audits).toHaveLength(2)
    const levels = await rows<{ account_id: string; level: string }>(
      "SELECT account_id, level FROM bundle_alert WHERE bundle_id = $1 AND channel = 'email' ORDER BY level, account_id",
      [made.bundleId]
    )
    expect(levels.map((r) => [r.level, r.account_id])).toEqual([
      ['on_duty', onDuty],
      ['next_approver', next],
      ...[admin, owner].sort().map((id) => ['admins', id])
    ])
    const [state] = await rows<{ escalation_level: number }>('SELECT escalation_level FROM bundle WHERE id = $1', [
      made.bundleId
    ])
    expect(state!.escalation_level).toBe(2)
    const tracked = await rows("SELECT 1 FROM analytics_event WHERE name = 'bundle_escalated' AND project_id = $1", [
      made.projectId
    ])
    expect(tracked).toHaveLength(2)
  })

  test('an approval before 10 minutes makes both tasks no-ops; an early task fails so Cloud Tasks retries it', async () => {
    const o = await org()
    await account(o.id, 'admin')
    const made = await reviewBundle(o.id)
    const d = doubles({ clock: at('2026-11-02T07:19:59Z'), next: [await account(o.id)] })
    const timer = slaTimer(d.deps)
    const body = (level: string) => ({ org_id: o.id, project_id: made.projectId, bundle_id: made.bundleId, level })
    await expect(timer({ name: null, retryCount: 0, body: body('next_approver') })).rejects.toThrow(/not due/)

    await asLogin('postgres', (c) => c.query("UPDATE bundle SET state = 'approved' WHERE id = $1", [made.bundleId]))
    d.setClock(SLA_DUE)
    await timer({ name: null, retryCount: 0, body: body('next_approver') })
    d.setClock(at('2026-11-02T07:30:00Z'))
    await timer({ name: null, retryCount: 0, body: body('admins') })
    // #150's bundle-timers dispatcher hands `sla-` tasks to this part: the approved bundle's task is a no-op.
    await registry.queues['bundle-timers']!({
      name: `sla-${made.bundleId}-admins`,
      retryCount: 0,
      body: body('admins')
    })
    expect([...d.mails, ...d.pushes]).toEqual([])
    expect(await rows("SELECT 1 FROM approval WHERE bundle_id = $1 AND action = 'escalate'", [made.bundleId])).toEqual(
      []
    )
  })
})

describe('CAL-19: shift reminders', () => {
  // Monday 9 November 2026, 12:00 MYT.
  const NOON = at('2026-11-09T04:00:00Z')

  async function stormShift(orgId: string) {
    const approver = await account(orgId)
    const shift = await inOrg(orgId, async (tx) => {
      await makeProject(tx)
      return makeRotaShift(tx, {
        accountId: approver,
        days: [1, 2, 3, 4, 5, 6, 7],
        localStart: '14:00',
        localEnd: '19:15',
        condition: 'storm_afternoon',
        template: 'storm_afternoon'
      })
    })
    await inOrg(orgId, (tx) => makePushSubscription(tx, { accountId: approver }))
    return { approver, shift }
  }

  test('a 14:00 storm-afternoon shift gets its reminder at 13:30 MYT on a thunderstorm day; replanning sends no duplicate', async () => {
    const o = await org()
    const { shift } = await stormShift(o.id)
    const d = doubles({ clock: NOON, conditions: async () => true })
    const part = createAlertsPart(d.deps)
    await part.batch!['shift-reminder-plan']!(NOON)
    const body = { org_id: o.id, rota_shift_id: shift.id, local_date: '2026-11-09' }
    expect(d.tasks).toEqual([
      {
        queue: 'shift-reminders',
        name: `reminder-${shift.id}-2026-11-09-before_shift`,
        at: at('2026-11-09T05:30:00Z'),
        body: { ...body, kind: 'before_shift' }
      },
      {
        queue: 'shift-reminders',
        name: `reminder-${shift.id}-2026-11-09-switched_on`,
        at: NOON,
        body: { ...body, kind: 'switched_on' }
      }
    ])

    d.setClock(at('2026-11-09T05:30:00Z'))
    const reminder = part.queues!['shift-reminders']!
    await reminder({ name: d.tasks[0]!.name, retryCount: 0, body: d.tasks[0]!.body })
    await reminder({ name: d.tasks[0]!.name, retryCount: 1, body: d.tasks[0]!.body })
    expect(d.pushes.map((p) => p.payload.title)).toEqual(['Your shift starts at 14:00 MYT'])
    expect(d.mails.map((m) => m.text.split('\n')[0])).toEqual([
      'Storm afternoon shift, 14:00 MYT–19:15 MYT on 9 November 2026.'
    ])
    expect(d.mails[0]!.text).toContain(`https://app.skyclause.m1ku.tech/${o.slug}/settings/rota`)

    await reminder({ name: d.tasks[1]!.name, retryCount: 0, body: d.tasks[1]!.body })
    expect(d.mails.map((m) => m.subject)).toEqual([
      'Your shift starts at 14:00 MYT',
      'Storm afternoon shift switched on'
    ])

    d.tasks.length = 0
    await part.batch!['shift-reminder-plan']!(at('2026-11-09T05:31:00Z'))
    expect(d.tasks).toEqual([])
    const reminders = await rows<{ kind: string; due_at: Date }>(
      'SELECT kind, due_at FROM shift_reminder WHERE rota_shift_id = $1 ORDER BY kind',
      [shift.id]
    )
    expect(reminders.map((r) => r.kind)).toEqual(['before_shift', 'switched_on'])
    expect(reminders[0]!.due_at).toEqual(at('2026-11-09T05:30:00Z'))
    // A switch-on is due when it was seen: here, when its task ran at 13:30 MYT.
    expect(reminders[1]!.due_at.getTime() - at('2026-11-09T05:30:00Z').getTime()).toBeLessThan(5_000)
  })

  test('a forecast without thunderstorms plans nothing; an unknown one plans the reminder without a switch-on', async () => {
    const o = await org()
    const { shift } = await stormShift(o.id)
    const off = doubles({ clock: NOON, conditions: async () => false })
    await createAlertsPart(off.deps).batch!['shift-reminder-plan']!(NOON)
    expect(off.tasks).toEqual([])
    const unknown = doubles({ clock: NOON, conditions: async () => 'unknown' })
    await createAlertsPart(unknown.deps).batch!['shift-reminder-plan']!(NOON)
    expect(unknown.tasks.map((t) => t.name)).toEqual([`reminder-${shift.id}-2026-11-09-before_shift`])
  })

  test('a condition switched off by the time the task runs sends nothing', async () => {
    const o = await org()
    const { shift } = await stormShift(o.id)
    const d = doubles({ clock: at('2026-11-09T05:30:00Z'), conditions: async () => false })
    const body = { org_id: o.id, rota_shift_id: shift.id, local_date: '2026-11-09', kind: 'before_shift' }
    await createAlertsPart(d.deps).queues!['shift-reminders']!({ name: null, retryCount: 0, body })
    expect([...d.mails, ...d.pushes]).toEqual([])
    expect(await rows('SELECT 1 FROM shift_reminder WHERE rota_shift_id = $1', [shift.id])).toEqual([])
  })
})

describe('D24: no draft with a non-Normal shadow verdict', () => {
  async function failedRun(orgId: string, shadowMode: boolean, o: { shadowState?: boolean } = {}) {
    return inOrg(orgId, async (tx) => {
      const project = await makeProject(tx, { name: 'Bukit Jalil' })
      if (o.shadowState !== false) {
        await makeShadowState(tx, { projectId: project.id, verdict: { mode: 'commute_disruption' } })
      }
      const run = await makeRun(tx, { projectId: project.id, status: 'failed', reason: 'provider_error' })
      const event = await emitEvent(tx, {
        projectId: project.id,
        type: 'run.failed',
        data: { run_id: run.id, pack: 'sky', trigger: 'request', reason: 'provider_error', shadow_mode: shadowMode }
      })
      return event.id
    })
  }

  test('alerts on-duty approvers and Admins with the reason and the clause engine’s mode', async () => {
    const o = await org()
    const approver = await account(o.id)
    const admin = await account(o.id, 'admin')
    const d = doubles({ clock: at('2026-11-02T07:10:00Z'), onDuty: [approver] })
    await dispatchEvent(createAlertsPart(d.deps).events!, await failedRun(o.id, true))
    const addresses = await rows<{ email: string }>('SELECT email FROM auth."user" WHERE id = ANY($1) ORDER BY email', [
      [approver, admin]
    ])
    expect(d.mails.map((m) => m.to).sort()).toEqual(addresses.map((r) => r.email))
    expect(new Set(d.mails.map((m) => m.subject))).toEqual(new Set(['No draft · Bukit Jalil']))
    expect(d.mails[0]!.text.split('\n')[0]).toBe('No draft: provider_error; clause engine says Commute disruption')
  })

  test('the event’s shadow_mode decides: with no stored verdict to name, the alert still goes', async () => {
    const o = await org()
    const d = doubles({ clock: at('2026-11-02T07:10:00Z'), onDuty: [await account(o.id)] })
    await dispatchEvent(createAlertsPart(d.deps).events!, await failedRun(o.id, true, { shadowState: false }))
    expect(d.mails.map((m) => m.text.split('\n')[0])).toEqual([
      'No draft: provider_error; the clause engine’s verdict is not Normal'
    ])
  })

  test('a run whose shadow verdict is Normal alerts nobody', async () => {
    const o = await org()
    const d = doubles({ clock: at('2026-11-02T07:10:00Z'), onDuty: [await account(o.id)] })
    await dispatchEvent(createAlertsPart(d.deps).events!, await failedRun(o.id, false))
    expect(d.mails).toEqual([])
  })
})

describe('the resend sweep', () => {
  test('resends alerts left queued for over a minute and expires those over an hour old', async () => {
    const o = await org()
    const a = await account(o.id)
    const made = await reviewBundle(o.id)
    const down = doubles({
      clock: at('2026-11-02T07:10:01Z'),
      onDuty: [a],
      email: async () => Promise.reject(new Error('socket hang up'))
    })
    await dispatchEvent(createAlertsPart(down.deps).events!, made.eventId)
    await asLogin('postgres', (c) =>
      c.query("UPDATE notice SET created_at = now() - interval '5 minutes' WHERE project_id = $1", [made.projectId])
    )
    const up = doubles({ clock: at('2026-11-02T07:12:00Z'), onDuty: [a] })
    await createAlertsPart(up.deps).batch!['approver-alert-resend']!(new Date())
    expect(up.mails).toHaveLength(1)
    expect(
      await rows("SELECT 1 FROM bundle_alert WHERE bundle_id = $1 AND channel = 'email'", [made.bundleId])
    ).toHaveLength(1)

    const later = await reviewBundle(o.id)
    await dispatchEvent(createAlertsPart(down.deps).events!, later.eventId)
    await asLogin('postgres', (c) =>
      c.query("UPDATE notice SET created_at = now() - interval '2 hours' WHERE project_id = $1", [later.projectId])
    )
    await createAlertsPart(up.deps).batch!['approver-alert-resend']!(new Date())
    expect(up.mails).toHaveLength(1)
    expect(
      (await rows<{ status: string }>('SELECT status FROM notice WHERE project_id = $1', [later.projectId])).map(
        (n) => n.status
      )
    ).toEqual(['expired'])
  })
})

describe('the auditor’s no-approver check', () => {
  test('a bundle within 2 minutes of its SLA with nobody on duty is a finding for Admins and Owners', async () => {
    const o = await org()
    const admin = await account(o.id, 'admin')
    const made = await reviewBundle(o.id)
    const nobody = noApproverCheck({ onDuty: async () => [] })
    const someone = noApproverCheck({ onDuty: async () => [admin] })
    const run = (check: typeof nobody, now: string) => inOrg(o.id, (tx) => check.run(tx as never, now))
    expect(await run(nobody, '2026-11-02T07:17:59Z')).toEqual([])
    expect(await run(nobody, '2026-11-02T07:18:00Z')).toEqual([
      {
        key: `no_approver:${made.bundleId}`,
        projectId: made.projectId,
        accountIds: [admin],
        ref: { type: 'bundle', id: made.bundleId }
      }
    ])
    expect(await run(someone, '2026-11-02T07:19:00Z')).toEqual([])
  })
})
