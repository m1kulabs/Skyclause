// #158 test helpers: a call approved the way #153 (PR #437) leaves it (approved by an Approver, `sending`, one queued
// `call` notice per recipient keyed like its `noticeIdempotencyKey`, `bundle.approved` emitted; a rejected call stays
// `rejected` in an `approved` bundle), a mailbox double for SES and the sender's injected clock. Tests only (NFR-15).
import { createHash, randomUUID } from 'node:crypto'
import type { EmailTransport, EventEnvelope, Pack } from '@skyclause/contracts'
import { createBundle, emitEvent, markSending, systemPrincipal, transition, withTenant, type Tx } from '@skyclause/db'
import { bundleScene, callDraft, runOf, windowOf } from '@skyclause/db/test/bundles/scene'
import { makeMember, makeNotice, makeSubscriber } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import type { EmailMessage } from '@skyclause/delivery'
import { createNoticesPart, type NoticesDeps } from '../src/notices'

export const at = (iso: string) => new Date(iso)
/** 2 November 2026: drafted 15:06 MYT, approved 15:10, for the 15:30–16:30 release wave. */
export const APPROVED_AT = at('2026-11-02T07:10:00Z')
export const WINDOW = { startsAt: at('2026-11-02T07:30:00Z'), endsAt: at('2026-11-02T08:30:00Z') }
export const ORIGINS = { appOrigin: 'https://app.skyclause.m1ku.tech', marketingOrigin: 'https://skyclause.m1ku.tech' }
export const INBOUND_DOMAIN = 'in.skyclause.m1ku.tech'
export const EVENTS_TOPIC = 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events'

export const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

export interface Recipient {
  email?: string
  language?: 'en' | 'ms'
  confirmed?: boolean
  unsubscribed?: boolean
}

/** One approved call to `recipients`, as #153 hands it to the sender; returns its IDs and its `bundle.approved`. */
export async function approvedCall(
  orgId: string,
  o: {
    pack?: Pack
    recipients: Recipient[]
    projectId?: string
    window?: typeof WINDOW
    /** A No call: mode null, with the input that blocks it. */
    noCall?: boolean
    /** The approver rejects the bundle's only call. */
    rejected?: boolean
  }
) {
  const pack = o.pack ?? 'sky'
  const approver = await makeMember({ organizationId: orgId, role: 'approver' })
  return inOrg(orgId, async (tx) => {
    const scene = await bundleScene(tx, { pack, projectId: o.projectId })
    const span = o.window ?? WINDOW
    const w = await windowOf(tx, scene, span.startsAt, span.endsAt)
    const r = await runOf(tx, scene, at('2026-11-02T07:05:00Z'))
    const made = await createBundle(tx, {
      runId: r.id,
      pack,
      draftOnly: false,
      calls: [
        callDraft({
          windowId: w.id,
          mode: o.noCall ? null : pack === 'crowd' ? 'surge_night' : 'commute_disruption',
          noCall: o.noCall ? ['site.rain_60m_mm'] : null,
          fired: [{ clause: pack === 'crowd' ? 'surge_night' : 'storm_confirmed', inputs: ['site.rain_60m_mm'] }],
          notices: [
            { language: 'en', subject: 'Commute disruption', body: 'Why: Storm confirmed at the gauge.' },
            { language: 'ms', subject: 'Gangguan perjalanan', body: 'Sebab: Ribut disahkan di tolok.' }
          ]
        })
      ],
      triggeredAt: r.triggeredAt,
      now: at('2026-11-02T07:06:00Z')
    })
    const callId = made.callIds[0]!
    await transition(
      tx,
      made.bundleId,
      { bundle: 'approved', calls: { [callId]: o.rejected ? 'rejected' : 'approved' }, approvedBy: approver.userId },
      APPROVED_AT
    )
    if (!o.rejected) await markSending(tx, made.bundleId, [callId], APPROVED_AT)
    const subscribers = []
    for (const recipient of o.recipients) {
      const s = await makeSubscriber(tx, {
        projectId: scene.projectId,
        email: recipient.email ?? `${randomUUID()}@example.test`,
        language: recipient.language ?? 'en',
        confirmedAt: recipient.confirmed === false ? null : at('2026-11-01T00:00:00Z'),
        unsubscribedAt: recipient.unsubscribed ? at('2026-11-01T12:00:00Z') : null
      })
      const idempotencyKey = createHash('sha256').update(`${made.bundleId}:${callId}:${s.id}:email`).digest('hex')
      const n = await makeNotice(tx, {
        projectId: scene.projectId,
        callId,
        subscriberId: s.id,
        language: s.language,
        idempotencyKey
      })
      subscribers.push({ ...s, noticeId: n.id, idempotencyKey })
    }
    const data = {
      bundle_id: made.bundleId,
      pack,
      state: 'approved' as const,
      call_ids: made.callIds,
      sla_due_at: null,
      sending_call_ids: o.rejected ? [] : [callId],
      rejected_call_ids: o.rejected ? [callId] : []
    }
    const emitted = await emitEvent(tx, { projectId: scene.projectId, type: 'bundle.approved', data })
    const event: EventEnvelope = {
      id: emitted.id,
      type: 'bundle.approved',
      created_at: APPROVED_AT.toISOString(),
      org_id: orgId,
      project_id: scene.projectId,
      data
    }
    return { projectId: scene.projectId, bundleId: made.bundleId, callId, windowId: w.id, subscribers, event }
  })
}

