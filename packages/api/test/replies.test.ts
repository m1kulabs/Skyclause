// #163 (c-recipient-replies) at the operation seam: `POST /api/subscribe/{token}/reply` and `…/feedback` on the #79 §7
// test database.
import { randomUUID } from 'node:crypto'
import {
  crowdReply,
  issueSubscriberToken,
  ledgerEntry,
  planFeedback,
  recordAudit,
  setFlag,
  subscriberToken,
  systemPrincipal,
  tokenHash,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeOrganization,
  makeProject,
  makeRun,
  makeSubscriber,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { callDraft } from '@skyclause/db/test/bundles/scene'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { apiRequest, asSession, createTestApi, TEST_NOW, testDeps, testOrg } from './harness'

const acme = testOrg(`replies-${randomUUID()}`)
const viewer = asSession({ org: acme.slug, role: 'viewer' })
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, orgId = acme.id) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

// A surge night's window, 18:00 to 22:00 MYT on 20 November 2026, after the harness clock (TEST_NOW, 8 November).
const STARTS = new Date('2026-11-20T10:00:00Z')
const ENDS = new Date('2026-11-20T14:00:00Z')

let projectId: string
let windowId: string
let callId: string
let subscriberId: string

beforeAll(async () => {
  await makeOrganization({ id: acme.id, slug: acme.slug })
  await setFlag({ key: 'pack_crowd', enabled: true, orgId: acme.id })
})
beforeEach(async () => {
  ;({ projectId, windowId, callId, subscriberId } = await inOrg(async (tx) => {
    const project = await makeProject(tx, { name: 'Bukit Jalil' })
    const window = await makeWindow(tx, { projectId: project.id, startsAt: STARTS, endsAt: ENDS })
    const run = await makeRun(tx, { projectId: project.id, pack: 'crowd' })
    const bundle = await makeBundle(tx, { runId: run.id })
    const { shadow } = callDraft({ windowId: window.id })
    const call = await makeCall(tx, { bundleId: bundle.id, windowId: window.id, shadow })
    const subscriber = await makeSubscriber(tx, { projectId: project.id, confirmedAt: new Date() })
    return { projectId: project.id, windowId: window.id, callId: call.id, subscriberId: subscriber.id }
  }))
})

function setup() {
  return createTestApi({ deps: testDeps({ withTenant, recordAudit }) })
}
const replyToken = () => inOrg((tx) => issueSubscriberToken(tx, { subscriberId, purpose: 'reply', callId, windowId }))
const reply = (app: ReturnType<typeof setup>['api'], token: string, body: unknown, key = randomUUID()) =>
  apiRequest(app, { method: 'POST', path: `/api/subscribe/${token}/reply`, idempotencyKey: key, body })
const replies = () => inOrg((tx) => tx.select().from(crowdReply).where(eq(crowdReply.windowId, windowId)))

describe('CAL-17: a reply is logged against the window and the ledger shows it with its time', () => {
  test('a reply through the link writes a crowd_reply row and a ledger entry with at, which the ledger lists', async () => {
    const { api, v1 } = setup()
    const response = await reply(api, await replyToken(), { kind: 'shift', shift_to: '19:30' })

    expect(response.status).toBe(201)
    const body = (await response.json()) as { id: string }
    expect(body).toEqual({
      id: expect.any(String),
      window_id: windowId,
      reply: { kind: 'shift', shift_to: '19:30' },
      at: '2026-11-08T02:00:00Z'
    })
    // 19:30 MYT on the window's date.
    expect(await replies()).toMatchObject([
      { id: body.id, callId, kind: 'shift', shiftTo: new Date('2026-11-20T11:30:00Z'), at: TEST_NOW }
    ])

    const ledger = await apiRequest(v1, {
      as: viewer,
      org: acme.slug,
      method: 'GET',
      path: `/v1/projects/${projectId}/ledger`
    })
    expect(ledger.status).toBe(200)
    expect(((await ledger.json()) as { data: unknown[] }).data).toEqual([
      expect.objectContaining({
        kind: 'crowd_reply',
        refs: { window_id: windowId, call_id: callId, crowd_reply_id: body.id },
        body: { kind: 'shift', shift_to: '2026-11-20T11:30:00.000Z', at: '2026-11-08T02:00:00.000Z' }
      })
    ])
  })
})

const ledgerKinds = () =>
  inOrg(async (tx) =>
    (await tx.select({ kind: ledgerEntry.kind }).from(ledgerEntry).where(eq(ledgerEntry.projectId, projectId))).map(
      (row) => row.kind
    )
  )

describe('token misuse writes nothing', () => {
  test('a wrong-purpose, used, expired or unknown token, or one after the window ends, answers link-expired', async () => {
    const { api, deps } = setup()
    const wrong = await inOrg((tx) => issueSubscriberToken(tx, { subscriberId, purpose: 'manage', callId, windowId }))
    const expired = await replyToken()
    await inOrg((tx) =>
      tx
        .update(subscriberToken)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(subscriberToken.tokenHash, tokenHash(expired)))
    )
    const unknown = randomUUID().replaceAll('-', '').padEnd(43, 'x')
    const used = await replyToken()
    expect((await reply(api, used, { kind: 'keep' })).status).toBe(201)
    const late = await replyToken()

    const answers = [
      await reply(api, wrong, { kind: 'keep' }),
      await reply(api, expired, { kind: 'keep' }),
      await reply(api, unknown, { kind: 'keep' }),
      await reply(api, used, { kind: 'shuttle' })
    ]
    deps.clock.advance(ENDS.getTime() - TEST_NOW.getTime())
    answers.push(await reply(api, late, { kind: 'keep' }))

    for (const answer of answers) {
      expect(answer.status).toBe(410)
      expect(await answer.json()).toMatchObject({ title: 'Link expired' })
    }
    expect((await replies()).map((row) => row.kind)).toEqual(['keep'])
    expect(await ledgerKinds()).toEqual(['crowd_reply'])
  })
})

