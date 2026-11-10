// #159 c-evidence: the three evidence operations on the #79 §7 test database, through createTestApi with the real
// withTenant and recordAudit. Doubles: the auth seams, d-guest-rules' BudgetGate (live after #181), the mailbox for
// SES (EmailTransport) and the frame URL signer.
import type { BudgetGate, Principal } from '@skyclause/contracts'
import { draftEvidenceRequest, recordAudit, subscriber as subscriberTable, withTenant, type Tx } from '@skyclause/db'
import { eq as drizzleEq } from 'drizzle-orm'
import {
  makeBundle,
  makeCall,
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectSource,
  makeReading,
  makeRun,
  makeSubscriber,
  makeSuppression,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { expectLedgerEntry, expectOneAudit, memberOf } from '@skyclause/db/test/harness/index'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { setEvidenceSeams, type EvidenceSeams } from '../src/services/evidence'
import {
  TEST_NOW,
  apiRequest,
  asApiKey,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createMailbox,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg
} from './harness'

const ORG = 'evidence-home'
const OTHER = 'evidence-other'
// The mailbox is swapped per test; the API's EmailTransport (ApiDeps.email) hands each send to the current one.
let mailbox = createMailbox()
const { v1, api } = createTestApi({
  deps: testDeps({ withTenant, recordAudit, email: { send: (message) => mailbox.send(message) } })
})
let orgId: string
let projectId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)

// PRJ-6's reviewer-link budget: 10 evidence requests a day per link (REVIEWER_EVIDENCE_PER_DAY), as #181 will count.
const REVIEWER_EVIDENCE_PER_DAY = 10
const RESETS_AT = '2026-11-08T16:00:00Z'
const spent = new Map<string, number>()
const budget: BudgetGate = {
  async consume(_tx, p, kind) {
    expect(kind).toBe('evidence')
    const key = p.kind === 'share_link' ? p.linkId : p.kind === 'oauth' ? p.shareLinkId! : JSON.stringify(p)
    const used = (spent.get(key) ?? 0) + 1
    spent.set(key, used)
    return used > REVIEWER_EVIDENCE_PER_DAY ? { ok: false, resetsAt: RESETS_AT } : { ok: true }
  }
}
let previous: EvidenceSeams

const span = { from: '2026-11-02T06:00:00Z', to: '2026-11-02T08:30:00Z' }
const post = (as: Principal, body: unknown = { span }, project = projectId, key = crypto.randomUUID()) =>
  apiRequest(v1, {
    as,
    method: 'POST',
    path: `/v1/projects/${project}/evidence-requests`,
    org: ORG,
    body,
    idempotencyKey: key
  })
const read = (as: Principal, id: string) =>
  apiRequest(v1, { as, method: 'GET', path: `/v1/evidence-requests/${id}`, org: ORG })
const approve = (as: Principal, id: string) =>
  apiRequest(api, { as, method: 'POST', path: `/api/evidence-requests/${id}/approve`, org: ORG })
type View = { id: string; status: string; [key: string]: unknown }
const json = async (response: Response) => (await response.json()) as View

const approver = () => asSession({ org: ORG, role: 'approver' })
const member = () => asSession({ org: ORG, role: 'viewer' })
const reviewerGrant = () =>
  asOAuth({ org: ORG, role: null, shareLinkId: crypto.randomUUID(), scopes: ['draft'], projectIds: [projectId] })

