import { canonicalHash } from '@skyclause/clauses'
import type { TxHandle } from '@skyclause/contracts'
import { and, eq } from 'drizzle-orm'
import { track } from '../analytics'
import { recordAudit } from '../audit'
import type { Tx } from '../client'
import { emitEvent } from '../events'
import { appendLedger } from '../ledger'
import { approval, call, evidenceRequest, notice, project, subscriber, suppression, window } from '../schema'
import { assembleEvidencePack } from './pack'

// #159 c-evidence: the request's writes, shared by `/v1` and the inbound-email handler. Statuses: `drafted` →
// `waiting_for_approval` (a reply leaving the organisation) → `replied`; a guest's request is `not_reviewed` (GST-6).
// `replied_at` is when the reply is committed: in-app at drafting, or with the approval and its outbox row.

export type EvidenceRequestRow = typeof evidenceRequest.$inferSelect
export type EvidenceRequesterKind = EvidenceRequestRow['requesterKind']

export interface DraftEvidenceInput {
  projectId: string
  from: Date
  to: Date
  windowId: string | null
  callId: string | null
  requester: { kind: EvidenceRequesterKind; id: string; accountId: string | null; subscriberId: string | null }
  via: EvidenceRequestRow['via']
  /** True for email, share-link and link-bound OAuth requests: the reply waits for an Approver. */
  leavesOrg: boolean
  replyChannel: 'email' | 'in_app'
  receivedAt: Date
  /** The SES message ID of an emailed request; a second request for the same message is never made. */
  messageId?: string
}

const latest = (a: Date, b: Date) => (a > b ? a : b)
const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000

// The event's `reply_channel` (#79 §5) names where the answer is read: `email`, or the surface an in-app reply is read
// on, which is the one the request came from (an emailed member request's reply is read in the app).
const readOn = (row: EvidenceRequestRow) =>
  row.replyChannel === 'email' ? 'email' : row.via === 'email' ? 'app' : row.via

async function answered(tx: Tx, row: EvidenceRequestRow, approvalNeeded: boolean) {
  await emitEvent(tx, {
    projectId: row.projectId,
    type: 'evidence_request.answered',
    data: { evidence_request_id: row.id, reply_channel: readOn(row) }
  })
  await track(
    tx,
    'evidence_replied',
    { minutes: minutesBetween(row.receivedAt, row.repliedAt!), approval_needed: approvalNeeded },
    { projectId: row.projectId }
  )
}

/**
 * Records a request, assembles its pack once and stores it with `pack_hash`. A member's reply is committed at once; a
 * reply leaving the organisation waits for approval. Returns null when `messageId` already has a request.
 */
