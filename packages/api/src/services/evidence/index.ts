import type { z } from '@hono/zod-openapi'
import type { BudgetGate, Can, EmailTransport, Operations, Principal } from '@skyclause/contracts'
import {
  approveEvidenceReply,
  draftEvidenceRequest,
  evidenceCall,
  evidenceProject,
  evidenceWindow,
  findEvidenceRequest,
  type DraftEvidenceInput,
  type EvidenceReplyNotice,
  type EvidenceRequestRow,
  type StoredEvidencePack
} from '@skyclause/db'
import { budgetGate } from '../../placeholders/d-guest-rules'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext, WithTenant } from '../../tenancy'
import { deliverSubscriberEmail } from '../subscribers'
import { signFrameUrl, type FrameUrlSigner } from './transports'
import { renderEvidenceReply } from './reply'

// #159 c-evidence: evidence requests by app, `/v1` (SDK, CLI, MCP) and email, and their approval (#79 §4, LED-3 to
// LED-6). Who asked, the channel and whether the reply leaves the organisation come from the principal, never the body.

type Ok<Id extends 'getEvidenceRequest' | 'approveEvidenceRequest'> = z.infer<
  Operations[Id]['responses'][200]['content']['application/json']['schema']
>
/** Also `createEvidenceRequest`'s 202 body. */
export type EvidenceRequestView = Ok<'getEvidenceRequest'>
export type EvidenceRequestSummary = Ok<'approveEvidenceRequest'>

export interface EvidenceRequestInput {
  span?: { from: string; to: string }
  call_id?: string | null
  window_id?: string
}

/** The services' reach outside the database and `ApiDeps`: d-guest-rules' budgets and frame URLs. Tests swap them. */
export interface EvidenceSeams {
  budget: BudgetGate
  signFrameUrl: FrameUrlSigner
}

let seams: EvidenceSeams = { budget: budgetGate, signFrameUrl }

/** Replaces some seams; returns the previous ones so a test can put them back. */
export function setEvidenceSeams(next: Partial<EvidenceSeams>): EvidenceSeams {
  const previous = seams
  seams = { ...seams, ...next }
  return previous
}

const FRAME_URL_MS = 60 * 60_000
// Ticket decision: a request covers at most 31 days, which bounds the stored pack.
const MAX_SPAN_MS = 31 * 86_400_000

const notFound = () => new ApiError(404, 'not-found', 'No such evidence request, or you can’t see it.')
const invalid = (pointer: string, detail: string) =>
  new ApiError(422, 'validation-failed', 'The request is invalid.', { errors: [{ in: 'body', pointer, detail }] })

type Requester = Pick<DraftEvidenceInput, 'requester' | 'via' | 'leavesOrg' | 'replyChannel'> & { budgeted: boolean }

/**
 * Ticket decisions: a member's request (session, API key, member OAuth) is answered in-app at once; a guest's too, as
 * "Not reviewed" (GST-6); a share-link reviewer's, by cookie or link-bound OAuth, leaves the organisation and waits
 * for an Approver. Guests and links spend the day's evidence budget.
 */
function requesterOf(p: Principal): Requester {
  const via = p.client === 'mcp' ? 'mcp' : p.client === 'app' ? 'app' : 'api'
  const inApp = { via, replyChannel: 'in_app' } as const
  const person = (kind: 'member' | 'guest', accountId: string) => ({
    kind,
    id: accountId,
    accountId,
    subscriberId: null
  })
  switch (p.kind) {
    case 'session':
      return p.isGuest
        ? { ...inApp, requester: person('guest', p.accountId), leavesOrg: false, budgeted: true }
        : { ...inApp, requester: person('member', p.accountId), leavesOrg: false, budgeted: false }
    case 'guest_token':
      return { ...inApp, requester: person('guest', p.accountId), leavesOrg: false, budgeted: true }
    case 'api_key':
      return { ...inApp, requester: person('member', p.accountId), leavesOrg: false, budgeted: false }
    case 'oauth':
      return p.shareLinkId
        ? {
            ...inApp,
            requester: { kind: 'share_link', id: p.shareLinkId, accountId: p.accountId, subscriberId: null },
            leavesOrg: true,
            budgeted: true
          }
        : { ...inApp, requester: person('member', p.accountId), leavesOrg: false, budgeted: false }
    case 'share_link':
      return {
        ...inApp,
        requester: { kind: 'share_link', id: p.linkId, accountId: null, subscriberId: null },
        leavesOrg: true,
        budgeted: true
      }
    default:
      throw new ApiError(403, 'insufficient-scope', 'This principal can’t request evidence.')
  }
}