/** An emailed request from a confirmed subscriber, as the worker's inbound handler drafts it. */
async function subscriberRequest(language: 'en' | 'ms' = 'en') {
  return inOrg(async (tx) => {
    const subscriber = await makeSubscriber(tx, {
      projectId,
      email: `${crypto.randomUUID()}@team.example.test`,
      confirmedAt: TEST_NOW,
      language
    })
    const row = await draftEvidenceRequest(
      tx,
      {
        projectId,
        from: new Date(span.from),
        to: new Date(span.to),
        windowId: null,
        callId: null,
        requester: { kind: 'subscriber', id: subscriber.id, accountId: null, subscriberId: subscriber.id },
        via: 'email',
        leavesOrg: true,
        replyChannel: 'email',
        receivedAt: new Date(TEST_NOW.getTime() - 60_000),
        messageId: crypto.randomUUID()
      },
      TEST_NOW
    )
    return { request: row!, subscriber }
  })
}

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  orgId = testOrg(ORG).id
  projectId = await inOrg(async (tx) => (await makeProject(tx)).id)
  previous = setEvidenceSeams({
    budget,
    signFrameUrl: async (path, expiresAt) => `https://frames.example.test/${path}?expires=${expiresAt.toISOString()}`
  })
})

afterAll(() => {
  setEvidenceSeams(previous)
})

beforeEach(() => {
  mailbox = createMailbox()
})

describe('LED-4: a reply leaving the organisation waits for an Approver', () => {
  test('an MCP request from a share-link reviewer reads "Waiting for approval" until an Approver approves', async () => {
    const reviewer = reviewerGrant()
    const created = await post(reviewer)
    expect(created.status).toBe(202)
    const request = await json(created)
    expect(request).toMatchObject({
      status: 'waiting_for_approval',
      via: 'mcp',
      leaves_org: true,
      reply_channel: 'in_app',
      approved_at: null,
      replied_at: null
    })
    expect((await json(await read(reviewer, request.id))).status).toBe('waiting_for_approval')

    // The link-bound grant can't approve: /api admits sessions only.
    expect((await approve(reviewer, request.id)).status).toBe(403)
    expect((await json(await read(reviewer, request.id))).status).toBe('waiting_for_approval')

    const approved = await approve(approver(), request.id)
    expect(approved.status).toBe(200)
    expect(await json(approved)).toMatchObject({ status: 'replied', approved_at: expect.any(String) })
    const after = await json(await read(reviewer, request.id))
    expect(after.status).toBe('replied')
    expect(after.approved_at).toBe(after.replied_at)

    const [given] = await inOrg((tx) =>
      tx.query.approval.findMany({ where: (a, { eq }) => eq(a.evidenceRequestId, request.id) })
    )
    expect(given?.action).toBe('approve_reply')
    await expectOneAudit('evidence_reply.approved', { orgId, targetId: request.id })
    const entry = await expectLedgerEntry('evidence_replied', { orgId, projectId })
    expect(entry.refs).toEqual({ evidence_request_id: request.id, approval_id: given!.id })
    expect(Object.keys(entry.body as object).sort()).toEqual([
      'approved_at',
      'drafted_at',
      'pack_hash',
      'received_at',
      'replied_at'
    ])
    // An in-app reply sends nothing.
    expect(mailbox.sent).toEqual([])
  })

  test('a member’s request by MCP, key or app is answered in-app at once, with no approval', async () => {
    const asked = [
      asOAuth({ org: ORG, role: 'viewer', scopes: ['draft'] }),
      asApiKey({ org: ORG, role: 'editor', scopes: ['draft'] }),
      member()
    ]
    for (const as of asked) {
      const request = await json(await post(as))
      expect(request).toMatchObject({ status: 'replied', leaves_org: false, reply_channel: 'in_app' })
      expect(request.replied_at).toBe(request.drafted_at)
      expect(request.pack).toMatchObject({ project_id: projectId, readings: [], warnings: [], frames: [] })
      expect((await approve(approver(), request.id)).status).toBe(409)
    }
  })
})

test('a share-link reviewer by cookie waits for approval too, and sees only its own link’s requests', async () => {
  const link = asShareLink({ org: ORG, projectId, access: 'reviewer' })
  const request = await json(await post(link))
  expect(request).toMatchObject({ status: 'waiting_for_approval', via: 'app', leaves_org: true })
  expect((await read(link, request.id)).status).toBe(200)
  expect((await read(asShareLink({ org: ORG, projectId, access: 'reviewer' }), request.id)).status).toBe(404)
  expect((await read(member(), request.id)).status).toBe(200)
})

