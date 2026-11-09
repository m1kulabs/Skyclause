import type { EventEnvelope, EventType, Operations } from '@skyclause/contracts'
import { listenEvents } from '@skyclause/db'
import { sseResponse } from '../../sse'
import {
  getBundle,
  getCall,
  getCallExplanation,
  listProjectBundles,
  listProjectCalls,
  visibleProject
} from '../../services/bundles'
import { inTenant } from '../../tenancy'
import type { HandlerEntry } from '../index'

// #150, #79 §4: c-bundle-lifecycle's `/v1` reads. Mount-all has already checked `project.view` in the organisation.

/** The bundle stream's event types (§5 bundle rows, as the contract's `BundleEvent`). */
export const BUNDLE_EVENT_TYPES: EventType[] = [
  'bundle.drafted',
  'bundle.needs_review',
  'bundle.superseded',
  'bundle.expired',
  'bundle.escalated',
  'bundle.approved'
]

/**
 * D33's permalink host: under `HOST_MODE=multi` the marketing origin, which `loadEnv` requires then (§4 Hosts); else
 * the one origin the request came to.
 */
const permalinkOrigin = (url: string) =>
  (process.env.HOST_MODE === 'multi' && process.env.MARKETING_ORIGIN) || new URL(url).origin

export const bundleHandlers: {
  listProjectBundles: HandlerEntry<Operations['listProjectBundles']>
  streamBundles: HandlerEntry<Operations['streamBundles']>
  getBundle: HandlerEntry<Operations['getBundle']>
  listProjectCalls: HandlerEntry<Operations['listProjectCalls']>
  getCall: HandlerEntry<Operations['getCall']>
  getCallExplanation: HandlerEntry<Operations['getCallExplanation']>
} = {
  listProjectBundles: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      return c.json(await inTenant(c, (ctx) => listProjectBundles(ctx, { projectId: id, ...query })), 200)
    }
  },
  streamBundles: {
    // §5: `id: <seq>` per project; `Last-Event-ID` is `afterSeq`, which the hub (#175) replays before live events.
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const lastEventId = c.req.valid('header')['Last-Event-ID']
      await inTenant(c, (ctx) => visibleProject(ctx, id))
      const orgId = c.get('orgId')!
      return sseResponse({
        signal: c.req.raw.signal,
        listen: (send) =>
          listenEvents(
            {
              orgId,
              projectIds: [id],
              types: BUNDLE_EVENT_TYPES,
              ...(lastEventId === undefined ? {} : { afterSeq: Number(lastEventId) })
            },
            // The hub's envelope carries the event's per-project `seq` (§5); ListenEvents' type doesn't declare it.
            (event: EventEnvelope & { seq?: number }) => {
              const { seq, ...envelope } = event
              send({ seq, event: envelope.type, data: envelope })
            }
          )
      }) as never
    }
  },
  getBundle: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await inTenant(c, (ctx) => getBundle(ctx, { id })), 200)
    }
  },
  listProjectCalls: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { window_id: windowId, ...query } = c.req.valid('query')
      return c.json(await inTenant(c, (ctx) => listProjectCalls(ctx, { projectId: id, windowId, ...query })), 200)
    }
  },
  getCall: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await inTenant(c, (ctx) => getCall(ctx, { id, origin: permalinkOrigin(c.req.url) })), 200)
    }
  },
  getCallExplanation: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await inTenant(c, (ctx) => getCallExplanation(ctx, { id })), 200)
    }
  }
}