test('while pack_crowd is off for the organisation, a reply answers 403 feature-off and the token stays unspent', async () => {
  const { api } = setup()
  const token = await replyToken()
  await setFlag({ key: 'pack_crowd', enabled: false, orgId: acme.id })
  try {
    const off = await reply(api, token, { kind: 'keep' })
    expect(off.status).toBe(403)
    expect(await off.json()).toMatchObject({ type: expect.stringContaining('feature-off') })
    expect(await replies()).toEqual([])
  } finally {
    await setFlag({ key: 'pack_crowd', enabled: true, orgId: acme.id })
  }
  expect((await reply(api, token, { kind: 'keep' })).status).toBe(201)
})

test('ANL-7: a reply with any field beyond its kind’s is 422 and writes nothing', async () => {
  const { api } = setup()
  const token = await replyToken()
  for (const body of [
    { kind: 'keep', note: 'We moved the class' },
    { kind: 'keep', shift_to: '19:30' },
    { kind: 'shift', shift_to: '19:30', comment: 'later' }
  ]) {
    const refused = await reply(api, token, body)
    expect(refused.status).toBe(422)
    expect(await refused.json()).toMatchObject({ type: expect.stringContaining('validation-failed') })
  }
  expect(await replies()).toEqual([])
  expect((await reply(api, token, { kind: 'shuttle' })).status).toBe(201)
})

test('D25: a GET on a reply link changes nothing, and the link still takes its one reply', async () => {
  const { api } = setup()
  const token = await replyToken()
  for (const path of [`/api/subscribe/${token}`, `/api/subscribe/${token}/reply`]) {
    expect((await apiRequest(api, { method: 'GET', path })).status).not.toBe(200)
  }
  expect(await replies()).toEqual([])
  expect((await reply(api, token, { kind: 'keep' })).status).toBe(201)
})

test('a retry with the same Idempotency-Key replays the 201 and logs the reply once', async () => {
  const { api } = setup()
  const token = await replyToken()
  const key = randomUUID()
  const first = await reply(api, token, { kind: 'keep' }, key)
  const again = await reply(api, token, { kind: 'keep' }, key)
  expect([first.status, again.status]).toEqual([201, 201])
  expect(await again.json()).toEqual(await first.json())
  expect(await replies()).toHaveLength(1)
})

describe('ANL-7: plan feedback is stored as counts only', () => {
  const feedbackToken = (subscriber = subscriberId) =>
    inOrg((tx) => issueSubscriberToken(tx, { subscriberId: subscriber, purpose: 'feedback', windowId }))
  const answer = (app: ReturnType<typeof setup>['api'], token: string, body: unknown) =>
    apiRequest(app, { method: 'POST', path: `/api/subscribe/${token}/feedback`, idempotencyKey: randomUUID(), body })
  const counts = () =>
    inOrg((tx) =>
      tx
        .select({ answer: planFeedback.answer, count: planFeedback.count })
        .from(planFeedback)
        .where(eq(planFeedback.windowId, windowId))
    )

  test('each answer adds a row of 1 to its window, and the token keeps only the day it was used', async () => {
    const { api } = setup()
    const second = await inOrg(async (tx) => (await makeSubscriber(tx, { projectId, confirmedAt: new Date() })).id)
    const [ours, theirs, third] = [await feedbackToken(), await feedbackToken(second), await feedbackToken(second)]

    const yes = await answer(api, ours, { answer: true })
    expect(yes.status).toBe(201)
    expect(await yes.json()).toEqual({ window_id: windowId, answer: true, count: 1 })
    expect(await (await answer(api, theirs, { answer: true })).json()).toEqual({
      window_id: windowId,
      answer: true,
      count: 2
    })
    expect(await (await answer(api, third, { answer: false })).json()).toEqual({
      window_id: windowId,
      answer: false,
      count: 1
    })
    expect(await counts()).toEqual([
      { answer: true, count: 1 },
      { answer: true, count: 1 },
      { answer: false, count: 1 }
    ])
    // No answer joins to its subscriber by time: the token shows the UTC day, the row the moment.
    const [spent] = await inOrg((tx) =>
      tx
        .select()
        .from(subscriberToken)
        .where(eq(subscriberToken.tokenHash, tokenHash(ours)))
    )
    expect(spent!.usedAt!.toISOString()).toMatch(/T00:00:00\.000Z$/)
  })

  test('a field beyond answer is 422, and a used, wrong-purpose or unknown token is link-expired; neither writes', async () => {
    const { api } = setup()
    const token = await feedbackToken()
    const refused = await answer(api, token, { answer: true, why: 'The rain stopped' })
    expect(refused.status).toBe(422)
    expect((await answer(api, token, { answer: true })).status).toBe(201)

    const wrong = await replyToken()
    const unknown = randomUUID().replaceAll('-', '').padEnd(43, 'x')
    for (const bad of [token, wrong, unknown]) {
      const expired = await answer(api, bad, { answer: false })
      expect(expired.status).toBe(410)
    }
    expect(await counts()).toEqual([{ answer: true, count: 1 }])
  })

  test('D25: a GET on a feedback link changes nothing', async () => {
    const { api } = setup()
    const token = await feedbackToken()
    for (const path of [`/api/subscribe/${token}`, `/api/subscribe/${token}/feedback`]) {
      expect((await apiRequest(api, { method: 'GET', path })).status).not.toBe(200)
    }
    expect(await counts()).toEqual([])
    expect((await answer(api, token, { answer: false })).status).toBe(201)
  })
})