test('GST-6: a guest’s request is answered in-app as not reviewed, with no notice, approval or email', async () => {
  for (const guest of [
    asSession({ org: ORG, role: 'viewer', guest: true }),
    asGuestToken({ org: ORG, scopes: ['draft'] })
  ]) {
    const request = await json(await post(guest))
    expect(request).toMatchObject({ status: 'not_reviewed', leaves_org: false, reply_channel: 'in_app' })
    expect((await approve(approver(), request.id)).status).toBe(409)
    const rows = await inOrg(async (tx) => ({
      notices: await tx.query.notice.findMany({
        where: (n, { eq }) => eq(n.idempotencyKey, `evidence_reply:${request.id}`)
      }),
      approvals: await tx.query.approval.findMany({ where: (a, { eq }) => eq(a.evidenceRequestId, request.id) })
    }))
    expect(rows).toEqual({ notices: [], approvals: [] })
    // Another guest can't read it.
    expect((await read(asSession({ org: ORG, role: 'viewer', guest: true }), request.id)).status).toBe(404)
  }
  expect(mailbox.sent).toEqual([])
})

test('PRJ-6: the 11th request on a reviewer link that day answers 429 budget-exhausted with the reset time', async () => {
  const link = asShareLink({ org: ORG, projectId, access: 'reviewer' })
  const key = crypto.randomUUID()
  for (let i = 0; i < REVIEWER_EVIDENCE_PER_DAY; i++)
    expect((await post(link, { span }, projectId, key)).status).toBe(202)
  // A replayed Idempotency-Key answers from the first request and spends nothing.
  expect(spent.get(link.kind === 'share_link' ? link.linkId : '')).toBe(1)
  for (let i = 1; i < REVIEWER_EVIDENCE_PER_DAY; i++) expect((await post(link)).status).toBe(202)
  const refused = await post(link)
  expect(refused.status).toBe(429)
  expect(refused.headers.get('Retry-After')).toBe(String((Date.parse(RESETS_AT) - TEST_NOW.getTime()) / 1000))
  expect(await refused.json()).toMatchObject({
    type: 'https://docs.skyclause.m1ku.tech/problems/budget-exhausted',
    resets_at: RESETS_AT
  })
})