export async function draftEvidenceRequest(
  handle: TxHandle,
  input: DraftEvidenceInput,
  now: Date
): Promise<EvidenceRequestRow | null> {
  const tx = handle as Tx
  const insert = tx.insert(evidenceRequest).values({
    orgId: tx.orgId!,
    projectId: input.projectId,
    spanFrom: input.from,
    spanTo: input.to,
    requester: input.requester.id,
    requesterKind: input.requester.kind,
    accountId: input.requester.accountId,
    subscriberId: input.requester.subscriberId,
    messageId: input.messageId,
    callId: input.callId,
    via: input.via,
    leavesOrg: input.leavesOrg,
    replyChannel: input.replyChannel,
    receivedAt: input.receivedAt
  })
  const [received] = await (
    input.messageId ? insert.onConflictDoNothing({ target: evidenceRequest.messageId }) : insert
  ).returning({ id: evidenceRequest.id })
  if (!received) return null

  const pack = await assembleEvidencePack(tx, input)
  const draftedAt = latest(now, input.receivedAt)
  const guest = input.requester.kind === 'guest'
  const waits = input.leavesOrg
  const [row] = await tx
    .update(evidenceRequest)
    .set({
      pack,
      packHash: canonicalHash(pack),
      draftedAt,
      status: guest ? 'not_reviewed' : waits ? 'waiting_for_approval' : 'replied',
      repliedAt: waits ? null : draftedAt
    })
    .where(eq(evidenceRequest.id, received.id))
    .returning()
  await track(tx, 'evidence_requested', { via: input.via }, { projectId: input.projectId })
  if (!waits) await answered(tx, row!, false)
  return row!
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The project, if the transaction can see it: its name and time zone, for the reply. */
export async function evidenceProject(handle: TxHandle, projectId: string) {
  const tx = handle as Tx
  if (!UUID.test(projectId)) return null
  const [row] = await tx
    .select({ id: project.id, name: project.name, timeZone: project.timeZone })
    .from(project)
    .where(eq(project.id, projectId))
  return row ?? null
}

/** A window of the project and its span, or null. */
export async function evidenceWindow(handle: TxHandle, projectId: string, windowId: string) {
  const tx = handle as Tx
  if (!UUID.test(windowId)) return null
  const [row] = await tx
    .select({ id: window.id, from: window.startsAt, to: window.endsAt })
    .from(window)
    .where(and(eq(window.id, windowId), eq(window.projectId, projectId)))
  return row ?? null
}

/** A call of the project and the span it speaks for: its window's, else from its trigger to its expiry. */
export async function evidenceCall(handle: TxHandle, projectId: string, callId: string) {
  const tx = handle as Tx
  if (!UUID.test(callId)) return null
  const [row] = await tx
    .select({
      id: call.id,
      windowId: call.windowId,
      triggeredAt: call.triggeredAt,
      expiresAt: call.expiresAt,
      startsAt: window.startsAt,
      endsAt: window.endsAt
    })
    .from(call)
    .leftJoin(window, eq(window.id, call.windowId))
    .where(and(eq(call.id, callId), eq(call.projectId, projectId)))
  if (!row) return null
  return { id: row.id, windowId: row.windowId, from: row.startsAt ?? row.triggeredAt, to: row.endsAt ?? row.expiresAt }
}

/** The request, if the transaction can see it (RLS); `forUpdate` holds its row to commit. */
export async function findEvidenceRequest(handle: TxHandle, id: string, o: { forUpdate?: boolean } = {}) {
  const tx = handle as Tx
  if (!UUID.test(id)) return null
  const query = tx.select().from(evidenceRequest).where(eq(evidenceRequest.id, id))
  const [row] = await (o.forUpdate ? query.for('update') : query)
  return row ?? null
}

/** An approved email reply's outbox row, rendered and sent after commit. */
export interface EvidenceReplyNotice {
  noticeId: string
  idempotencyKey: string
  to: string
  language: 'en' | 'ms'
}

/**
 * An Approver's approval of a reply waiting for it, under the row lock: the `approve_reply` approval, the reply
 * committed (`approved_at = replied_at`), the ledger entry, the event, the audit row, and for an email reply its
 * `evidence_reply` notice. Returns null when the request isn't waiting for approval.
 */
export async function approveEvidenceReply(
  handle: TxHandle,
  q: { id: string; actorId: string },
  now: Date
): Promise<{ row: EvidenceRequestRow; approvalId: string; notice: EvidenceReplyNotice | null } | null> {
  const tx = handle as Tx
  const held = await findEvidenceRequest(tx, q.id, { forUpdate: true })
  if (held?.status !== 'waiting_for_approval') return null
  const [given] = await tx
    .insert(approval)
    .values({
      orgId: tx.orgId!,
      projectId: held.projectId,
      evidenceRequestId: held.id,
      actorId: q.actorId,
      action: 'approve_reply'
    })
    .returning({ id: approval.id })
  const at = latest(now, held.draftedAt!)
  const [row] = await tx
    .update(evidenceRequest)
    .set({ status: 'replied', approvedAt: at, repliedAt: at })
    .where(eq(evidenceRequest.id, held.id))
    .returning()
  const approvalId = given!.id
  await appendLedger(tx, {
    projectId: row!.projectId,
    kind: 'evidence_replied',
    refs: { evidence_request_id: row!.id, approval_id: approvalId },
    body: {
      received_at: row!.receivedAt.toISOString(),
      drafted_at: row!.draftedAt!.toISOString(),
      approved_at: at.toISOString(),
      replied_at: at.toISOString(),
      pack_hash: row!.packHash!
    }
  })
  await recordAudit(tx, {
    action: 'bundle.approved',
    target: { type: 'evidence_request', id: row!.id },
    projectId: row!.projectId,
    after: { status: 'replied', approval_id: approvalId }
  })
  await answered(tx, row!, true)

  let outbox: EvidenceReplyNotice | null = null
  if (row!.replyChannel === 'email') {
    const [to] = await tx
      .select({
        email: subscriber.email,
        language: subscriber.language,
        unsubscribedAt: subscriber.unsubscribedAt,
        suppressed: suppression.id
      })
      .from(subscriber)
      .leftJoin(suppression, eq(suppression.emailHash, subscriber.emailHash))
      .where(eq(subscriber.id, row!.subscriberId!))
    const language = to!.language === 'ms' ? 'ms' : 'en'
    const idempotencyKey = `evidence_reply:${row!.id}`
    // An address that unsubscribed, bounced or complained since asking gets no mail; the notice says so.
    const held = to!.unsubscribedAt !== null || to!.suppressed !== null
    const [queued] = await tx
      .insert(notice)
      .values({
        orgId: tx.orgId!,
        projectId: row!.projectId,
        kind: 'evidence_reply',
        channel: 'email',
        idempotencyKey,
        subscriberId: row!.subscriberId,
        language,
        ...(held ? { status: 'suppressed' as const } : {})
      })
      .returning({ id: notice.id })
    if (!held) outbox = { noticeId: queued!.id, idempotencyKey, to: to!.email, language }
  }
  return { row: row!, approvalId, notice: outbox }
}
