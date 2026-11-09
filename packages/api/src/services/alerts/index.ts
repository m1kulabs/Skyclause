import type { Page, PushSubscription } from '@skyclause/contracts'
import {
  listPushSubscriptions as listRows,
  registerPushSubscription,
  removePushSubscription,
  type pushSubscription,
  type Tx
} from '@skyclause/db'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

// #155 (c-approver-alerts): an approver's web push devices (D28), one per browser, in the organisation the request
// names (`push_subscription` is T). Only the caller's own rows are visible to these services.

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

export async function listMyPushSubscriptions(
  ctx: ServiceContext,
  input: { limit: number; cursor?: string }
): Promise<Page<PushSubscription>> {
  const after = input.cursor ? decodeCursor(input.cursor).id : undefined
  const rows = await listRows(ctx.tx as Tx, {
    accountId: accountOf(ctx),
    limit: input.limit,
    after: typeof after === 'string' ? after : undefined
  })
  return page(rows.map(view), input.limit, (row) => ({ id: row.id }))
}

export async function createMyPushSubscription(
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
  if (!row) {
    throw new ApiError(422, 'validation-failed', 'This browser already gets alerts for another organisation.', {
      errors: [{ in: 'body', pointer: '/endpoint', detail: 'Remove this device in the other organisation first.' }]
    })
  }
  return view(row)
}

export async function deleteMyPushSubscription(ctx: ServiceContext, id: string): Promise<void> {
  if (!(await removePushSubscription(ctx.tx as Tx, { accountId: accountOf(ctx), id }))) {
    throw new ApiError(404, 'not-found', 'No such device of yours.')
  }
}