describe('LED-3: every evidence_reply notice has an approve_reply approval', () => {
  test('an emailed request sends nothing until approved, then one reply from notices with its notice sent', async () => {
    const { request, subscriber } = await subscriberRequest()
    expect(request).toMatchObject({ status: 'waiting_for_approval', replyChannel: 'email', leavesOrg: true })
    const queued = () =>
      inOrg((tx) =>
        tx.query.notice.findMany({ where: (n, { eq }) => eq(n.idempotencyKey, `evidence_reply:${request.id}`) })
      )
    expect(await queued()).toEqual([])
    expect(mailbox.sent).toEqual([])

    expect((await approve(approver(), request.id)).status).toBe(200)
    expect(mailbox.sent).toHaveLength(1)
    const [email] = mailbox.sent
    expect(email).toMatchObject({
      to: subscriber.email,
      from: 'notices',
      category: 'evidence_reply',
      idempotencyKey: `evidence_reply:${request.id}`
    })
    expect(email!.text).toContain('Skyclause is not a safety or emergency service. In an emergency, call 999.')
    expect(email!.text).toContain('Not affiliated with APU')
    expect(email!.text).toContain('No warning record for this window.')
    expect(email!.text).toContain('2 November 2026, 14:00 MYT')
    const [sent] = await queued()
    expect(sent).toMatchObject({
      kind: 'evidence_reply',
      channel: 'email',
      subscriberId: subscriber.id,
      language: 'en',
      status: 'sent',
      providerMessageId: 'mailbox-1'
    })
    expect((await approve(approver(), request.id)).status).toBe(409)
    expect(mailbox.sent).toHaveLength(1)
  })

  test('a Malay subscriber gets the Malay text; a failed send leaves the notice failed and the reply committed', async () => {
    const { request } = await subscriberRequest('ms')
    mailbox = {
      sent: [],
      async send() {
        throw new Error('SES SendEmail failed: MessageRejected (HTTP 400)')
      }
    }
    const approved = await approve(approver(), request.id)
    expect(approved.status).toBe(200)
    expect((await json(approved)).status).toBe('replied')
    const [failed] = await inOrg((tx) =>
      tx.query.notice.findMany({ where: (n, { eq }) => eq(n.idempotencyKey, `evidence_reply:${request.id}`) })
    )
    expect(failed).toMatchObject({ status: 'failed', language: 'ms', providerMessageId: null })

    mailbox = createMailbox()
    const malay = await subscriberRequest('ms')
    await approve(approver(), malay.request.id)
    expect(mailbox.sent[0]!.subject).toMatch(/^Bukti untuk /)
    expect(mailbox.sent[0]!.text).toContain('Skyclause bukan perkhidmatan keselamatan atau kecemasan.')
  })

  test('an address that unsubscribed or is suppressed since asking gets no mail; its notice reads suppressed', async () => {
    const unsubscribed = await subscriberRequest()
    const suppressed = await subscriberRequest()
    await inOrg(async (tx) => {
      await tx
        .update(subscriberTable)
        .set({ unsubscribedAt: TEST_NOW })
        .where(drizzleEq(subscriberTable.id, unsubscribed.subscriber.id))
      await tx
        .update(subscriberTable)
        .set({ emailHash: 'hash-of-a-bounced-address' })
        .where(drizzleEq(subscriberTable.id, suppressed.subscriber.id))
      await makeSuppression(tx, { emailHash: 'hash-of-a-bounced-address', reason: 'bounce' })
    })
    for (const { request } of [unsubscribed, suppressed]) {
      expect((await approve(approver(), request.id)).status).toBe(200)
      const [held] = await inOrg((tx) =>
        tx.query.notice.findMany({ where: (n, { eq }) => eq(n.idempotencyKey, `evidence_reply:${request.id}`) })
      )
      expect(held?.status).toBe('suppressed')
    }
    expect(mailbox.sent).toEqual([])
  })

  test('across the organisation, no evidence_reply notice lacks its approve_reply approval', async () => {
    const replies = await inOrg((tx) =>
      tx.query.notice.findMany({ where: (n, { eq }) => eq(n.kind, 'evidence_reply') })
    )
    expect(replies.length).toBeGreaterThan(0)
    for (const reply of replies) {
      const requestId = reply.idempotencyKey.replace(/^evidence_reply:/, '')
      const approvals = await inOrg((tx) =>
        tx.query.approval.findMany({
          where: (a, { and, eq }) => and(eq(a.evidenceRequestId, requestId), eq(a.action, 'approve_reply'))
        })
      )
      expect(approvals, reply.id).toHaveLength(1)
    }
  })
})

test('two Approvers at once: one approval commits, the other answers 409', async () => {
  const { request } = await subscriberRequest()
  const answers = await Promise.all([approve(approver(), request.id), approve(approver(), request.id)])
  expect(answers.map((r) => r.status).sort()).toEqual([200, 409])
  const approvals = await inOrg((tx) =>
    tx.query.approval.findMany({ where: (a, { eq }) => eq(a.evidenceRequestId, request.id) })
  )
  expect(approvals).toHaveLength(1)
  expect(mailbox.sent).toHaveLength(1)
})

