// #151: the run orchestrator's worker part on the #79 §7 test database: the `runs-requested` handler walks a run's
// steps to a bundle or a "No draft", resumes after a redelivery, and keeps one run per project and pack at a time.
// Every port is a double (`./runs/doubles`); snapshots come from the named captures (`@skyclause/db/test/runs/scene`).
import { randomUUID } from 'node:crypto'
import {
  aiUsage,
  bundle,
  call,
  requestRun,
  run,
  RUN_STEPS,
  runStep,
  setRunPublisher,
  systemPrincipal,
  withTenant,
  type RunStepName,
  type Tx
} from '@skyclause/db'
import {
  makeAiKey,
  makeGrade,
  makeMember,
  makeOrganization,
  makeProjectSource,
  makeReading,
  makeRotaShift,
  makeSource,
  makeSubscriber,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import {
  normalSiteVerdicts,
  runScene,
  T_EVAL,
  thunderstormWarning,
  WARNING_ISSUED,
  WARNING_T_EVAL,
  warningSnapshot,
  WAVE_TITLE,
  type RunScene
} from '@skyclause/db/test/runs/scene'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { createRunsPart, type RunPorts } from '../src/runs'
import type { PushMessage } from '../src/server'
import { doubles, promptOf, stormReply } from './runs/doubles'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
afterEach(() => setRunPublisher(null))

const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)

interface Made extends RunScene {
  keyId: string
  subscriberId: string
  subscriberEmail: string
}

/** The 2 November scene with one confirmed subscriber of the wave and an organisation key for the chain. */
async function made(): Promise<Made> {
  return inOrg(async (tx) => {
    const scene = await runScene(tx)
    const sub = await makeSubscriber(tx, {
      projectId: scene.projectId,
      windowIds: [scene.windowId],
      role: 'student',
      language: 'en',
      confirmedAt: new Date('2026-10-01T00:00:00Z')
    })
    const key = await makeAiKey(tx)
    return { ...scene, keyId: key.id, subscriberId: sub.id, subscriberEmail: sub.email }
  })
}

/** A crossing on the wave at 15:05 MYT, through requestRun. */
function crossingRun(m: Made, crossingId = randomUUID()) {
  return inOrg((tx) =>
    requestRun(tx, {
      projectId: m.projectId,
      pack: 'sky',
      trigger: 'crossing',
      triggerRef: crossingId,
      windowIds: [m.windowId],
      dedupeKey: `crossing:${crossingId}`,
      triggeredAt: T_EVAL
    })
  )
}

const push = (runId: string): PushMessage => ({
  data: { run_id: runId, org_id: orgId },
  attributes: {},
  messageId: randomUUID(),
  publishTime: new Date().toISOString()
})
const deliver = (ports: RunPorts, runId: string) => createRunsPart(ports).topics!['runs-requested']!(push(runId))

const runRow = (id: string) => inOrg(async (tx) => (await tx.select().from(run).where(eq(run.id, id)))[0]!)
/** The run's steps in the ticket's order (several can start in the same millisecond). */
const stepsOf = async (id: string) =>
  (await inOrg((tx) => tx.select().from(runStep).where(eq(runStep.runId, id)))).sort(
    (a, b) => RUN_STEPS.indexOf(a.step as RunStepName) - RUN_STEPS.indexOf(b.step as RunStepName)
  )
const bundlesOf = (id: string) => inOrg((tx) => tx.select().from(bundle).where(eq(bundle.runId, id)))
const usageOf = (id: string) => inOrg((tx) => tx.select().from(aiUsage).where(eq(aiUsage.runId, id)))
const eventsOf = (projectId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ type: string; data: Record<string, unknown> }>(
      "SELECT type, data FROM domain_event WHERE project_id = $1 AND type LIKE 'run.%' ORDER BY seq",
      [projectId]
    )
    return rows
  })

