import { BundleNeedsReviewEventSchema } from '@skyclause/contracts'
import { call, expireCall, systemPrincipal, withTenant } from '@skyclause/db'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'
import { onEvent } from '../events'
import type { QueueHandler, WorkerPart } from '../server'
import { cloudTasks, type ScheduleTask } from './cloud-tasks'

// #150 c-bundle-lifecycle's worker part: the `expiry-{call_id}` timers on queue `bundle-timers` (#79 §5, CAL-8).

export const BUNDLE_TIMERS = 'bundle-timers'

const ExpiryBody = z.object({ org_id: z.string(), project_id: z.string(), call_id: z.string() })

export function createBundlesPart(schedule: ScheduleTask, now: () => Date = () => new Date()): WorkerPart {
  // `bundle-timers` also carries c-approver-alerts' `sla-{bundle_id}-{level}` (#155), which adds its prefix here.
  const timers: Record<string, QueueHandler> = {
    'expiry-': async ({ body }) => {
      const { org_id, call_id } = ExpiryBody.parse(body)
      const { outcome } = await withTenant({ orgId: org_id, principal: systemPrincipal(BUNDLE_TIMERS) }, (tx) =>
        expireCall(tx, call_id, now())
      )
      // Early by a clock's skew: fail, so Cloud Tasks retries it.
      if (outcome === 'not_due') throw new Error(`call ${call_id} is not due yet`)
    }
  }
  return {
    owner: 'c-bundle-lifecycle',
    queues: {
      [BUNDLE_TIMERS]: async (task) => {
        const prefix = Object.keys(timers).find((p) => task.name?.startsWith(p))
        if (!prefix) throw new Error(`no bundle timer for task ${task.name}`)
        await timers[prefix]!(task)
      }
    },
    events: [
      // A bundle waiting on review gets one expiry timer per call, at its expires_at (D45: no tick reads Postgres).
      onEvent(['bundle.needs_review'], 'bundle-expiry-timers', async (event, tx) => {
        const { call_ids } = BundleNeedsReviewEventSchema.shape.data.parse(event.data)
        const calls = await tx
          .select({ id: call.id, expiresAt: call.expiresAt })
          .from(call)
          .where(inArray(call.id, call_ids))
        for (const c of calls) {
          await schedule({
            queue: BUNDLE_TIMERS,
            name: `expiry-${c.id}`,
            at: c.expiresAt,
            body: { org_id: event.org_id, project_id: event.project_id, call_id: c.id }
          })
        }
      })
    ]
  }
}

export const bundles = createBundlesPart(cloudTasks())