/** Members see every request in the projects they can see; guests and share links only their own. */
function canSee(p: Principal, row: EvidenceRequestRow) {
  if (p.kind === 'guest_token' || (p.kind === 'session' && p.isGuest)) return row.accountId === p.accountId
  if (p.kind === 'share_link') return row.requesterKind === 'share_link' && row.requester === p.linkId
  if (p.kind === 'oauth' && p.shareLinkId) return row.requesterKind === 'share_link' && row.requester === p.shareLinkId
  return true
}

function summary(row: EvidenceRequestRow): EvidenceRequestSummary {
  const at = (date: Date | null) => (date ? instant(date) : null)
  return {
    id: row.id,
    project_id: row.projectId,
    span: { from: instant(row.spanFrom), to: instant(row.spanTo) },
    requester: row.requester,
    call_id: row.callId,
    via: row.via,
    leaves_org: row.leavesOrg,
    reply_channel: row.replyChannel,
    status: row.status,
    received_at: instant(row.receivedAt),
    drafted_at: at(row.draftedAt),
    approved_at: at(row.approvedAt),
    replied_at: at(row.repliedAt)
  }
}

/** The request with its pack; each held frame gets a URL valid for an hour from `now`, outside the pack's hash. */
async function view(row: EvidenceRequestRow, now: Date): Promise<EvidenceRequestView> {
  const stored = row.pack as StoredEvidencePack | null
  if (!stored) return { ...summary(row), pack: null }
  const expiresAt = new Date(now.getTime() + FRAME_URL_MS)
  const frames = await Promise.all(
    stored.frames.map(async (frame) => ({
      reading_id: frame.reading_id,
      url: await seams.signFrameUrl(frame.object_path, expiresAt),
      captured_at: frame.captured_at
    }))
  )
  return { ...summary(row), pack: { ...stored, frames } }
}

interface Deps {
  can: Can
  now: Date
}

/** `POST /v1/projects/{id}/evidence-requests`: drafts the pack at once from stored rows (202). */
export async function createEvidenceRequest(
  ctx: ServiceContext,
  deps: Deps,
  input: EvidenceRequestInput & { projectId: string }
): Promise<EvidenceRequestView> {
  const p = ctx.principal
  const project = await evidenceProject(ctx.tx, input.projectId)
  if (!project || !deps.can(p, 'evidence.request', { projectId: project.id })) {
    throw new ApiError(404, 'not-found', 'No such project, or you can’t request evidence for it.')
  }
  const window = input.window_id ? await evidenceWindow(ctx.tx, project.id, input.window_id) : null
  if (input.window_id && !window) throw new ApiError(404, 'not-found', 'No such window in this project.')
  const call = input.call_id ? await evidenceCall(ctx.tx, project.id, input.call_id) : null
  if (input.call_id && !call) throw new ApiError(404, 'not-found', 'No such call in this project.')
  const span = input.span ? { from: new Date(input.span.from), to: new Date(input.span.to) } : (window ?? call)!
  if (span.from >= span.to) throw invalid('/span', 'The span must end after it starts.')
  if (span.to.getTime() - span.from.getTime() > MAX_SPAN_MS) throw invalid('/span', 'A span covers at most 31 days.')

  const asked = requesterOf(p)
  if (asked.budgeted) {
    const budget = await seams.budget.consume(ctx.tx, p, 'evidence')
    if (!budget.ok) {
      const retryS = Math.max(1, Math.ceil((Date.parse(budget.resetsAt) - deps.now.getTime()) / 1000))
      throw new ApiError(
        429,
        'budget-exhausted',
        'Today’s evidence requests for this link or guest are used up.',
        { resets_at: budget.resetsAt },
        { 'Retry-After': String(retryS) }
      )
    }
  }
  const row = await draftEvidenceRequest(
    ctx.tx,
    {
      projectId: project.id,
      from: span.from,
      to: span.to,
      windowId: input.window_id ?? call?.windowId ?? null,
      callId: call?.id ?? null,
      requester: asked.requester,
      via: asked.via,
      leavesOrg: asked.leavesOrg,
      replyChannel: asked.replyChannel,
      receivedAt: deps.now
    },
    deps.now
  )
  return view(row!, deps.now)
}