/** SES as the sender sees it: records each message and answers a fresh message ID, or fails as SES would. */
export function mailbox(o: { fail?: () => boolean; delayMs?: number } = {}) {
  const sent: EmailMessage[] = []
  const box = { sent, started: 0, transport: undefined as unknown as EmailTransport }
  box.transport = {
    async send(m) {
      box.started++
      if (o.delayMs) await new Promise((resolve) => setTimeout(resolve, o.delayMs))
      if (o.fail?.()) throw new Error('SES SendEmail failed: MessageRejected (HTTP 400)')
      sent.push(m)
      return { providerMessageId: `0108${randomUUID().replace(/-/g, '')}-000000` }
    }
  }
  return box
}

/** The part on a mailbox and a clock the test moves. */
export function senderPart(box: ReturnType<typeof mailbox> | null, extra: Partial<NoticesDeps> = {}) {
  const clock = { now: at('2026-11-02T07:10:05Z') }
  const part = createNoticesPart({
    email: () => box?.transport ?? null,
    config: () => ({
      ...ORIGINS,
      inboundDomain: INBOUND_DOMAIN,
      sesRegion: 'ap-southeast-2',
      eventsTopicArn: EVENTS_TOPIC
    }),
    now: () => clock.now,
    ...extra
  })
  const consumer = part.events!.find((c) => c.consumer === 'sender')!
  return {
    clock,
    part,
    approve: (event: EventEnvelope) => consumer.handler(event),
    sweep: () => part.batch!['notice-sweep']!(clock.now),
    sesEvents: (body: unknown) =>
      part.ses!['/events']!(
        new Request('https://worker.test/ses/events', { method: 'POST', body: JSON.stringify(body) }),
        {}
      )
  }
}

export const sql = <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
  asLogin('postgres', async (client) => (await client.query<T>(text, params)).rows)

export const noticeRow = async (id: string) =>
  (
    await sql<{ status: string; provider_message_id: string | null; accepted_at: Date | null; attempts: number }>(
      'SELECT status, provider_message_id, accepted_at, attempts FROM notice WHERE id = $1',
      [id]
    )
  )[0]!

export const stateOf = async (table: 'call' | 'bundle', id: string) =>
  (await sql<{ state: string }>(`SELECT state FROM ${table} WHERE id = $1`, [id]))[0]!.state

/** The raw token in a message's `List-Unsubscribe` header. */
export const unsubscribeToken = (m: EmailMessage) =>
  /\/api\/subscribe\/([^/]+)\/unsubscribe>$/.exec(m.headers!['List-Unsubscribe']!)![1]!