test('LED-6: every request has received ≤ drafted ≤ approved ≤ replied, null only where a step doesn’t apply', async () => {
  const rows = await inOrg((tx) => tx.query.evidenceRequest.findMany({ where: (r, { eq }) => eq(r.orgId, orgId) }))
  expect(rows.length).toBeGreaterThan(10)
  for (const row of rows) {
    const times = [row.receivedAt, row.draftedAt, row.approvedAt, row.repliedAt]
    const present = times.filter((time): time is Date => time !== null).map((time) => time.getTime())
    expect(present, row.id).toEqual([...present].sort((a, b) => a - b))
    expect(row.draftedAt, row.id).not.toBeNull()
    if (row.status === 'waiting_for_approval') expect([row.approvedAt, row.repliedAt]).toEqual([null, null])
    else expect(row.repliedAt, row.id).not.toBeNull()
    expect(row.approvedAt !== null, row.id).toBe(row.leavesOrg && row.status === 'replied')
  }
})

describe('listEvidenceRequests', () => {
  const list = (as: Principal, project: string, query?: Record<string, string>) =>
    apiRequest(v1, { as, method: 'GET', path: `/v1/projects/${project}/evidence-requests`, org: ORG, query })
  type Listed = { data: Array<Record<string, unknown> & { id: string }>; next_cursor: string | null }

  test('members page the project’s requests newest first, without packs; guests and links see their own', async () => {
    const own = await inOrg(async (tx) => (await makeProject(tx)).id)
    const link = asShareLink({ org: ORG, projectId: own, access: 'reviewer' })
    const guest = asSession({ org: ORG, role: 'viewer', guest: true })
    const ids: string[] = []
    for (const as of [member(), link, member(), guest]) ids.push((await json(await post(as, { span }, own))).id)

    const first = (await (await list(member(), own, { limit: '3' })).json()) as Listed
    expect(first.data.map((r) => r.id)).toEqual([...ids].reverse().slice(0, 3))
    expect(first.data[0]).not.toHaveProperty('pack')
    expect(first.data[0]).toMatchObject({ project_id: own, status: 'not_reviewed', span })
    const rest = (await (await list(member(), own, { limit: '3', cursor: first.next_cursor! })).json()) as Listed
    expect(rest).toEqual({ data: [expect.objectContaining({ id: ids[0] })], next_cursor: null })

    const linkOwn = (await (await list(link, own)).json()) as Listed
    expect(linkOwn.data.map((r) => r.id)).toEqual([ids[1]])
    const guestOwn = (await (await list(guest, own)).json()) as Listed
    expect(guestOwn.data.map((r) => r.id)).toEqual([ids[3]])
  })

  test('a cursor this API didn’t issue is 422; an unknown project is 404', async () => {
    expect((await list(member(), projectId, { cursor: 'not-a-cursor' })).status).toBe(422)
    expect((await list(member(), crypto.randomUUID())).status).toBe(404)
  })
})