describe('the runs-requested handler', () => {
  test('a crossing’s run walks its seven steps to a bundle in Needs review and emits run.completed', async () => {
    const m = await made()
    const { runId } = await crossingRun(m)
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [m.subscriberId])] })

    await deliver(d.ports, runId)

    const row = await runRow(runId)
    expect(row).toMatchObject({
      status: 'drafted',
      reason: null,
      sheetVersionId: m.sheetVersionId,
      verdictHash: `verdicts-commute_disruption-${m.windowId}`,
      model: 'gemini-3.8-flash',
      provider: 'google',
      fallbackUsed: false,
      tokensIn: 1200,
      tokensOut: 300
    })
    expect(row.snapshotId).not.toBeNull()
    expect((await stepsOf(runId)).map((s) => [s.step, s.status])).toEqual(
      ['snapshot', 'shadow', 'budget', 'draft', 'validate', 'compare', 'persist'].map((s) => [s, 'done'])
    )

    const [made_] = await bundlesOf(runId)
    expect(made_).toMatchObject({ state: 'needs_review', draftOnly: false })
    const calls = await inOrg((tx) => tx.select().from(call).where(eq(call.bundleId, made_!.id)))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      windowId: m.windowId,
      mode: 'commute_disruption',
      recipients: [m.subscriberId],
      chosen: 'agent',
      agrees: true
    })
    expect(calls[0]!.shadow).toMatchObject({ scope: { kind: 'window', id: m.windowId }, no_call: null })

    expect(await eventsOf(m.projectId)).toEqual([
      {
        type: 'run.completed',
        data: { run_id: runId, pack: 'sky', trigger: 'crossing', bundle_id: made_!.id, shadow_mode: true }
      }
    ])
    const usage = await usageOf(runId)
    expect(usage.map((u) => [u.aiKeyId, u.model, u.tokensIn, u.tokensOut])).toEqual([
      [m.keyId, 'gemini-3.8-flash', 1200, 300]
    ])

    // NFR-11: the prompt carries the candidate's opaque ID, role and language; no email or window title.
    expect(d.model.doGenerateCalls).toHaveLength(1)
    const prompt = promptOf(d.model)
    expect(prompt).toContain(m.subscriberId)
    expect(prompt).not.toContain(m.subscriberEmail)
    expect(prompt).not.toContain(WAVE_TITLE)
    expect(d.chains).toEqual([{ orgId, accountId: null, unattended: true }])
    expect(d.consumed).toEqual(['system:run'])
  })

  test('killed after each step and redelivered, it ends with one bundle and one model call', async () => {
    const m = await made()
    const { runId } = await crossingRun(m)
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [m.subscriberId])] })
    const killed: string[] = []
    class Killed extends Error {}

    // Each delivery dies right after the first step it commits; the next delivery resumes at the step after it.
    for (let delivery = 0; delivery < RUN_STEPS.length; delivery++) {
      const part = createRunsPart(d.ports, {
        afterStep: (step) => {
          killed.push(step)
          throw new Killed(step)
        }
      })
      await expect(part.topics!['runs-requested']!(push(runId))).rejects.toBeInstanceOf(Killed)
      expect((await runRow(runId)).status).toBe(delivery < RUN_STEPS.length - 1 ? 'running' : 'drafted')
    }
    await deliver(d.ports, runId)

    expect(killed).toEqual([...RUN_STEPS])
    expect(await bundlesOf(runId)).toHaveLength(1)
    expect(d.model.doGenerateCalls).toHaveLength(1)
    expect(await usageOf(runId)).toHaveLength(1)
    expect(d.consumed).toEqual(['system:run'])
    expect((await eventsOf(m.projectId)).map((e) => e.type)).toEqual(['run.completed'])
  })

  test('two deliveries at once run each step once', async () => {
    const m = await made()
    const { runId } = await crossingRun(m)
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [m.subscriberId])] })
    await Promise.all([deliver(d.ports, runId), deliver(d.ports, runId)])
    expect(await bundlesOf(runId)).toHaveLength(1)
    expect(d.model.doGenerateCalls).toHaveLength(1)
    expect((await eventsOf(m.projectId)).map((e) => e.type)).toEqual(['run.completed'])
  })

  test('one run per project and pack at a time: the next stays queued until the running one publishes it', async () => {
    const m = await made()
    const published: string[] = []
    setRunPublisher(async ({ run_id }) => void published.push(run_id))
    const first = await crossingRun(m)
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [m.subscriberId])] })
    let second: string | undefined
    const part = createRunsPart(d.ports, {
      afterStep: async (step) => {
        if (step !== 'snapshot' || second) return
        // While the first run walks its steps, another crossing queues a follow-up, whose message acks at once.
        second = (await crossingRun(m)).runId
        await deliver(d.ports, second)
        expect((await runRow(second)).status).toBe('queued')
      }
    })
    await part.topics!['runs-requested']!(push(first.runId))

    expect((await runRow(first.runId)).status).toBe('drafted')
    expect((await runRow(second!)).status).toBe('queued')
    expect(published).toEqual([first.runId, second, second])
    await deliver(d.ports, second!)
    expect((await runRow(second!)).status).toBe('drafted')
  })

  test('over budget: "No draft: budget" with the shadow verdict kept, and no model call', async () => {
    const m = await made()
    const { runId } = await crossingRun(m)
    const d = doubles(m, {
      keyId: m.keyId,
      replies: [stormReply(m.windowId, [m.subscriberId])],
      budget: { ok: false, resetsAt: '2026-11-02T16:00:00Z' }
    })
    await deliver(d.ports, runId)

    expect(await runRow(runId)).toMatchObject({
      status: 'no_draft',
      reason: 'budget',
      verdictHash: `verdicts-commute_disruption-${m.windowId}`
    })
    expect(d.model.doGenerateCalls).toHaveLength(0)
    expect(await bundlesOf(runId)).toEqual([])
    expect(await eventsOf(m.projectId)).toEqual([
      {
        type: 'run.failed',
        data: { run_id: runId, pack: 'sky', trigger: 'crossing', reason: 'budget', shadow_mode: true }
      }
    ])
  })

  test('a draft that fails validation twice is "No draft: validation", with both calls in ai_usage', async () => {
    const m = await made()
    const { runId } = await crossingRun(m)
    // A recipient who isn't a candidate of the window, twice.
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [randomUUID()])] })
    await deliver(d.ports, runId)
    expect(await runRow(runId)).toMatchObject({ status: 'no_draft', reason: 'validation', tokensIn: 2400 })
    expect(await usageOf(runId)).toHaveLength(2)
    expect((await stepsOf(runId)).map((s) => s.step)).toEqual(['snapshot', 'shadow', 'budget', 'draft'])
  })

  test('a provider error is "No draft: provider error"', async () => {
    const m = await made()
    const { runId } = await crossingRun(m)
    const d = doubles(m, { keyId: m.keyId, replies: [new Error('503 Service Unavailable')] })
    await deliver(d.ports, runId)
    expect(await runRow(runId)).toMatchObject({ status: 'no_draft', reason: 'provider_error', fallbackUsed: false })
    expect((await usageOf(runId)).map((u) => [u.tokensIn, u.tokensOut])).toEqual([[0, 0]])
  })

  test('a port that throws fails the run at that step and publishes the next', async () => {
    const m = await made()
    const published: string[] = []
    setRunPublisher(async ({ run_id }) => void published.push(run_id))
    const { runId } = await crossingRun(m)
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [m.subscriberId])] })
    const ports: RunPorts = {
      ...d.ports,
      shadow: {
        ...d.ports.shadow,
        loadPublished: async () => {
          throw new Error('no published sheet')
        }
      }
    }
    await deliver(ports, runId)
    expect(await runRow(runId)).toMatchObject({ status: 'failed', reason: 'shadow_failed' })
    const steps = await stepsOf(runId)
    expect(steps.map((s) => [s.step, s.status])).toEqual([
      ['snapshot', 'done'],
      ['shadow', 'failed']
    ])
    expect(steps[1]!.output).toEqual({ error: 'Error: no published sheet' })
    expect((await eventsOf(m.projectId))[0]).toMatchObject({
      type: 'run.failed',
      data: { reason: 'shadow_failed', shadow_mode: false }
    })
  })

  test('CAL-1: every trigger kind gives one run whose record names its trigger, project and pack', async () => {
    const kinds = ['schedule', 'crossing', 'window', 'listing', 'calendar', 'request'] as const
    for (const trigger of kinds) {
      const m = await made()
      const { runId } = await inOrg((tx) =>
        requestRun(tx, {
          projectId: m.projectId,
          pack: 'sky',
          trigger,
          windowIds: [m.windowId],
          dedupeKey: `${trigger}:${randomUUID()}`,
          triggeredAt: T_EVAL
        })
      )
      const d = doubles(m, { keyId: m.keyId, replies: [stormReply(m.windowId, [m.subscriberId])] })
      await deliver(d.ports, runId)
      expect(await runRow(runId)).toMatchObject({ trigger, projectId: m.projectId, pack: 'sky', status: 'drafted' })
      // PRD's analytics and webhook enums have no `window`: it reads as `calendar`.
      const reported = trigger === 'window' ? 'calendar' : trigger
      const started = await asLogin('postgres', async (client) => {
        const { rows } = await client.query<{ props: unknown }>(
          "SELECT props FROM analytics_event WHERE project_id = $1 AND name = 'run_started'",
          [m.projectId]
        )
        return rows.map((r) => r.props)
      })
      expect(started).toEqual([{ pack: 'sky', trigger: reported }])
      expect((await eventsOf(m.projectId))[0]!.data).toMatchObject({ run_id: runId, trigger: reported })
    }
  })

  test('a guest window’s run drafts a bundle that never sends (GST-5, D23)', async () => {
    const m = await made()
    const guest = await inOrg((tx) =>
      makeWindow(tx, {
        projectId: m.projectId,
        via: 'guest',
        guest: true,
        startsAt: new Date('2026-11-02T07:30:00Z'),
        endsAt: new Date('2026-11-02T07:30:00Z')
      })
    )
    const { runId } = await inOrg((tx) =>
      requestRun(tx, {
        projectId: m.projectId,
        pack: 'sky',
        trigger: 'request',
        windowIds: [guest.id],
        dedupeKey: `request:${randomUUID()}`,
        triggeredAt: T_EVAL
      })
    )
    const d = doubles(m, { keyId: m.keyId, replies: [stormReply(guest.id, [])] })
    await deliver(d.ports, runId)
    expect(await bundlesOf(runId)).toMatchObject([{ draftOnly: true, state: 'closed' }])
  })

  test('inputs: MET text verbatim, yesterday’s grades, a Malay reader on duty and the bound sources', async () => {
    const { m, sourceUrl, gradedWindow, readingId } = await inOrg(async (tx) => {
      const scene = await runScene(tx)
      const met = await makeSource(tx, { kind: 'met_warning', url: 'https://api.data.gov.my/weather/warning/' })
      await makeProjectSource(tx, { projectId: scene.projectId, sourceId: met.id, role: 'warnings' })
      const warning = await makeReading(tx, {
        sourceId: met.id,
        metric: 'warning',
        unit: null,
        value: null,
        valueText: thunderstormWarning(),
        observedAt: new Date(WARNING_ISSUED)
      })
      // Yesterday in MYT is Wednesday 4 November: a graded window that started then, and one from the day before.
      const yesterday = await makeWindow(tx, {
        projectId: scene.projectId,
        startsAt: new Date('2026-11-04T06:00:00Z'),
        endsAt: new Date('2026-11-04T08:00:00Z')
      })
      const older = await makeWindow(tx, {
        projectId: scene.projectId,
        startsAt: new Date('2026-11-03T06:00:00Z'),
        endsAt: new Date('2026-11-03T08:00:00Z')
      })
      await makeGrade(tx, { projectId: scene.projectId, windowId: yesterday.id, outcome: 'hit' })
      await makeGrade(tx, { projectId: scene.projectId, windowId: older.id, outcome: 'miss' })
      const key = await makeAiKey(tx)
      return {
        m: { ...scene, keyId: key.id, subscriberId: '', subscriberEmail: '' },
        sourceUrl: met.url,
        gradedWindow: yesterday.id,
        readingId: warning.id
      }
    })
    // Thursday 5 November, 21:13 MYT: an approver who reads Malay is on the evening shift.
    const reader = await makeMember({ organizationId: orgId, role: 'approver', readsMalay: true })
    await inOrg((tx) =>
      makeRotaShift(tx, {
        accountId: reader.userId,
        projectId: m.projectId,
        days: [4],
        localStart: '21:00',
        localEnd: '22:00'
      })
    )
    const { runId } = await inOrg((tx) =>
      requestRun(tx, {
        projectId: m.projectId,
        pack: 'sky',
        trigger: 'schedule',
        dedupeKey: `schedule:${m.projectId}:sky:2026-11-05:21:00`,
        triggeredAt: WARNING_T_EVAL
      })
    )
    const d = doubles(m, {
      keyId: m.keyId,
      replies: [JSON.stringify({ pack: 'sky', calls: [], items: [] })],
      snapshot: (projectId) => warningSnapshot(projectId, '', readingId),
      verdicts: () => normalSiteVerdicts(),
      now: () => new Date(WARNING_T_EVAL)
    })
    await deliver(d.ports, runId)

    const draft = (await stepsOf(runId)).find((s) => s.step === 'draft')!.output as { input: Record<string, unknown> }
    expect(draft.input).toMatchObject({
      met_warnings: [thunderstormWarning()],
      yesterday_grades: [{ window_id: gradedWindow, outcome: 'hit' }],
      malay_reader: true,
      source_urls: [sourceUrl],
      windows: [],
      origins: d.ports.origins
    })
    expect(promptOf(d.model)).toContain(
      'Thunderstorms, heavy rain and strong winds are expected over the states of Kedah'
    )
    expect(await runRow(runId)).toMatchObject({ status: 'drafted' })
  })
})
