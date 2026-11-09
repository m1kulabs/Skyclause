import type { Principal } from '@skyclause/contracts'
import { accountOrganisations, withSystem } from '@skyclause/db'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { principalOf } from '../../middleware/auth'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import {
  myPushEndpoint,
  myPushSubscriptions,
  registerMyPushSubscription,
  removeMyPushSubscription
} from '../../services/alerts'
import type { ServiceContext } from '../../tenancy'
import type { Handlers } from '../index'

// #155 (c-approver-alerts): #79 §4's push rows, all session routes. `push_subscription` is T, so a request that names
// a real organisation (D2, `Skyclause-Organization`) acts in it alone; with none, or a name that is no organisation
// (#170's Account › Notifications page sends its `account` segment), it acts in each of the account's current
// memberships, as #156's notification routes do. The VAPID key is global.

const notFound = (detail: string) => new ApiError(404, 'not-found', detail)

/** An organisation a request acts in, with the session filled as `requireOrg` fills it. */
type OrgScope = { orgId: string; principal: Principal }

/** The ID a list cursor holds; a cursor this API didn't issue is 422 `validation-failed`. */
function cursorId(cursor: string): string {
  const { id } = decodeCursor(cursor)
  if (typeof id === 'string') return id
  throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
    errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
  })
}

/** The organisations this request acts in, and whether the request named one. */
async function scope(c: Context<ApiEnv>): Promise<{ named: boolean; orgs: OrgScope[] }> {
  const session = principalOf(c)
  if (session.kind !== 'session') throw new Error('requireSession must run first')
  const { membership } = c.get('deps')
  const ref = c.req.header('Skyclause-Organization')
  const org = ref ? await membership.organisation(ref) : null
  if (org) {
    const role = await membership.role(session.accountId, org.id)
    if (!role) throw notFound('No such organisation, or you are not a member of it.')
    return { named: true, orgs: [{ orgId: org.id, principal: { ...session, orgId: org.id, role } }] }
  }
  const memberships = await withSystem('push-subscriptions', (tx) => accountOrganisations(tx, session.accountId))
  return {
    named: false,
    orgs: memberships.map(({ orgId, role }) => ({ orgId, principal: { ...session, orgId, role } }))
  }
}

/** Runs `fn` in each organisation of `orgs`, one transaction at a time. */
async function inEach<T>(c: Context<ApiEnv>, orgs: OrgScope[], fn: (ctx: ServiceContext) => Promise<T>): Promise<T[]> {
  const results: T[] = []
  for (const { orgId, principal } of orgs) {
    results.push(await c.get('deps').withTenant({ orgId, principal }, (tx) => fn({ principal, tx })))
  }
  return results
}

/** Oldest row first, one per browser: a browser registered in several organisations lists once, by its first ID. */
function byBrowser<T extends { id: string; endpoint: string }>(rows: T[]): T[] {
  const first = new Map<string, T>()
  for (const row of [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)))
    if (!first.has(row.endpoint)) first.set(row.endpoint, row)
  return [...first.values()]
}

export const alertHandlers: Handlers = {
  listPushSubscriptions: {
    handler: async (c) => {
      const { limit, cursor } = c.req.valid('query')
      const after = cursor ? cursorId(cursor) : undefined
      const { orgs } = await scope(c)
      const rows = byBrowser((await inEach(c, orgs, myPushSubscriptions)).flat()).filter(
        (row) => !after || row.id > after
      )
      return c.json(
        page(rows, limit, (row) => ({ id: row.id })),
        200
      )
    }
  },
  createPushSubscription: {
    handler: async (c) => {
      const body = c.req.valid('json')
      const { orgs } = await scope(c)
      const [first] = byBrowser(await inEach(c, orgs, (ctx) => registerMyPushSubscription(ctx, body)))
      if (!first) throw notFound('You are not a member of any organisation to get alerts from.')
      return c.json(first, 201)
    }
  },
  deletePushSubscription: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { named, orgs } = await scope(c)
      const endpoint = (await inEach(c, orgs, (ctx) => myPushEndpoint(ctx, id))).find(Boolean)
      if (!endpoint) throw notFound('No such device of yours.')
      // Named: that organisation's row; otherwise the browser leaves every organisation of the account.
      await inEach(c, orgs, (ctx) => removeMyPushSubscription(ctx, named ? { id } : { endpoint }))
      return c.body(null, 204)
    }
  },
  getVapidPublicKey: {
    handler: async (c) => {
      const key = c.get('deps').config().vapidPublicKey
      if (!key)
        throw new ApiError(503, 'feature-off', 'Web push is off until the vapid-keys job has made its key pair.')
      return c.json({ public_key: key }, 200)
    }
  }
}