describe('requests', () => {
  test('a window names its span and the pack’s window; an unknown window or call is 404', async () => {
    const window = await inOrg((tx) =>
      makeWindow(tx, { projectId, startsAt: new Date(span.from), endsAt: new Date(span.to) })
    )
    const request = await json(await post(member(), { window_id: window.id }))
    expect(request).toMatchObject({ span, pack: { window_id: window.id } })
    expect((await post(member(), { window_id: crypto.randomUUID() })).status).toBe(404)
    expect((await post(member(), { call_id: crypto.randomUUID() })).status).toBe(404)
  })

  test('a span with a call lists it as #150’s call view, not 501', async () => {
    const scene = await inOrg(async (tx) => {
      const own = (await makeProject(tx)).id
      const window = await makeWindow(tx, { projectId: own, startsAt: new Date(span.from), endsAt: new Date(span.to) })
      const bundle = await makeBundle(tx, { runId: (await makeRun(tx, { projectId: own })).id })
      const shadow = {
        scope: { kind: 'window', id: window.id },
        pack: 'sky',
        mode: 'normal',
        watch: false,
        no_call: null,
        recommendations: [],
        clauses: [],
        open_from: null
      }
      const made = await makeCall(tx, { projectId: own, bundleId: bundle.id, windowId: window.id, shadow })
      return { own, made }
    })
    const response = await post(member(), { span }, scene.own)
    expect(response.status).toBe(202)
    const { pack } = (await response.json()) as { pack: { calls: { id: string; bundle_id: string }[] } }
    expect(pack.calls).toMatchObject([{ id: scene.made.id, bundle_id: scene.made.bundleId }])
  })

  test('a span must end after it starts and cover at most 31 days (422)', async () => {
    for (const bad of [
      { from: span.to, to: span.from },
      { from: '2026-10-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }
    ]) {
      const response = await post(member(), { span: bad })
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ in: 'body', pointer: '/span' }] })
    }
  })

  test('the same Idempotency-Key replays the first answer and makes one request', async () => {
    const key = crypto.randomUUID()
    const as = member()
    const first = await json(await post(as, { span }, projectId, key))
    const again = await json(await post(as, { span }, projectId, key))
    expect(again.id).toBe(first.id)
    const rows = await inOrg((tx) => tx.query.evidenceRequest.findMany({ where: (r, { eq }) => eq(r.id, first.id) }))
    expect(rows).toHaveLength(1)
  })
})

describe('denials', () => {
  test('a read-only API key is refused with 403 insufficient-scope on every /v1 operation', async () => {
    const key = asApiKey({ org: ORG, role: 'owner', scopes: ['read'] })
    const request = await json(await post(member()))
    const listing = await apiRequest(v1, {
      as: key,
      method: 'GET',
      path: `/v1/projects/${projectId}/evidence-requests`,
      org: ORG
    })
    for (const response of [await post(key), await read(key, request.id), listing]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({
        type: 'https://docs.skyclause.m1ku.tech/problems/insufficient-scope'
      })
    }
  })

  test('Viewers and Editors are refused on approve, and the refusal is audited (GST-7)', async () => {
    const { request } = await subscriberRequest()
    for (const role of ['viewer', 'editor'] as const) {
      expect((await approve(asSession({ org: ORG, role }), request.id)).status).toBe(403)
    }
    const audits = await inOrg((tx) =>
      tx.query.auditEvent.findMany({
        where: (a, { and, eq }) => and(eq(a.action, 'bundle.approve_denied'), eq(a.targetId, request.id))
      })
    )
    expect(audits).toHaveLength(2)
    expect(mailbox.sent).toEqual([])
  })

  test('API keys and tokens get 403 on /api', async () => {
    const { request } = await subscriberRequest()
    for (const as of [
      asApiKey({ org: ORG, role: 'owner', scopes: ['draft'] }),
      asOAuth({ org: ORG, role: 'owner', resource: 'api', scopes: ['draft'] }),
      asGuestToken({ org: ORG, scopes: ['draft'] }),
      asShareLink({ org: ORG, projectId, access: 'reviewer' })
    ]) {
      expect((await approve(as, request.id)).status).toBe(403)
    }
  })

  test.each([
    ['listEvidenceRequests', 'v1'],
    ['createEvidenceRequest', 'v1'],
    ['getEvidenceRequest', 'v1'],
    ['approveEvidenceRequest', 'api']
  ] as const)('%s answers 404 for another organisation’s rows', async (operationId, surface) => {
    const other = testOrg(OTHER).id
    const theirs = await withTenant({ orgId: other, principal: memberOf(other) }, async (tx) => {
      const project = await makeProject(tx)
      const subscriber = await makeSubscriber(tx, { projectId: project.id, confirmedAt: TEST_NOW })
      const row = await draftEvidenceRequest(
        tx,
        {
          projectId: project.id,
          from: new Date(span.from),
          to: new Date(span.to),
          windowId: null,
          callId: null,
          requester: { kind: 'subscriber', id: subscriber.id, accountId: null, subscriberId: subscriber.id },
          via: 'email',
          leavesOrg: true,
          replyChannel: 'email',
          receivedAt: TEST_NOW
        },
        TEST_NOW
      )
      return { projectId: project.id, requestId: row!.id }
    })
    const onProject = operationId === 'createEvidenceRequest' || operationId === 'listEvidenceRequests'
    const params = { id: onProject ? theirs.projectId : theirs.requestId }
    const as = operationId === 'approveEvidenceRequest' ? approver() : member()
    await crossOrgCase(operationId, {
      app: surface === 'v1' ? v1 : api,
      as,
      org: ORG,
      params,
      body: operationId === 'createEvidenceRequest' ? { span } : undefined
    }).run()
  })
})