async function visibleRequest(
  ctx: ServiceContext,
  can: Can,
  id: string,
  statement: 'evidence.request' | 'bundle.approve'
) {
  const row = await findEvidenceRequest(ctx.tx, id)
  if (!row || !can(ctx.principal, statement, { projectId: row.projectId }) || !canSee(ctx.principal, row)) {
    throw notFound()
  }
  return row
}

/** `GET /v1/evidence-requests/{id}`. */
export async function getEvidenceRequest(ctx: ServiceContext, deps: Deps, id: string): Promise<EvidenceRequestView> {
  return view(await visibleRequest(ctx, deps.can, id, 'evidence.request'), deps.now)
}

/** An approved email reply to render and send once the approval has committed. */
export interface EvidenceReplyOutbox {
  notice: EvidenceReplyNotice
  project: { name: string; timeZone: string }
  request: EvidenceRequestRow
}

/**
 * `POST /api/evidence-requests/{id}/approve` (`bundle.approve`, a session): commits the reply. An email reply comes
 * back as an outbox for `sendEvidenceReply` after commit; 409 unless the reply is waiting for approval.
 */
export async function approveEvidenceRequest(
  ctx: ServiceContext,
  deps: Deps,
  id: string
): Promise<{ request: EvidenceRequestSummary; outbox: EvidenceReplyOutbox | null }> {
  const p = ctx.principal
  if (p.kind !== 'session') throw new ApiError(403, 'insufficient-scope', 'Approving a reply needs a signed-in member.')
  const held = await visibleRequest(ctx, deps.can, id, 'bundle.approve')
  const approved = await approveEvidenceReply(ctx.tx, { id: held.id, actorId: p.accountId }, deps.now)
  if (!approved) throw new ApiError(409, 'conflict', 'This reply isn’t waiting for approval.')
  const project = (await evidenceProject(ctx.tx, held.projectId))!
  return {
    request: summary(approved.row),
    outbox: approved.notice ? { notice: approved.notice, project, request: approved.row } : null
  }
}

/**
 * Renders the approved reply from its stored pack and sends it through `EmailTransport` (`from: 'notices'`), recording
 * SES's answer on its notice: `sent`, or `failed` and logged, since the reply itself is already committed. #158's
 * `/ses/events` maps delivery from there.
 */
export async function sendEvidenceReply(
  deps: { email: EmailTransport; withTenant: WithTenant },
  principal: Principal,
  outbox: EvidenceReplyOutbox
) {
  const { subject, text } = renderEvidenceReply({
    project: outbox.project,
    request: outbox.request,
    pack: outbox.request.pack as StoredEvidencePack,
    language: outbox.notice.language
  })
  const { noticeId, to, idempotencyKey } = outbox.notice
  await deliverSubscriberEmail(
    deps,
    principal,
    {
      orgId: outbox.request.orgId,
      noticeId,
      message: { to, from: 'notices', subject, text, category: 'evidence_reply', idempotencyKey }
    },
    { rethrow: false }
  )
}
