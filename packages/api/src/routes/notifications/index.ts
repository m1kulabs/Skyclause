import { log } from '@skyclause/config'
import {
  NOTIFICATION_KINDS,
  type EventType,
  type Notification,
  type Operations,
  type Principal
} from '@skyclause/contracts'
import { accountMemberships, listenEvents, withSystem } from '@skyclause/db'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { principalOf } from '../../middleware/auth'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import {
  countUnread,
  getNotificationPreferences,
  listNotifications,
  markNotificationRead,
  streamProjectIds,
  updateNotificationPreferences
} from '../../services/notifications'
import { SSE_HEARTBEAT_MS, sseResponse } from '../../sse'
import type { ServiceContext } from '../../tenancy'
import type { HandlerEntry } from '../index'

// #156 (c-notifications), #79 §4: session routes with no organisation in the request. An account's items and switches
// are T rows in each organisation it belongs to, so each route runs its service once per current membership, as the
// session filled with that organisation and role, the way `requireOrg` fills it.

/** §5 types the `notifications` consumer turns into items: the stream re-reads when the hub (#175) sees one. */
export const NOTIFICATION_EVENT_TYPES: EventType[] = [
  'bundle.needs_review',
  'bundle.escalated',
  'source.error',
  'review_item.opened'
]
const SNAPSHOT_SIZE = 20
/** How far before the stream opened a re-read still looks, for an item whose transaction commits late. */
const LATE_COMMIT_MS = 60_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Runs `fn` in each organisation the signed-in account is a member of, one transaction at a time. */
async function inEachOrg<T>(c: Context<ApiEnv>, fn: (ctx: ServiceContext, orgId: string) => Promise<T>): Promise<T[]> {
  const session = principalOf(c)
  if (session.kind !== 'session') throw new Error('requireSession must run first')
  const orgs = await withSystem('notifications', (tx) => accountMemberships(tx, session.accountId))
  const results: T[] = []
  for (const org of orgs) {
    const principal: Principal = { ...session, orgId: org.orgId, role: org.role }
    results.push(
      await c.get('deps').withTenant({ orgId: org.orgId, principal }, (tx) => fn({ principal, tx }, org.orgId))
    )
  }
  return results
}

const newestFirst = (a: Notification, b: Notification) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

/** The cursor's item ID; any other cursor is 422 `validation-failed`. */
function cursorId(cursor: string): string {
  const { id } = decodeCursor(cursor)
  if (typeof id === 'string' && UUID.test(id)) return id
  throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
    errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
  })
}

/** A kind reads on while any organisation of the account still delivers it; with none, every kind is on. */
async function preferences(c: Context<ApiEnv>) {
  const perOrg = await inEachOrg(c, getNotificationPreferences)
  return NOTIFICATION_KINDS.map((kind) => ({
    kind,
    enabled: perOrg.length === 0 || perOrg.some((org) => org.some((p) => p.kind === kind && p.enabled))
  }))
}

/**
 * The ticket's stream: `event: snapshot` (`{unread_count, data}`, the latest 20), then `event: notification` for each
 * new item, re-read whenever the hub fires for a consumed type in one of the account's organisations and on every
 * heartbeat. `sseResponse` ends it at 5 minutes; it doesn't resume, so `Last-Event-ID` is ignored.
 */
async function notificationStream(c: Context<ApiEnv>): Promise<Response> {
  // Wall time, as Postgres stamps `created_at`; the test clock is for stamps this API writes.
  const since = new Date(Date.now() - LATE_COMMIT_MS)
  const opening = await inEachOrg(c, async (ctx, orgId) => ({
    orgId,
    projectIds: await streamProjectIds(ctx),
    latest: await listNotifications(ctx, { limit: SNAPSHOT_SIZE }),
    recent: await listNotifications(ctx, { createdAfter: since }),
    unread: await countUnread(ctx)
  }))
  const sent = new Set(opening.flatMap((org) => [...org.latest, ...org.recent].map((item) => item.id)))
  const snapshot = {
    unread_count: opening.reduce((sum, org) => sum + org.unread, 0),
    data: opening
      .flatMap((org) => org.latest)
      .sort(newestFirst)
      .slice(0, SNAPSHOT_SIZE)
  }
  return sseResponse({
    signal: c.req.raw.signal,
    listen: (send) => {
      send({ event: 'snapshot', data: snapshot })
      // One re-read at a time; a trigger during one runs another right after it.
      let reading = false
      let again = false
      const reread = async () => {
        if (reading) return void (again = true)
        reading = true
        try {
          do {
            again = false
            const recent = (await inEachOrg(c, (ctx) => listNotifications(ctx, { createdAfter: since }))).flat()
            for (const item of recent.sort(newestFirst).reverse()) {
              if (sent.has(item.id)) continue
              sent.add(item.id)
              send({ event: 'notification', data: item })
            }
          } while (again)
        } catch (error) {
          log.warn('notification stream re-read failed; the next trigger retries', { error: String(error) })
        } finally {
          reading = false
        }
      }
      const trigger = () => void reread()
      const heartbeat = setInterval(trigger, SSE_HEARTBEAT_MS)
      const unlisten = opening.map(({ orgId, projectIds }) =>
        listenEvents({ orgId, projectIds, types: NOTIFICATION_EVENT_TYPES }, trigger)
      )
      return () => {
        clearInterval(heartbeat)
        for (const stop of unlisten) stop()
      }
    }
  })
}

export const notificationHandlers: {
  listNotifications: HandlerEntry<Operations['listNotifications']>
  streamNotifications: HandlerEntry<Operations['streamNotifications']>
  markNotificationRead: HandlerEntry<Operations['markNotificationRead']>
  getMyNotificationPreferences: HandlerEntry<Operations['getMyNotificationPreferences']>
  updateMyNotificationPreferences: HandlerEntry<Operations['updateMyNotificationPreferences']>
} = {
  listNotifications: {
    handler: async (c) => {
      const { limit, cursor } = c.req.valid('query')
      const beforeId = cursor === undefined ? undefined : cursorId(cursor)
      const perOrg = await inEachOrg(c, async (ctx) => ({
        items: await listNotifications(ctx, { limit: limit + 1, beforeId }),
        unread: await countUnread(ctx)
      }))
      const items = perOrg.flatMap((org) => org.items).sort(newestFirst)
      const unread = perOrg.reduce((sum, org) => sum + org.unread, 0)
      return c.json({ ...page(items, limit, (item) => ({ id: item.id })), unread_count: unread }, 200)
    }
  },
  streamNotifications: {
    handler: async (c) => (await notificationStream(c)) as never
  },
  markNotificationRead: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const now = c.get('deps').now()
      const read = UUID.test(id)
        ? (await inEachOrg(c, (ctx) => markNotificationRead(ctx, { id, now }))).find(Boolean)
        : null
      if (!read) throw new ApiError(404, 'not-found', 'No such notification.')
      return c.json(read, 200)
    }
  },
  getMyNotificationPreferences: {
    handler: async (c) => c.json({ data: await preferences(c) }, 200)
  },
  updateMyNotificationPreferences: {
    handler: async (c) => {
      const body = c.req.valid('json')
      await inEachOrg(c, (ctx) => updateNotificationPreferences(ctx, body))
      return c.json({ data: await preferences(c) }, 200)
    }
  }
}
