import type { PushSubscription } from '@skyclause/contracts'
import {
  listPushSubscriptions,
  ownPushEndpoint,
  registerPushSubscription,
  removePushSubscription,
  type pushSubscription,
  type Tx
} from '@skyclause/db'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

// #155 (c-approver-alerts): an approver's web push devices (D28), one row per browser and organisation
// (`push_subscription` is T). Each service acts in its context's organisation, on the caller's own rows only.

function accountOf(ctx: ServiceContext): string {
  if (ctx.principal.kind !== 'session') throw new Error('push subscriptions belong to a session’s account')
  return ctx.principal.accountId
}

const view = (row: typeof pushSubscription.$inferSelect): PushSubscription => ({
  id: row.id,
  account_id: row.accountId,
  endpoint: row.endpoint,
  p256dh: row.p256dh,
  auth: row.auth,
  user_agent: row.userAgent ?? '',
  last_ok_at: row.lastOkAt && instant(row.lastOkAt)
})

export async function myPushSubscriptions(ctx: ServiceContext): Promise<PushSubscription[]> {
  return (await listPushSubscriptions(ctx.tx as Tx, accountOf(ctx))).map(view)
}

export async function registerMyPushSubscription(
  ctx: ServiceContext,
  input: { endpoint: string; p256dh: string; auth: string; user_agent: string }
): Promise<PushSubscription> {
  const row = await registerPushSubscription(ctx.tx as Tx, {
    accountId: accountOf(ctx),
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.user_agent
  })
  return view(row)
}

/** The endpoint of the caller's subscription `id` in this organisation, or null. */
export function myPushEndpoint(ctx: ServiceContext, id: string): Promise<string | null> {
  return ownPushEndpoint(ctx.tx as Tx, { accountId: accountOf(ctx), id })
}

/** Deletes the caller's subscription `id`, or every one of theirs for `endpoint`, in this organisation. */
export function removeMyPushSubscription(
  ctx: ServiceContext,
  which: { id: string } | { endpoint: string }
): Promise<boolean> {
  return removePushSubscription(ctx.tx as Tx, { accountId: accountOf(ctx), ...which })
}
