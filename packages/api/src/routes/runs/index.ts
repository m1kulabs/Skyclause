import type { Operations } from '@skyclause/contracts'
import { createRun, getRun, listRuns } from '../../services/runs'
import { inTenant } from '../../tenancy'
import type { HandlerEntry } from '../index'

// #151, #79 §4: c-run-orchestrator's `/v1` operations. Mount-all has already checked the statement (reads
// `project.view`, POST `run.request`) and, for the POST, the Idempotency-Key.

export const runHandlers: {
  listRuns: HandlerEntry<Operations['listRuns']>
  createRun: HandlerEntry<Operations['createRun']>
  getRun: HandlerEntry<Operations['getRun']>
} = {
  listRuns: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      return c.json(await inTenant(c, (ctx) => listRuns(ctx, { projectId: id, ...query })), 200)
    }
  },
  createRun: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const idempotencyKey = c.req.valid('header')['Idempotency-Key']
      const now = c.get('deps').now()
      return c.json(
        await inTenant(c, (ctx) =>
          createRun(ctx, { projectId: id, pack: body.pack, windowIds: body.window_ids, idempotencyKey, now })
        ),
        202
      )
    }
  },
  getRun: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await inTenant(c, (ctx) => getRun(ctx, { id })), 200)
    }
  }
}