test('a reading without a poll or a unit is served in the pack as stored (Reading’s nullable fields)', async () => {
  const own = await inOrg(async (tx) => {
    const project = await makeProject(tx)
    const camera = await makeProjectSource(tx, { projectId: project.id })
    const at = new Date('2026-11-02T07:00:00Z')
    const contrast = await makeReading(tx, {
      sourceId: camera.sourceId,
      metric: 'contrast_far',
      unit: 'ratio',
      value: 0.4,
      observedAt: at
    })
    const note = await makeReading(tx, {
      sourceId: camera.sourceId,
      pollId: (await makePoll(tx, { sourceId: camera.sourceId })).id,
      metric: 'note',
      unit: null,
      value: null,
      valueText: 'lens cleaned',
      observedAt: at
    })
    return { projectId: project.id, contrast: contrast.id, note: note.id }
  })
  // The mount checks every response against its schema outside production, so a 202 means the pack validated.
  const created = await post(member(), { span }, own.projectId)
  expect(created.status).toBe(202)
  const { pack } = (await created.json()) as { pack: { readings: Array<Record<string, unknown>> } }
  expect(pack.readings.map((r) => [r.id, r.poll_id === null, r.unit])).toEqual(
    expect.arrayContaining([
      [own.contrast, true, 'ratio'],
      [own.note, false, null]
    ])
  )
})

test('held frames get a signed URL on each read, kept out of the stored pack', async () => {
  const own = await inOrg(async (tx) => {
    const project = await makeProject(tx)
    const camera = await makeProjectSource(tx, { projectId: project.id })
    const poll = await makePoll(tx, { sourceId: camera.sourceId })
    const frame = await makeReading(tx, {
      sourceId: camera.sourceId,
      pollId: poll.id,
      metric: 'flag',
      unit: null,
      value: null,
      observedAt: new Date('2026-11-02T07:00:00Z'),
      valueJson: { capture_id: 'c1', object_path: `orgs/${orgId}/frames/c1.jpg`, buffered: false, distance_km: 2.1 }
    })
    return { projectId: project.id, frameId: frame.id }
  })
  const created = await json(await post(member(), { span }, own.projectId))
  const url = `https://frames.example.test/orgs/${orgId}/frames/c1.jpg?expires=${new Date(TEST_NOW.getTime() + 3_600_000).toISOString()}`
  expect(created.pack).toMatchObject({
    frames: [{ reading_id: own.frameId, url, captured_at: '2026-11-02T07:00:00Z' }]
  })
  expect((await json(await read(member(), created.id))).pack).toMatchObject({ frames: [{ url }] })
  const [stored] = await inOrg((tx) =>
    tx.query.evidenceRequest.findMany({ where: (r, { eq }) => eq(r.id, created.id) })
  )
  expect((stored!.pack as { frames: unknown[] }).frames).toEqual([
    { reading_id: own.frameId, object_path: `orgs/${orgId}/frames/c1.jpg`, captured_at: '2026-11-02T07:00:00Z' }
  ])
})
