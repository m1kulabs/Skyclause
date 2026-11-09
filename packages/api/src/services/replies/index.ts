import { isFlagEnabled, recordCrowdReply, recordPlanFeedback, systemPrincipal, type Tx } from '@skyclause/db'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { linkExpired } from '../subscribers'

// #163 (c-recipient-replies): a Crowd recipient's reply and a subscriber's plan feedback, each through its link token.
// The routes verify the token, then call these in its organisation as `REPLY_PRINCIPAL`.

/** Who acts for a reply or feedback link holder, who has no account. */
export const REPLY_PRINCIPAL = systemPrincipal('replies')

export type CrowdReply = { kind: 'keep' } | { kind: 'shift'; shift_to: string } | { kind: 'shuttle' }

/** The reply token's subject: its project, subscriber's token row, call and window. */
export interface ReplyTarget {
  orgId: string
  projectId: string
  tokenId: string
  callId: string
  windowId: string
}

/**
 * 422 for any body field beyond the operation's, so no free text reaches a row (ANL-7). The contract's schemas drop
 * unknown keys, so this reads what was sent.
 */
export function refuseExtraFields(sent: unknown, allowed: readonly string[]) {
  const extra = sent && typeof sent === 'object' ? Object.keys(sent).filter((key) => !allowed.includes(key)) : []
  if (extra.length) {
    throw new ApiError(422, 'validation-failed', `This answer takes only ${allowed.join(' and ')}.`, {
      errors: extra.map((key) => ({ in: 'body', pointer: `/${key}`, detail: 'Not part of the answer' }))
    })
  }
}

/** CAL-17: logs the reply once; 403 while Crowd is off, 410 once the token is spent or the window has ended. */
export async function replyToCall(ctx: ServiceContext, input: { target: ReplyTarget; reply: CrowdReply; now: Date }) {
  const tx = ctx.tx as Tx
  const { target, reply, now } = input
  if (!(await isFlagEnabled(tx, 'pack_crowd', target.orgId))) {
    throw new ApiError(403, 'feature-off', 'Crowd notices are off for this organisation.')
  }
  const recorded = await recordCrowdReply(tx, {
    ...target,
    kind: reply.kind,
    shiftTo: reply.kind === 'shift' ? reply.shift_to : null,
    at: now,
    now
  })
  if (typeof recorded === 'string') throw linkExpired()
  return { id: recorded.id, window_id: target.windowId, reply, at: instant(now) }
}

/** ANL-7: counts the answer once against the token's window; 410 once the token is spent. */
export async function answerFeedback(
  ctx: ServiceContext,
  input: { target: Omit<ReplyTarget, 'callId'>; answer: boolean }
) {
  const { target, answer } = input
  const counted = await recordPlanFeedback(ctx.tx as Tx, { ...target, answer })
  if (!counted) throw linkExpired()
  return { window_id: target.windowId, answer, count: counted.count }
}
